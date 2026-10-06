import type { LoadedProgram } from "../assembler/types";
import { Bus } from "./bus";
import { Cpu } from "./cpu";
import { Debugger } from "./debugger";
import type {
  Breakpoint,
  BreakpointId,
  PauseReason,
  WatchId,
  WatchKind,
  Watchpoint,
} from "./debugger";
import { installDisplay } from "./devices/display";
import { Keyboard } from "./devices/keyboard";
import type { StepEvent } from "./events";
import { History } from "./history";
import { LC3 } from "./isa/lc3";
import type { IsaDefinition } from "./isa/types";
import { assembleOs } from "./os/load";
import { createMachineState, restoreControl, captureControl } from "./state";

export type {
  LoadedProgram,
  StepEvent,
  Breakpoint,
  BreakpointId,
  PauseReason,
  WatchId,
  WatchKind,
  Watchpoint,
};
export type Unsubscribe = () => void;
export type RegisterName =
  | "R0"
  | "R1"
  | "R2"
  | "R3"
  | "R4"
  | "R5"
  | "R6"
  | "R7"
  | "PC"
  | "IR"
  | "PSR"
  | "MCR"
  | "USP"
  | "SSP";
export type DisassembledWord = {
  addr: number;
  word: number;
  label?: string;
  text: string;
  source?: "program" | "os";
  sourceLine?: number;
};
export type MachineSnapshot = {
  regs: ReadonlyArray<number>;
  pc: number;
  ir: number;
  psr: number;
  mcr: number;
  privilege: "user" | "supervisor";
  priority: number;
  n: boolean;
  z: boolean;
  p: boolean;
  savedUSP: number;
  savedSSP: number;
  output: string;
  status: "paused" | "running" | "halted";
  pauseReason: PauseReason | null;
  /** Whether stepBack() has history to undo. */
  canStepBack: boolean;
  version: number;
};
export type Scheduler = {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => Unsubscribe;
};
export type ControllerOptions = {
  isa?: IsaDefinition;
  strictAccess?: boolean;
  historyLimit?: number;
  os?: LoadedProgram | false;
  scheduler?: Scheduler;
};

const defaultScheduler: Scheduler = {
  now: () => performance.now(),
  schedule: (callback, delay) => {
    if (delay <= 0 && typeof requestAnimationFrame === "function") {
      const id = requestAnimationFrame(callback);
      return () => cancelAnimationFrame(id);
    }
    const id = setTimeout(callback, delay);
    return () => clearTimeout(id);
  },
};

/** Headless engine. Construction is explicit; it starts no timer until run(). */
class Controller {
  private readonly isa: IsaDefinition;
  private readonly state = createMachineState();
  private readonly bus = new Bus(this.state.memory);
  private readonly cpu: Cpu;
  private readonly keyboard: Keyboard;
  private readonly debugger = new Debugger();
  private readonly history: History;
  private readonly scheduler: Scheduler;
  private readonly os: LoadedProgram | undefined;
  private image: LoadedProgram | undefined;
  private symbols = new Map<number, string>();
  private namedSymbols = new Map<string, number>();
  private readonly sourceMap = new Map<
    number,
    { source: "program" | "os"; sourceLine: number }
  >();
  private readonly subscribers = new Set<() => void>();
  private readonly outputSubscribers = new Set<(chars: string) => void>();
  private status: MachineSnapshot["status"] = "paused";
  private pauseReason: PauseReason | null = null;
  private version = 0;
  private snapshot: MachineSnapshot | undefined;
  private speed: number | "max" = "max";
  private cancelScheduled: Unsubscribe | undefined;
  private credit = 1;
  private lastTime = 0;
  private continueAfterInput = false;

