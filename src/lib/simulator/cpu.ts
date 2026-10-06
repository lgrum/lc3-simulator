import { Bus } from "./bus";
import { installControlDevices } from "./devices/control";
import type { StepEvent } from "./events";
import { buildDispatchTable } from "./isa/dispatch";
import type { Cpu as ICpu, CpuException, IsaDefinition } from "./isa/types";
import { captureControl, createMachineState } from "./state";
import type { MachineState } from "./state";

const USER_MODE = 0x8000;
const EXCEPTION_VECTORS = {
  privilege: 0x0100,
  "illegal-opcode": 0x0101,
  "access-violation": 0x0102,
} as const;
class InstructionAborted extends Error {
  constructor(readonly exception: CpuException) {
    super(exception);
  }
}
export class Cpu implements ICpu {
  readonly dispatch;
  private instructionAddress: number | undefined;
  private regWrites: StepEvent["regWrites"] | undefined;
  constructor(
    readonly isa: IsaDefinition,
    readonly state: MachineState = createMachineState(),
    readonly bus = new Bus(state.memory),
    options: { strictAccess?: boolean } = {},
  ) {
    if (state.regs.length !== 8)
      throw new RangeError("LC-3 requires eight general-purpose registers");
    if (bus.memory !== state.memory)
      throw new Error("CPU and bus must use the same memory");
    this.dispatch = buildDispatchTable(isa);
    installControlDevices(bus, state);
    bus.configureProtection(
      isa.memoryMap,
      () => this.psr,
      () => this.raise("access-violation"),
      options.strictAccess ?? true,
    );
  }
  get pc(): number {
    return this.state.pc;
  }
  set pc(value: number) {
    this.state.pc = value & 0xffff;
  }
  get psr(): number {
    return this.state.psr;
  }
  set psr(value: number) {
    this.state.psr = value & 0xffff;
  }
  reg(n: number): number {
    return this.state.regs[n];
  }
  setReg(n: number, value: number): void {
    const before = this.reg(n);
    this.state.regs[n] = value;
    if (before !== this.reg(n))
      this.regWrites?.push({ reg: n, before, after: this.reg(n) });
  }
  setCC(value: number): void {
    const word = value & 0xffff;
    this.psr = (this.psr & ~7) | (word === 0 ? 2 : word & 0x8000 ? 4 : 1);
  }
  read(address: number): number {
    return this.bus.read(address);
  }
  write(address: number, value: number): void {
    this.bus.write(address, value);
  }
  trap(vector: number): void {
    this.enterSupervisor(vector & 0xff, this.pc);
  }
  returnFromInterrupt(): void {
    if (this.psr & USER_MODE) this.raise("privilege");
    this.pc = this.read(this.reg(6));
    this.setReg(6, this.reg(6) + 1);
    const savedPsr = this.read(this.reg(6));
    this.setReg(6, this.reg(6) + 1);
    this.psr = savedPsr;
    if (this.psr & USER_MODE) {
      this.state.savedSSP = this.reg(6);
      this.setReg(6, this.state.savedUSP);
    }
  }
  raise(exception: CpuException): never {
    const address = this.instructionAddress ?? (this.pc - 1) & 0xffff;
    this.enterSupervisor(EXCEPTION_VECTORS[exception], address);
    throw new InstructionAborted(exception);
  }
  step(): StepEvent | null {
    if (!(this.state.mcr & 0x8000)) return null;
    const stateBefore = captureControl(this.state);
    const event: StepEvent = {
      pc: this.pc,
      word: null,
      mnemonic: "",
      regWrites: [],
      memWrites: [],
      psrBefore: this.psr,
      psrAfter: this.psr,
      stateBefore,
      stateAfter: stateBefore,
    };
    this.regWrites = event.regWrites;
    this.bus.beginStep();
    this.instructionAddress = this.pc;
    try {
      const interrupt = this.bus.pendingInterrupt((this.psr >>> 8) & 7);
      if (interrupt) {
        event.interrupt = interrupt.vector;
        event.mnemonic = "INTERRUPT";
        this.enterSupervisor(
          0x100 | interrupt.vector,
          this.pc,
          interrupt.priority,
        );
      } else {
        const word = this.read(this.pc);
        event.word = word;
        this.state.ir = word;
        this.pc += 1;
        const instruction = this.dispatch[word >>> 12](word);
        if (!instruction) this.raise("illegal-opcode");
        event.mnemonic = instruction.mnemonic;
        event.flow = instruction.flow;
        instruction.execute(this, instruction.decode(word));
      }
    } catch (error) {
      if (!(error instanceof InstructionAborted)) throw error;
      event.exception = error.exception;
      if (!event.mnemonic) event.mnemonic = "EXCEPTION";
    } finally {
      Object.assign(event, this.bus.endStep());
      this.regWrites = undefined;
      this.instructionAddress = undefined;
    }
    event.psrAfter = this.psr;
    event.stateAfter = captureControl(this.state);
    if (!(this.state.mcr & 0x8000)) event.halted = true;
    return event;
  }
  private enterSupervisor(
    vectorAddress: number,
    returnAddress: number,
    priority?: number,
  ): void {
    const savedPsr = this.psr;
    if (savedPsr & USER_MODE) {
      this.state.savedUSP = this.reg(6);
      this.setReg(6, this.state.savedSSP);
    }
    this.psr = savedPsr & ~USER_MODE;
    if (priority !== undefined)
      this.psr = (this.psr & ~0x0700) | (priority << 8);
    this.setReg(6, this.reg(6) - 1);
    this.write(this.reg(6), savedPsr);
    this.setReg(6, this.reg(6) - 1);
    this.write(this.reg(6), returnAddress);
    this.pc = this.read(vectorAddress);
  }
}
