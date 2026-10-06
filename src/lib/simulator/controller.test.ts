import { describe, expect, it } from "vite-plus/test";
import { assemble } from "../assembler/assembler";
import { tokenize } from "../assembler/lexer";
import { parse } from "../assembler/parser";
import { MachineController } from "./controller";
import type { ControllerOptions, Scheduler } from "./controller";
import { LC3 } from "./isa/lc3";

function fixture(source: string, options: ControllerOptions = {}) {
  let time = 0;
  const jobs: Array<{ callback: () => void; delay: number; active: boolean }> =
    [];
  const scheduler: Scheduler = {
    now: () => time,
    schedule: (callback, delay) => {
      const job = { callback, delay, active: true };
      jobs.push(job);
      return () => {
        job.active = false;
      };
    },
  };
  const machine = new MachineController({ ...options, scheduler });
  machine.load(
    assemble(parse(tokenize(".ORIG x3000\n" + source + "\n.END\n"))),
  );
  const tick = () => {
    const index = jobs.findIndex((job) => job.active);
    if (index < 0) return false;
    const [job] = jobs.splice(index, 1);
    time += job.delay;
    job.callback();
    return true;
  };
  const flush = () => {
    for (let i = 0; i < 200 && tick(); i++);
    if (jobs.some((job) => job.active)) throw new Error("Run did not stop");
  };
  return { machine, tick, flush };
}

