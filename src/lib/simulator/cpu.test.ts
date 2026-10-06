import { describe, expect, it } from "vite-plus/test";

import { Cpu } from "./cpu";
import { Bus } from "./bus";
import { LC3 } from "./isa/lc3";
import { createMachineState } from "./state";

function machine() {
  const memory = new Uint16Array(0x10000);
  const accesses: Array<["read" | "write", number]> = [];
  const state = createMachineState();
  state.memory = memory;
  const bus = new Bus(memory);
  bus.onAccess(({ kind, addr }) => accesses.push([kind, addr]));
  const cpu = new Cpu(LC3, state, bus);
  cpu.pc = 0x3000;
  cpu.setReg(6, 0x2ff0);
  return { cpu, memory, accesses };
}

describe("LC-3 CPU", () => {
  it("separates registers from memory and normalizes bus addresses", () => {
    const { cpu, memory, accesses } = machine();
    cpu.setReg(0, 0x1234);
    cpu.write(0, 0xabcd);
    cpu.write(0x10000, 0x10001);
    expect(cpu.reg(0)).toBe(0x1234);
    expect(memory[0]).toBe(1);
    expect(cpu.read(-1)).toBe(0);
    expect(accesses).toContainEqual(["read", 0xffff]);
    cpu.pc = 0x10000;
    expect(cpu.pc).toBe(0);
  });

  it("keeps condition codes and PSR in sync in both directions", () => {
    const { cpu } = machine();
    cpu.psr = 0x8502;
    cpu.setCC(0x10000);
    expect(cpu.psr).toBe(0x8502);
    cpu.setCC(0xffff);
    expect(cpu.psr).toBe(0x8504);
    cpu.setCC(1);
    expect(cpu.psr).toBe(0x8501);
    cpu.psr = 0x0202;
  });

  it("increments PC before executing and wraps instruction fetch", () => {
    const { cpu, memory } = machine();
    cpu.pc = 0xffff;
    memory[0xffff] = 0xe000;
    cpu.step();
    expect(cpu.pc).toBe(0);
    expect(cpu.reg(0)).toBe(0);
    memory[0] = 0x4801;
    cpu.step();
    expect(cpu.reg(7)).toBe(1);
    expect(cpu.pc).toBe(2);
  });

  it("executes an assembled loop using flags produced by ADD", () => {
    const { cpu, memory } = machine();
    memory.set([0x1021, 0x103f, 0x03ff], 0x3000);
    cpu.step();
    expect(cpu.reg(0)).toBe(1);
    cpu.step();
    expect(cpu.reg(0)).toBe(0);
    cpu.step();
    expect(cpu.pc).toBe(0x3003);
  });

  it("enters a user trap through its vector and returns through RTI", () => {
    const { cpu, memory } = machine();
    cpu.psr = 0x8504;
    cpu.setReg(6, 0xeff0);
    cpu.setReg(7, 0x7777);
    cpu.state.savedSSP = 0x2ff0;
    memory[0x20] = 0x2000;
    memory[0x3000] = 0xf020;
    memory[0x2000] = 0x8000;
    cpu.step();
    expect(cpu.pc).toBe(0x2000);
    expect(cpu.psr).toBe(0x0504);
    expect(cpu.reg(6)).toBe(0x2fee);
    expect(cpu.state.savedUSP).toBe(0xeff0);
    expect(memory[0x2fee]).toBe(0x3001);
    expect(memory[0x2fef]).toBe(0x8504);
    expect(cpu.reg(7)).toBe(0x7777);
    cpu.psr = 0x0001;
    cpu.step();
    expect(cpu.pc).toBe(0x3001);
    expect(cpu.psr).toBe(0x8504);
    expect(cpu.reg(6)).toBe(0xeff0);
    expect(cpu.state.savedSSP).toBe(0x2ff0);
    expect(cpu.reg(7)).toBe(0x7777);
  });

  it("nests supervisor traps on the existing stack", () => {
    const { cpu, memory } = machine();
    cpu.psr = 0x0302;
    cpu.state.savedSSP = 0x1000;
    memory[0x20] = 0x2000;
    memory[0x21] = 0x2100;
    memory[0x3000] = 0xf020;
    memory[0x2000] = 0xf021;
    memory[0x2100] = 0x8000;
    memory[0x2001] = 0x8000;
    cpu.step();
    cpu.step();
    expect(cpu.reg(6)).toBe(0x2fec);
    cpu.step();
    expect(cpu.pc).toBe(0x2001);
    cpu.step();
    expect(cpu.pc).toBe(0x3001);
    expect(cpu.psr).toBe(0x0302);
    expect(cpu.reg(6)).toBe(0x2ff0);
  });

  it("looks up all 256 trap vectors as zero-extended addresses", () => {
    const { cpu, memory } = machine();
    for (let vector = 0; vector < 256; vector += 1) {
      cpu.pc = 0x3000;
      cpu.psr = 0x0702;
      cpu.setReg(6, 0x2ff0);
      cpu.setReg(7, 0x7777);
      memory[vector] = 0x2000 + vector;
      memory[0x3000] = 0xf000 | vector;
      cpu.step();
      expect(cpu.pc).toBe(0x2000 + vector);
      expect(cpu.psr).toBe(0x0702);
      expect(cpu.reg(7)).toBe(0x7777);
      expect(memory[0x2fee]).toBe(0x3001);
    }
  });

  it("wraps the supervisor stack while returning from an interrupt", () => {
    const { cpu, memory } = machine();
    cpu.setReg(6, 0xffff);
    memory[0xffff] = 0x4321;
    memory[0] = 0x0504;
    memory[0x3000] = 0x8000;
    cpu.step();
    expect(cpu.pc).toBe(0x4321);
    expect(cpu.psr).toBe(0x0504);
    expect(cpu.reg(6)).toBe(1);
  });

  it("returns to a corrected faulting instruction after an exception", () => {
    const { cpu, memory } = machine();
    cpu.psr = 0x0701;
    cpu.setReg(7, 0x7777);
    memory[0x3000] = 0xd000;
    memory[0x0101] = 0x2000;
    memory[0x2000] = 0x8000;
    cpu.step();
    expect(cpu.psr).toBe(0x0701);
    expect(cpu.reg(7)).toBe(0x7777);
    memory[0x3000] = 0x1021;
    cpu.step();
    expect(cpu.pc).toBe(0x3000);
    expect(cpu.reg(6)).toBe(0x2ff0);
    cpu.step();
    expect(cpu.pc).toBe(0x3001);
    expect(cpu.reg(0)).toBe(1);
  });

  it("does not suppress unrelated device errors", () => {
    const bus = new Bus();
    const cpu = new Cpu(
      LC3,
      { ...createMachineState(), memory: bus.memory },
      bus,
    );
    bus.mapDevice(0, {
      read: () => {
        throw new Error("Device failed");
      },
      write: () => undefined,
    });
    expect(() => cpu.step()).toThrow("Device failed");
  });

  it.each([
    [0x8000, 0x0100, "privilege"],
    [0xd000, 0x0101, "illegal-opcode"],
    [0x6040, 0x0102, "access-violation"],
  ])(
    "vectors exception word %i without throwing to the host",
    (word, vector, exception) => {
      const { cpu, memory } = machine();
      cpu.psr = 0x8202;
      cpu.setReg(0, 0xaaaa);
      cpu.setReg(1, 0x2000);
      cpu.setReg(6, 0xeff0);
      cpu.state.savedSSP = 0x2ff0;
      memory[vector] = 0x2500;
      memory[0x3000] = word;
      const result = cpu.step();
      expect(result?.exception).toBe(exception);
      expect(cpu.pc).toBe(0x2500);
      expect(cpu.psr).toBe(0x0202);
      expect(memory[0x2fee]).toBe(0x3000);
      expect(memory[0x2fef]).toBe(0x8202);
      expect(cpu.reg(0)).toBe(0xaaaa);
      expect(cpu.reg(6)).toBe(0x2fee);
    },
  );

  it("vectors an instruction-fetch violation before reading protected memory", () => {
    const { cpu, memory, accesses } = machine();
    cpu.pc = 0x2000;
    cpu.psr = 0x8002;
    cpu.state.savedSSP = 0x2ff0;
    memory[0x0102] = 0x2500;
    expect(cpu.step()?.exception).toBe("access-violation");
    expect(accesses).not.toContainEqual(["read", 0x2000]);
    expect(memory[0x2fee]).toBe(0x2000);
    expect(cpu.pc).toBe(0x2500);
  });

  it.each([0x6040, 0x7040, 0xa000, 0xb000])(
    "checks final addresses and prevents faulting word %i from committing",
    (word) => {
      const { cpu, memory, accesses } = machine();
      cpu.psr = 0x8002;
      cpu.setReg(0, 0x1234);
      cpu.setReg(1, 0xfe00);
      cpu.state.savedSSP = 0x2ff0;
      memory[0x3000] = word;
      memory[0x3001] = 0xfe00;
      memory[0xfe00] = 0xabcd;
      memory[0x0102] = 0x2500;
      cpu.step();
      expect(cpu.pc).toBe(0x2500);
      expect(cpu.reg(0)).toBe(0x1234);
      expect(memory[0xfe00]).toBe(0xabcd);
      expect(accesses).not.toContainEqual(["read", 0xfe00]);
      expect(accesses).not.toContainEqual(["write", 0xfe00]);
    },
  );

  it.each([0x2100, 0x3100, 0xa100, 0xb100])(
    "checks the first PC-relative address for word %i",
    (word) => {
      const { cpu, memory, accesses } = machine();
      cpu.psr = 0x8002;
      cpu.state.savedSSP = 0x2ff0;
      memory[0x3000] = word;
      memory[0x0102] = 0x2500;
      cpu.step();
      expect(cpu.pc).toBe(0x2500);
      expect(accesses).not.toContainEqual(["read", 0x2f01]);
      expect(accesses).not.toContainEqual(["write", 0x2f01]);
    },
  );

  it("lets LEA compute a privileged address without accessing it", () => {
    const { cpu, memory } = machine();
    cpu.psr = 0x8004;
    memory[0x3000] = 0xe100;
    expect(cpu.step()?.exception).toBeUndefined();
    expect(cpu.reg(0)).toBe(0x2f01);
    expect(cpu.psr).toBe(0x8004);
  });

  it("exposes PSR and MCR through their supervisor-only memory addresses", () => {
    const { cpu, memory } = machine();
    cpu.write(0xfffc, 0x0304);
    expect(cpu.psr).toBe(0x0304);
    expect(cpu.read(0xfffc)).toBe(0x0304);
    memory[0x3000] = 0x1021;
    cpu.write(0xfffe, 0);
    expect(cpu.step()).toBeNull();
    expect(cpu.pc).toBe(0x3000);
    cpu.write(0xfffe, 0x8000);
    cpu.step();
    expect(cpu.reg(0)).toBe(1);
  });
});