  constructor(options: ControllerOptions = {}) {
    this.isa = options.isa ?? LC3;
    this.cpu = new Cpu(this.isa, this.state, this.bus, {
      strictAccess: options.strictAccess,
    });
    this.keyboard = new Keyboard(this.state, this.bus);
    installDisplay(this.bus, this.state);
    this.bus.onAccess((access) => this.debugger.access(access));
    this.history = new History(options.historyLimit);
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.os =
      options.os === false
        ? undefined
        : structuredClone(options.os ?? assembleOs());
    this.initialize(false);
  }
  private changed(): void {
    this.version++;
    this.snapshot = undefined;
  }
  private notify(): void {
    for (const callback of this.subscribers) callback();
  }
  private output(chars: string): void {
    if (chars) for (const callback of this.outputSubscribers) callback(chars);
  }
  private isRunning(): boolean {
    return this.status === "running";
  }
  private cancelTimer(): void {
    this.cancelScheduled?.();
    this.cancelScheduled = undefined;
  }
  private initialize(keepMemory: boolean): void {
    this.cancelTimer();
    const initial = createMachineState();
    this.state.regs.set(initial.regs);
    restoreControl(this.state, captureControl(initial));
    if (!keepMemory) {
      this.state.memory.fill(0);
      for (const image of [this.os, this.image]) {
        if (image)
          for (let i = 0; i < image.words.length; i++)
            this.state.memory[(image.origin + i) & 0xffff] = image.words[i];
      }
    }
    this.cpu.pc = this.image?.origin ?? this.isa.memoryMap.userStart;
    this.state.savedSSP = this.isa.memoryMap.userStart;
    this.state.savedUSP = this.isa.memoryMap.userEnd;
    if (
      this.cpu.pc >= this.isa.memoryMap.userStart &&
      this.cpu.pc <= this.isa.memoryMap.userEnd
    ) {
      this.cpu.psr = 0x8002;
      this.state.regs[6] = this.state.savedUSP;
    } else this.state.regs[6] = this.state.savedSSP;
    this.debugger.reset();
    this.history.clear();
    this.continueAfterInput = false;
    this.status = "paused";
    this.pauseReason = null;
    this.symbols.clear();
    this.namedSymbols.clear();
    this.sourceMap.clear();
    for (const [source, image] of [
      ["os", this.os],
      ["program", this.image],
    ] as const) {
      if (!image) continue;
      // An image owns the words it loads, including their labels and source
      // lines, even if it has no entry of its own for a word.
      const owned = new Set<number>();
      for (let i = 0; i < image.words.length; i++)
        owned.add((image.origin + i) & 0xffff);
      for (const addr of owned) {
        this.symbols.delete(addr);
        this.sourceMap.delete(addr);
      }
      for (const [name, addr] of this.namedSymbols)
        if (owned.has(addr)) this.namedSymbols.delete(name);
      for (const [name, addr] of image.symbols) {
        this.symbols.set(addr, name);
        this.namedSymbols.set(name.toUpperCase(), addr);
      }
      for (const [addr, sourceLine] of image.sourceMap)
        this.sourceMap.set(addr, { source, sourceLine });
    }
    this.changed();
  }
  load(image: LoadedProgram): void {
    if (
      !Number.isInteger(image.origin) ||
      image.origin < 0 ||
      image.origin > 0xffff ||
      image.words.length > 0x10000
    )
      throw new RangeError("Invalid program image");
    this.image = structuredClone(image);
    this.initialize(false);
    this.notify();
  }
  reset(opts: { keepMemory?: boolean } = {}): void {
    this.initialize(opts.keepMemory ?? false);
    this.notify();
  }
  private stop(reason: PauseReason, wasRunning = this.isRunning()): void {
    this.cancelTimer();
    this.status = reason === "halted" ? "halted" : "paused";
    this.pauseReason = reason;
    this.continueAfterInput = reason === "waiting-for-input" && wasRunning;
    if (reason !== "waiting-for-input") this.debugger.cancelMode();
    this.changed();
  }
  private start(keepMode = false): void {
    if (!(this.state.mcr & 0x8000)) {
      this.stop("halted");
      this.notify();
      return;
    }
    if (!keepMode) this.debugger.cancelMode();
    this.debugger.resume(this.cpu.pc);
    this.cancelTimer();
    this.status = "running";
    this.pauseReason = null;
    this.continueAfterInput = false;
    this.credit = 1;
    this.lastTime = this.scheduler.now();
    this.changed();
    this.notify();
    if (this.isRunning()) this.schedule();
  }
  run(): void {
    if (!this.isRunning()) this.start();
  }
  pause(): void {
    this.stop("user-pause");
    this.notify();
  }
  private schedule(delay = 0): void {
    this.cancelScheduled = this.scheduler.schedule(() => {
      this.cancelScheduled = undefined;
      this.slice();
    }, delay);
  }
  private execute(
    checkpoint = this.debugger.checkpoint(),
  ): { event: StepEvent; reason?: PauseReason } | null {
    this.debugger.beginStep();
    const event = this.cpu.step();
    if (!event) return null;
    this.history.push(event, checkpoint);
    const reason = this.debugger.after(event, this.state);
    this.changed();
    return { event, reason };
  }
  private slice(): void {
    if (!this.isRunning()) return;
    const now = this.scheduler.now(),
      end = now + 8;
    if (this.speed !== "max")
      this.credit = Math.min(
        Math.max(1, this.speed * 0.05),
        this.credit + ((now - this.lastTime) * this.speed) / 1000,
      );
    this.lastTime = now;
    let output = "",
      steps = 0;
    try {
      while (
        this.isRunning() &&
        steps < 10000 &&
        this.scheduler.now() < end &&
        (this.speed === "max" || this.credit >= 1)
      ) {
        const checkpoint = this.debugger.checkpoint();
        const before = this.debugger.before(this.state);
        if (before) {
          this.stop(before);
          break;
        }
        const result = this.execute(checkpoint);
        if (!result) {
          this.stop("halted");
          break;
        }
        steps++;
        if (this.speed !== "max") this.credit--;
        output += result.event.output ?? "";
        if (result.reason) {
          this.stop(result.reason);
          break;
        }
      }
    } catch (error) {
      this.stop("user-pause");
      this.output(output);
      this.notify();
      throw error;
    }
    this.output(output);
    if (steps || !this.isRunning()) this.notify();
    if (this.isRunning() && !this.cancelScheduled)
      this.schedule(
        this.speed === "max"
          ? 0
          : Math.max(0, ((1 - this.credit) * 1000) / this.speed),
      );
  }
  stepInto(): StepEvent {
    this.cancelTimer();
    this.debugger.cancelMode();
    this.status = "paused";
    this.continueAfterInput = false;
    const result = this.execute();
    if (!result) {
      this.stop("halted", false);
      this.notify();
      throw new Error("Machine clock is stopped");
    }
    this.stop(result.reason ?? "step-complete", false);
    this.output(result.event.output ?? "");
    this.notify();
    return result.event;
  }
  stepOver(): void {
    const word = this.bus.peek(this.cpu.pc),
      instruction = this.cpu.dispatch[word >>> 12](word);
    if (instruction?.flow !== "call") {
      this.stepInto();
      return;
    }
    this.debugger.over(this.cpu.pc + 1);
    this.start(true);
  }
  stepOut(): void {
    this.debugger.out();
    this.start(true);
  }
  runTo(address: number): void {
    this.debugger.runTo(address);
    this.start(true);
  }
  stepBack(): StepEvent | null {
    this.cancelTimer();
    const entry = this.history.undo(this.state, this.bus);
    if (!entry) {
      this.stop("step-complete", false);
      this.notify();
      return null;
    }
    this.debugger.restore(entry.debuggerBefore);
    this.stop("step-complete", false);
    this.notify();
    return entry.event;
  }
  setSpeed(ips: number | "max"): void {
    if (ips !== "max" && (!Number.isFinite(ips) || ips <= 0))
      throw new RangeError("Speed must be positive or max");
    this.speed = ips;
    if (this.isRunning()) {
      this.cancelTimer();
      this.credit = 1;
      this.lastTime = this.scheduler.now();
      this.schedule();
    }
  }
  readonly breakpoints = {
    add: (
      addr: number,
      opts?: { condition?: string; hitCount?: number },
    ): BreakpointId => {
      const id = this.debugger.breakpoints.add(addr, opts);
      this.changed();
      this.notify();
      return id;
    },
    remove: (id: BreakpointId): void => {
      this.debugger.breakpoints.remove(id);
      this.changed();
      this.notify();
    },
    toggle: (addr: number): void => {
      this.debugger.breakpoints.toggle(addr);
      this.changed();
      this.notify();
    },
    setEnabled: (id: BreakpointId, enabled: boolean): void => {
      this.debugger.breakpoints.setEnabled(id, enabled);
      this.changed();
      this.notify();
    },
    list: (): ReadonlyArray<Breakpoint> => this.debugger.breakpoints.list(),
  };
  readonly watchpoints = {
    add: (addr: number, kind: WatchKind): WatchId => {
      const id = this.debugger.watchpoints.add(addr, kind);
      this.changed();
      this.notify();
      return id;
    },
    remove: (id: WatchId): void => {
      this.debugger.watchpoints.remove(id);
      this.changed();
      this.notify();
    },
    list: (): ReadonlyArray<Watchpoint> => this.debugger.watchpoints.list(),
  };
  getSnapshot(): MachineSnapshot {
    this.snapshot ??= Object.freeze({
      regs: Object.freeze(Array.from(this.state.regs)),
      pc: this.state.pc,
      ir: this.state.ir,
      psr: this.state.psr,
      mcr: this.state.mcr,
      privilege: this.state.psr & 0x8000 ? "user" : "supervisor",
      priority: (this.state.psr >>> 8) & 7,
      n: Boolean(this.state.psr & 4),
      z: Boolean(this.state.psr & 2),
      p: Boolean(this.state.psr & 1),
      savedUSP: this.state.savedUSP,
      savedSSP: this.state.savedSSP,
      output: this.state.display.output,
      status: this.status,
      pauseReason: this.pauseReason,
      canStepBack: this.history.length > 0,
      version: this.version,
    });
    return this.snapshot;
  }
  readMemory(start: number, count: number): Uint16Array {
    if (
      !Number.isInteger(start) ||
      start < 0 ||
      start > 0xffff ||
      !Number.isInteger(count) ||
      count < 0 ||
      start + count > 0x10000
    )
      throw new RangeError("Memory window must stay within 65,536 words");
    this.bus.refreshDevices(start, count);
    return this.state.memory.subarray(start, start + count);
  }
  disassemble(addr: number): DisassembledWord {
    addr &= 0xffff;
    const word = this.bus.peek(addr),
      instruction = this.cpu.dispatch[word >>> 12](word);
    return {
      addr,
      word,
      label: this.symbols.get(addr),
      ...this.sourceMap.get(addr),
      text: instruction
        ? instruction.disassemble(instruction.decode(word), {
            pc: addr,
            symbols: this.symbols,
          })
        : ".FILL x" + word.toString(16).padStart(4, "0").toUpperCase(),
    };
  }
  lookupSymbol(nameOrAddr: string | number): number | string | undefined {
    return typeof nameOrAddr === "number"
      ? this.symbols.get(nameOrAddr & 0xffff)
      : this.namedSymbols.get(nameOrAddr.toUpperCase());
  }
  getTrace(limit: number): ReadonlyArray<StepEvent> {
    return this.history.trace(limit);
  }
  writeRegister(reg: RegisterName, value: number): void {
    this.cancelTimer();
    this.debugger.cancelMode();
    this.history.clear();
    this.debugger.clearPolling();
    this.continueAfterInput = false;
    if (/^R[0-7]$/.test(reg)) this.cpu.setReg(Number(reg[1]), value);
    else if (reg === "PC") this.cpu.pc = value;
    else if (reg === "PSR") this.cpu.psr = value;
    else if (reg === "IR") this.state.ir = value & 0xffff;
    else if (reg === "MCR") this.bus.restore(0xfffe, value);
    else if (reg === "USP") this.state.savedUSP = value & 0xffff;
    else if (reg === "SSP") this.state.savedSSP = value & 0xffff;
    else throw new RangeError("Unknown register");
    this.status = this.state.mcr & 0x8000 ? "paused" : "halted";
    this.pauseReason = this.status === "halted" ? "halted" : "user-pause";
    this.changed();
    this.notify();
  }
  writeMemory(addr: number, value: number): void {
    this.cancelTimer();
    this.debugger.cancelMode();
    this.history.clear();
    this.debugger.clearPolling();
    this.continueAfterInput = false;
    // Debugger edits are privileged and do not execute a CPU instruction.
    const psr = this.cpu.psr;
    const outputStart = this.state.display.output.length;
    this.cpu.psr &= ~0x8000;
    try {
      this.bus.write(addr, value);
    } finally {
      if ((addr & 0xffff) !== 0xfffc) this.cpu.psr = psr;
    }
    this.status = this.state.mcr & 0x8000 ? "paused" : "halted";
    this.pauseReason = this.status === "halted" ? "halted" : "user-pause";
    this.changed();
    this.output(this.state.display.output.slice(outputStart));
    this.notify();
  }
  input(chars: string): void {
    const resume = this.continueAfterInput;
    this.keyboard.input(chars);
    // External edits and input start a new undo timeline.
    this.history.clear();
    this.changed();
    if (resume && this.keyboard.ready) this.start(true);
    else this.notify();
  }
  onOutput(callback: (chars: string) => void): Unsubscribe {
    this.outputSubscribers.add(callback);
    return () => {
      this.outputSubscribers.delete(callback);
    };
  }
  subscribe(callback: () => void): Unsubscribe {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }
}
/** Public API is structural, so a future worker proxy can implement it. */
export type MachineController = Pick<Controller, keyof Controller>;
export const MachineController = Controller;
export function createMachineController(
  options: ControllerOptions = {},
): MachineController {
  return new Controller(options);
}