describe("review regressions", () => {
  it("does not wait when input arrives between the status read and the loop back edge", () => {
    const { machine, tick, flush } = fixture(
      "POLL LDI R1, STATUS\nBRzp POLL\nADD R2, R2, #1\nHALT\nSTATUS .FILL xFE00",
      { strictAccess: false },
    );
    machine.setSpeed(1);
    machine.run();
    tick();
    expect(machine.getSnapshot()).toMatchObject({
      pc: 0x3001,
      status: "running",
    });
    machine.input("A");
    tick();
    expect(machine.getSnapshot()).toMatchObject({
      pc: 0x3000,
      status: "running",
    });
    flush();
    expect(machine.getSnapshot().status).toBe("halted");
    expect(machine.getSnapshot().regs[2]).toBe(1);
  });
  it("skips the first breakpoint check on run after a manual step", () => {
    const { machine, flush } = fixture("ADD R2, R2, #1\nADD R2, R2, #1\nHALT");
    machine.breakpoints.add(0x3001);
    machine.breakpoints.add(0x3002);
    machine.stepInto();
    machine.run();
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      pc: 0x3002,
      pauseReason: "breakpoint",
    });
    expect(machine.getSnapshot().regs[2]).toBe(2);
  });
  it("skips the first breakpoint check on step over and step out", () => {
    const { machine, flush } = fixture(
      "ADD R2, R2, #1\nJSR SUB\nHALT\nSUB ADD R2, R2, #1\nRET",
    );
    machine.breakpoints.add(0x3001);
    machine.breakpoints.add(0x3003);
    machine.stepInto();
    machine.stepOver();
    flush();
    // The breakpoint inside the call must still stop execution.
    expect(machine.getSnapshot()).toMatchObject({
      pc: 0x3003,
      pauseReason: "breakpoint",
    });
    machine.stepInto();
    machine.breakpoints.add(0x3004);
    machine.stepOut();
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      pc: 0x3002,
      pauseReason: "step-complete",
    });
    expect(machine.getSnapshot().regs[2]).toBe(2);
  });
  it.each(["step-back", "register-edit", "memory-edit"])(
    "skips the first breakpoint after %s",
    (action) => {
      const { machine, flush } = fixture(
        "ADD R2, R2, #1\nADD R2, R2, #1\nHALT",
      );
      machine.breakpoints.add(0x3001);
      machine.stepInto();
      if (action === "step-back") {
        machine.stepInto();
        machine.stepBack();
      } else if (action === "register-edit") machine.writeRegister("R3", 42);
      else machine.writeMemory(0x4000, 42);
      machine.runTo(0x3002);
      flush();
      expect(machine.getSnapshot().pc).toBe(0x3002);
      expect(machine.getSnapshot().regs[2]).toBe(2);
    },
  );
  it("runs to the next visit of the current PC", () => {
    const { machine, flush } = fixture("ADD R2, R2, #1\nBR #-2");
    machine.breakpoints.add(0x3000);
    machine.runTo(0x3000);
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      pc: 0x3000,
      pauseReason: "step-complete",
    });
    expect(machine.getSnapshot().regs[2]).toBe(1);
  });
  it("does not wait after a single empty KBSR check", () => {
    const { machine, flush } = fixture(
      "LDI R1, STATUS\nADD R2, R2, #1\nHALT\nSTATUS .FILL xFE00",
      { strictAccess: false },
    );
    machine.run();
    flush();
    expect(machine.getSnapshot().status).toBe("halted");
    expect(machine.getSnapshot().regs[2]).toBe(1);
  });
  it("does not wait in a loop that does work between keyboard checks", () => {
    const { machine } = fixture(
      "POLL LDI R1, STATUS\nADD R2, R2, #1\nBR POLL\nSTATUS .FILL xFE00",
      { strictAccess: false },
    );
    const reasons = Array.from({ length: 6 }, () => {
      machine.stepInto();
      return machine.getSnapshot().pauseReason;
    });
    expect(reasons).toEqual(Array(6).fill("step-complete"));
    expect(machine.getSnapshot().regs[2]).toBe(2);
  });
  it("waits at the second matching status read and resumes when a key arrives", () => {
    const { machine, flush } = fixture(
      "POLL LDI R1, STATUS\nBRzp POLL\nADD R2, R2, #1\nHALT\nSTATUS .FILL xFE00",
      { strictAccess: false },
    );
    machine.run();
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      pc: 0x3001,
      pauseReason: "waiting-for-input",
    });
    expect(machine.getTrace(99)).toHaveLength(3);
    machine.input("A");
    flush();
    expect(machine.getSnapshot().status).toBe("halted");
    expect(machine.getSnapshot().regs[2]).toBe(1);
  });
  it("reports the source owner of OS and user lines", () => {
    const { machine } = fixture("HALT");
    const os = machine.disassemble(0x25);
    const program = machine.disassemble(0x3000);
    expect(os).toMatchObject({ source: "os", sourceLine: expect.any(Number) });
    expect(program).toMatchObject({ source: "program", sourceLine: 2 });
    expect(machine.disassemble(0x4000).sourceLine).toBeUndefined();
    machine.stepInto();
    expect(machine.disassemble(machine.getSnapshot().pc)).toMatchObject({
      source: "os",
      sourceLine: expect.any(Number),
    });
  });
  it("removes OS source lines from words overwritten by a user image", () => {
    const { machine } = fixture("HALT");
    const image = {
      origin: 0x25,
      words: [0x1021],
      symbols: new Map<string, number>(),
      sourceMap: new Map<number, number>(),
    };
    machine.load(image);
    expect(machine.disassemble(0x25).sourceLine).toBeUndefined();
    expect(machine.disassemble(0x25).source).toBeUndefined();
    image.sourceMap.set(0x25, 99);
    machine.load(image);
    expect(machine.disassemble(0x25)).toMatchObject({
      source: "program",
      sourceLine: 99,
    });
  });
  it("clears the empty-read pulse and restores polling detection after undo", () => {
    const { machine } = fixture(
      "POLL LDI R1, STATUS\nBRzp POLL\nSTATUS .FILL xFE00",
      { strictAccess: false },
    );
    const poll = machine.stepInto();
    expect(poll.stateAfter.keyboard.waiting).toBe(true);
    expect(machine.getSnapshot().pauseReason).toBe("step-complete");
    const branch = machine.stepInto();
    expect(branch.stateAfter.keyboard.waiting).toBe(false);
    expect(machine.getSnapshot().pauseReason).toBe("step-complete");
    machine.stepInto();
    expect(machine.getSnapshot().pauseReason).toBe("waiting-for-input");
    machine.stepBack();
    machine.stepInto();
    expect(machine.getSnapshot().pauseReason).toBe("waiting-for-input");
  });
  it("waits in a poll loop whose flags change and change back", () => {
    const { machine, flush } = fixture(
      "POLL LD R2, PTR\nLDR R1, R2, #0\nBRzp POLL\nADD R3, R3, #1\nHALT\nPTR .FILL xFE00",
      { strictAccess: false },
    );
    machine.run();
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      pc: 0x3002,
      pauseReason: "waiting-for-input",
    });
    machine.input("A");
    flush();
    expect(machine.getSnapshot().status).toBe("halted");
    expect(machine.getSnapshot().regs[3]).toBe(1);
  });
  it("does not wait in a poll loop that writes memory between reads", () => {
    const { machine } = fixture(
      "POLL LDI R1, STATUS\nST R1, SAVE\nBRzp POLL\nSTATUS .FILL xFE00\nSAVE .BLKW #1",
      { strictAccess: false },
    );
    const reasons = Array.from({ length: 9 }, () => {
      machine.stepInto();
      return machine.getSnapshot().pauseReason;
    });
    expect(reasons).toEqual(Array(9).fill("step-complete"));
  });
  it("keeps program registers after HALT and resumes after it", () => {
    const { machine, flush } = fixture(
      [1, 2, 3, 4, 5, 6, 7]
        .map((n, i) => `ADD R${i === 6 ? 7 : i}, R${i === 6 ? 7 : i}, #${n}`)
        .join("\n") + "\nHALT\nADD R2, R2, #1\nHALT",
    );
    machine.run();
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      status: "halted",
      output: "\nHALT\n",
      savedUSP: 0xfdff,
    });
    expect(machine.getSnapshot().regs).toEqual([1, 2, 3, 4, 5, 6, 0, 7]);
    machine.writeRegister("MCR", 0x8000);
    machine.run();
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      status: "halted",
      output: "\nHALT\n\nHALT\n",
    });
    expect(machine.getSnapshot().regs).toEqual([1, 2, 4, 4, 5, 6, 0, 7]);
  });
  it("keeps R0 when the fault handler halts", () => {
    const { machine, flush } = fixture("ADD R0, R0, #5\n.FILL xD000");
    machine.run();
    flush();
    expect(machine.getSnapshot().pauseReason).toBe("exception");
    machine.run();
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      status: "halted",
      output: "LC-3 exception\nHALT\n",
    });
    expect(machine.getSnapshot().regs[0]).toBe(5);
  });
  it("removes OS labels from words overwritten by a user image", () => {
    const { machine } = fixture("HALT");
    const addr = machine.lookupSymbol("OS_GETC") as number;
    const image = {
      origin: addr,
      words: [0x1021],
      symbols: new Map<string, number>(),
      sourceMap: new Map<number, number>(),
    };
    machine.load(image);
    expect(machine.disassemble(addr).label).toBeUndefined();
    expect(machine.lookupSymbol(addr)).toBeUndefined();
    expect(machine.lookupSymbol("OS_GETC")).toBeUndefined();
    expect(machine.lookupSymbol("OS_OUT")).toEqual(expect.any(Number));
    image.symbols.set("MINE", addr);
    machine.load(image);
    expect(machine.disassemble(addr).label).toBe("MINE");
    expect(machine.lookupSymbol("mine")).toBe(addr);
  });
  it("notifies subscribers and changes version when watchpoints change", () => {
    const { machine } = fixture("HALT");
    let notifications = 0;
    machine.subscribe(() => notifications++);
    const before = machine.getSnapshot();
    const id = machine.watchpoints.add(0x4000, "rw");
    expect(notifications).toBe(1);
    expect(machine.getSnapshot().version).toBeGreaterThan(before.version);
    const added = machine.getSnapshot();
    machine.watchpoints.remove(id);
    expect(notifications).toBe(2);
    expect(machine.getSnapshot().version).toBeGreaterThan(added.version);
  });
  it("uses unsigned word values in breakpoint conditions", () => {
    const { machine, flush } = fixture("LOOP BR LOOP");
    machine.writeRegister("R0", 0xffff);
    machine.breakpoints.add(0x3000, { condition: "R0 == -1 || R0 < 0" });
    machine.breakpoints.add(0x3000, {
      condition: "R0 == xFFFF && (R0 & x8000) != 0",
    });
    machine.run();
    flush();
    const points = machine.breakpoints.list();
    expect(points[0].hits).toBe(0);
    expect(points[1].hits).toBe(1);
  });
  it("throws on a stopped clock without adding a false step event", () => {
    const { machine } = fixture("ADD R2, R2, #1");
    machine.writeRegister("MCR", 0);
    expect(() => machine.stepInto()).toThrow("Machine clock is stopped");
    expect(machine.getSnapshot()).toMatchObject({
      status: "halted",
      pauseReason: "halted",
      pc: 0x3000,
    });
    expect(machine.getSnapshot().regs[2]).toBe(0);
    expect(machine.getTrace(99)).toHaveLength(0);
  });
});

