import { describe, expect, it } from "vite-plus/test";

import { Bus } from "./bus";
import { Cpu } from "./cpu";
import { LC3 } from "./isa/lc3";
import { createMachineState } from "./state";

describe("LC-3 memory bus", () => {
  it("stores 65,536 independent words and wraps reads and writes", () => {
    const bus = new Bus();
    bus.write(-1, 0x12345);
    bus.write(0x10000, 0x10001);
    expect(bus.read(0xffff)).toBe(0x2345);
    expect(bus.read(0)).toBe(1);
    expect(bus.read(0x1ffff)).toBe(0x2345);
  });

  it("routes CPU I/O through devices without overwriting ordinary memory", () => {
    const bus = new Bus();
    const cpu = new Cpu(
      LC3,
      { ...createMachineState(), memory: bus.memory },
      bus,
    );
    const writes: Array<[number, number]> = [];
    bus.memory[0xfe02] = 0xaaaa;
    bus.mapDevice(0xfe02, {
      read: () => 0x10041,
      write: (address, value) => writes.push([address, value]),
    });
    expect(cpu.read(0xfe02)).toBe(0x41);
    cpu.write(0x1fe02, 0x10042);
    expect(writes).toEqual([[0xfe02, 0x42]]);
    expect(bus.memory[0xfe02]).toBe(0xaaaa);
  });

  it("allocates memory separately when constructing the default CPU", () => {
    const cpu = new Cpu(LC3);
    cpu.setReg(0, 0x1234);
    cpu.write(0, 0xabcd);
    expect(cpu.reg(0)).toBe(0x1234);
    expect(cpu.read(0)).toBe(0xabcd);
  });
});