describe("controller, devices and real OS", () => {
  it("handles the real keyboard ISR and returns before the next user instruction", () => {
    const { machine, flush } = fixture("ADD R2, R2, #1\nHALT");
    machine.writeMemory(0xfe00, 0x4000);
    machine.input("A");
    machine.run();
    flush();
    expect(machine.getSnapshot().regs[2]).toBe(1);
    expect(machine.getSnapshot().output).toBe("A\nHALT\n");
    const trace = machine.getTrace(4096);
    expect(trace[0]).toMatchObject({ pc: 0x3000, word: null, interrupt: 0x80 });
    expect(
      trace.some(
        (event) =>
          event.mnemonic === "RTI" &&
          event.stateAfter.pc === 0x3000 &&
          event.psrAfter === 0x8002,
      ),
    ).toBe(true);
  });
  it("stops max-speed work at the time limit and sends one slice notification", () => {
    let clock = 0;
    let callback: (() => void) | undefined;
    const machine = new MachineController({
      os: false,
      scheduler: {
        now: () => clock++,
        schedule: (cb) => {
          callback = cb;
          return () => {
            callback = undefined;
          };
        },
      },
    });
    machine.load(assemble(parse(tokenize(".ORIG x3000\nBR #-1\n.END\n"))));
    let notifications = 0;
    machine.subscribe(() => notifications++);
    machine.run();
    notifications = 0;
    callback?.();
    expect(machine.getTrace(99)).toHaveLength(7);
    expect(notifications).toBe(1);
    machine.pause();
    expect(callback).toBeUndefined();
  });
  it("does not consume keyboard data during inspection, and manual DDR writes emit output", () => {
    const { machine } = fixture("GETC\nHALT");
    machine.input("AB");
    expect(machine.readMemory(0xfe00, 3)[0]).toBe(0x8000);
    expect(machine.readMemory(0xfe02, 1)[0]).toBe(65);
    expect(machine.disassemble(0xfe02).word).toBe(65);
    let output = "";
    machine.onOutput((chars) => (output += chars));
    machine.writeMemory(0xfe06, 0x1243);
    expect(output).toBe("C");
    expect(machine.getSnapshot().output).toBe("C");
  });
  it("assembles an OS, loads in user mode and runs PUTS and HALT", () => {
    const { machine, flush } = fixture(
      'LEA R0, TEXT\nPUTS\nADD R2, R2, #7\nHALT\nTEXT .STRINGZ "Hello"',
    );
    let output = "";
    machine.onOutput((chars) => (output += chars));
    machine.run();
    flush();
    const snapshot = machine.getSnapshot();
    expect(snapshot.status).toBe("halted");
    expect(snapshot.mcr & 0x8000).toBe(0);
    expect(snapshot.regs[2]).toBe(7);
    expect(snapshot.output).toBe("Hello\nHALT\n");
    expect(output).toBe("Hello\nHALT\n");
    expect(
      machine.getTrace(4096).some((event) => event.mnemonic === "RTI"),
    ).toBe(true);
    expect(machine.lookupSymbol("OS_GETC")).toBe(
      machine.readMemory(0x20, 1)[0],
    );
  });
  it("waits during GETC and resumes an echo program when input arrives", () => {
    const { machine, flush } = fixture(
      'GETC\nST R0, KEY\nLEA R0, TEXT\nPUTS\nLD R0, KEY\nOUT\nHALT\nKEY .BLKW #1\nTEXT .STRINGZ "You typed: "',
    );
    machine.run();
    flush();
    expect(machine.getSnapshot().pauseReason).toBe("waiting-for-input");
    machine.input("A");
    flush();
    expect(machine.getSnapshot().status).toBe("halted");
    expect(machine.getSnapshot().output).toBe("You typed: A\nHALT\n");
    expect(
      machine.readMemory(machine.lookupSymbol("KEY") as number, 1)[0],
    ).toBe(65);
  });
  it("runs IN and PUTSP and preserves registers across trap returns", () => {
    const { machine, flush } = fixture(
      "IN\nST R0, KEY\nLEA R0, PACKED\nPUTSP\nHALT\nKEY .BLKW #1\nPACKED .FILL x6948\n.FILL x0021\n.FILL x0000",
    );
    machine.input("Z");
    machine.run();
    flush();
    expect(machine.getSnapshot().output).toBe(
      "Enter a character: ZHi!\nHALT\n",
    );
    expect(
      machine.readMemory(machine.lookupSymbol("KEY") as number, 1)[0],
    ).toBe(90);
  });
  it("pauses on exceptions, then executes the OS fault handler", () => {
    const { machine, flush } = fixture(".FILL xD000");
    machine.run();
    flush();
    expect(machine.getSnapshot().pauseReason).toBe("exception");
    expect(machine.getTrace(1)[0].exception).toBe("illegal-opcode");
    machine.run();
    flush();
    expect(machine.getSnapshot().status).toBe("halted");
    expect(machine.getSnapshot().output).toBe("LC-3 exception\nHALT\n");
  });
  it("uses a stable cheap snapshot, memory views, source maps and symbol lookup", () => {
    const { machine } = fixture("START ADD R2, R2, #1\nHALT");
    expect(machine.getSnapshot()).toBe(machine.getSnapshot());
    expect(machine.getSnapshot().privilege).toBe("user");
    const view = machine.readMemory(0x3000, 1);
    expect(view.buffer.byteLength).toBe(0x20000);
    expect(machine.disassemble(0x3000)).toMatchObject({
      label: "START",
      sourceLine: 2,
      text: "ADD R2, R2, #1",
    });
    expect(machine.lookupSymbol("start")).toBe(0x3000);
    expect(machine.lookupSymbol(0x3000)).toBe("START");
    const before = machine.getSnapshot();
    machine.stepInto();
    expect(machine.getSnapshot()).not.toBe(before);
    expect(machine.getSnapshot().ir).toBe(0x14a1);
    expect(machine.readMemory(0xfffc, 1)[0]).toBe(machine.getSnapshot().psr);
  });
  it("loads an ISA extension for execution and disassembly", () => {
    const extension = {
      mnemonic: "EXT",
      opcode: 13,
      decode: () => undefined,
      execute: (cpu: { setReg: (n: number, v: number) => void }) =>
        cpu.setReg(2, 99),
      disassemble: () => "EXT",
    };
    const { machine } = fixture(".FILL xD000", {
      isa: { ...LC3, instructions: [...LC3.instructions, extension] },
    });
    expect(machine.disassemble(0x3000).text).toBe("EXT");
    expect(machine.stepInto().mnemonic).toBe("EXT");
    expect(machine.getSnapshot().regs[2]).toBe(99);
  });
  it("resets the image, or retains edited RAM when requested", () => {
    const { machine } = fixture("ADD R2, R2, #1\nHALT");
    machine.writeMemory(0x3000, 0x14a2);
    machine.stepInto();
    expect(machine.getSnapshot().regs[2]).toBe(2);
    machine.reset({ keepMemory: true });
    expect(machine.readMemory(0x3000, 1)[0]).toBe(0x14a2);
    expect(machine.getSnapshot().regs[2]).toBe(0);
    machine.reset();
    expect(machine.readMemory(0x3000, 1)[0]).toBe(0x14a1);
  });
  it("runs finite speed in slices and notifies once per slice", () => {
    const { machine, tick } = fixture("ADD R2, R2, #1\nBR #-2");
    let notifications = 0;
    const unsub = machine.subscribe(() => notifications++);
    machine.setSpeed(100);
    machine.run();
    notifications = 0;
    tick();
    expect(machine.getSnapshot().regs[2]).toBe(1);
    expect(notifications).toBe(1);
    tick();
    expect(machine.getSnapshot().pc).toBe(0x3000);
    expect(notifications).toBe(2);
    machine.pause();
    expect(tick()).toBe(false);
    unsub();
    expect(() => machine.setSpeed(0)).toThrow();
    expect(() => machine.setSpeed(Number.NaN)).toThrow();
  });
});

describe("debugging and undo through the public API", () => {
  it("keeps step-over active while GETC waits, and stops at the user return address", () => {
    const { machine, flush, tick } = fixture("GETC\nHALT");
    machine.stepOver();
    flush();
    expect(machine.getSnapshot().pauseReason).toBe("waiting-for-input");
    expect(tick()).toBe(false);
    machine.input("B");
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      pc: 0x3001,
      pauseReason: "step-complete",
      privilege: "user",
    });
    expect(machine.getSnapshot().regs[0]).toBe(66);
  });
  it("keeps an explicit user pause after input arrives", () => {
    const { machine, flush, tick } = fixture("GETC\nHALT");
    machine.run();
    flush();
    machine.pause();
    machine.input("B");
    expect(tick()).toBe(false);
    expect(machine.getSnapshot().pauseReason).toBe("user-pause");
  });
  it("watches PSR writes and restores their exact flag masks", () => {
    const { machine, flush } = fixture("STR R0, R1, #0\nHALT");
    machine.writeRegister("PSR", 0x0502);
    machine.writeRegister("R0", 0x0507);
    machine.writeRegister("R1", 0xfffc);
    machine.watchpoints.add(0xfffc, "write");
    machine.run();
    flush();
    expect(machine.getSnapshot()).toMatchObject({
      psr: 0x0507,
      n: true,
      z: true,
      p: true,
      pauseReason: "watchpoint",
    });
    machine.stepBack();
    expect(machine.getSnapshot().psr).toBe(0x0502);
  });
  it("resumes from a breakpoint and stops when the address is reached again", () => {
    const { machine, flush } = fixture("LOOP ADD R2, R2, #1\nBR LOOP");
    machine.breakpoints.add(0x3000);
    machine.run();
    flush();
    expect(machine.getSnapshot().regs[2]).toBe(1);
    expect(machine.getSnapshot().pauseReason).toBe("breakpoint");
    machine.run();
    flush();
    expect(machine.getSnapshot().regs[2]).toBe(2);
    expect(machine.getSnapshot().pc).toBe(0x3000);
    expect(machine.breakpoints.list()[0].hits).toBe(2);
  });
  it("supports conditions and hit counts without evaluating host code", () => {
    const { machine, flush } = fixture("LOOP ADD R0, R0, #1\nBR LOOP");
    machine.breakpoints.add(0x3000, {
      condition: "R0 >= #2 && (PSR & x0001) == #1",
      hitCount: 2,
    });
    machine.run();
    flush();
    expect(machine.getSnapshot().regs[0]).toBe(3);
    expect(machine.getSnapshot().pauseReason).toBe("breakpoint");
    expect(() =>
      machine.breakpoints.add(0x3000, { condition: "globalThis.alert()" }),
    ).toThrow();
    expect(() => machine.breakpoints.add(0x3000, { hitCount: 0 })).toThrow();
  });
  it("steps over recursive JSR calls and restores call depth when stepping back", () => {
    const { machine, flush } = fixture(
      "AND R0, R0, #0\nADD R0, R0, #3\nJSR RECURSE\nHALT\nRECURSE ADD R6, R6, #-1\nSTR R7, R6, #0\nADD R0, R0, #-1\nBRz DONE\nJSR RECURSE\nDONE LDR R7, R6, #0\nADD R6, R6, #1\nRET",
    );
    machine.stepInto();
    machine.stepInto();
    const sp = machine.getSnapshot().regs[6];
    machine.stepOver();
    flush();
    expect(machine.getSnapshot().pc).toBe(0x3003);
    expect(machine.getSnapshot().regs[0]).toBe(0);
    expect(machine.getSnapshot().regs[6]).toBe(sp);
    expect(machine.getSnapshot().pauseReason).toBe("step-complete");
    expect(machine.stepBack()?.mnemonic).toBe("RET");
    machine.stepOut();
    flush();
    expect(machine.getSnapshot().pc).toBe(0x3003);
  });
  it("steps over an OS trap and steps out of a subroutine", () => {
    const { machine, flush } = fixture(
      'LEA R0, TEXT\nPUTS\nJSR SUB\nHALT\nSUB ADD R2, R2, #1\nRET\nTEXT .STRINGZ "X"',
    );
    machine.stepInto();
    machine.stepOver();
    flush();
    expect(machine.getSnapshot().pc).toBe(0x3002);
    expect(machine.getSnapshot().output).toBe("X");
    machine.stepInto();
    machine.stepOut();
    flush();
    expect(machine.getSnapshot().pc).toBe(0x3003);
    expect(machine.getSnapshot().regs[2]).toBe(1);
  });
  it("runs to an address before execution", () => {
    const { machine, flush } = fixture("ADD R2, R2, #1\nADD R2, R2, #1\nHALT");
    machine.runTo(0x3001);
    flush();
    expect(machine.getSnapshot().regs[2]).toBe(1);
    expect(machine.getSnapshot().pc).toBe(0x3001);
  });
  it("watches RAM writes and reverses registers, RAM, PC, IR and PSR", () => {
    const { machine, flush } = fixture(
      "ADD R2, R2, #1\nST R2, VALUE\nHALT\nVALUE .FILL x1234",
    );
    const addr = machine.lookupSymbol("VALUE") as number;
    machine.watchpoints.add(addr, "write");
    machine.run();
    flush();
    expect(machine.getSnapshot().pauseReason).toBe("watchpoint");
    expect(machine.readMemory(addr, 1)[0]).toBe(1);
    const event = machine.stepBack();
    expect(event?.memWrites).toEqual([{ addr, before: 0x1234, after: 1 }]);
    expect(machine.readMemory(addr, 1)[0]).toBe(0x1234);
    expect(machine.getSnapshot().pc).toBe(0x3001);
    machine.stepBack();
    expect(machine.getSnapshot().regs[2]).toBe(0);
    expect(machine.getSnapshot().ir).toBe(0);
    expect(machine.getSnapshot().psr).toBe(0x8002);
  });
  it("watches device reads and restores consumed keyboard input", () => {
    const { machine, flush } = fixture("GETC\nHALT");
    machine.input("A");
    const watch = machine.watchpoints.add(0xfe02, "read");
    machine.run();
    flush();
    expect(machine.getSnapshot().pauseReason).toBe("watchpoint");
    expect(machine.getSnapshot().regs[0]).toBe(65);
    machine.stepBack();
    machine.watchpoints.remove(watch);
    const event = machine.stepInto();
    expect(
      event.regWrites.some((write) => write.reg === 0 && write.after === 65),
    ).toBe(true);
  });
  it("watches display and MCR writes, and reverses output and HALT", () => {
    const { machine, flush } = fixture(
      "LD R0, CHAR\nOUT\nHALT\nCHAR .FILL x0041",
    );
    const watch = machine.watchpoints.add(0xfe06, "write");
    machine.run();
    flush();
    expect(machine.getSnapshot().pauseReason).toBe("watchpoint");
    expect(machine.getSnapshot().output).toBe("A");
    expect(machine.stepBack()?.output).toBe("A");
    expect(machine.getSnapshot().output).toBe("");
    machine.watchpoints.remove(watch);
    machine.run();
    flush();
    expect(machine.getSnapshot().status).toBe("halted");
    expect(machine.stepBack()?.halted).toBe(true);
    expect(machine.getSnapshot().mcr & 0x8000).toBe(0x8000);
  });
  it("bounds the undo ring and clears stale history after edits", () => {
    const { machine } = fixture(
      "ADD R2, R2, #1\nADD R2, R2, #1\nADD R2, R2, #1",
      { historyLimit: 2, os: false },
    );
    machine.stepInto();
    machine.stepInto();
    machine.stepInto();
    expect(machine.getTrace(99)).toHaveLength(2);
    machine.stepBack();
    machine.stepBack();
    expect(machine.stepBack()).toBeNull();
    expect(machine.getSnapshot().regs[2]).toBe(1);
    machine.stepInto();
    machine.writeRegister("R2", 123);
    expect(machine.stepBack()).toBeNull();
  });
});
