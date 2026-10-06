import { describe, expect, it } from "vite-plus/test";
import { assemble } from "../assembler/assembler";
import { tokenize } from "../assembler/lexer";
import { parse } from "../assembler/parser";
import { Cpu } from "./cpu";
import { Keyboard } from "./devices/keyboard";
import { LC3 } from "./isa/lc3";
import type { InstructionSpec } from "./isa/types";
import { createMachineState } from "./state";

describe("swappable CPU and plain state", () => {
  it("executes an extension and dispatches only its opcode slot", () => {
    let matches = 0;
    const extension: InstructionSpec<undefined> = {
      mnemonic: "EXT",
      opcode: 13,
      decode: () => undefined,
      match: () => {
        matches++;
        return true;
      },
      execute: (cpu) => cpu.setReg(0, 0x1234),
      disassemble: () => "EXT",
    };
    const cpu = new Cpu({
      ...LC3,
      instructions: [...LC3.instructions, extension],
    });
    cpu.state.memory.set([0xd000, 0x1021], 0x3000);
    cpu.pc = 0x3000;
    const event = cpu.step();
    expect(cpu.dispatch).toHaveLength(16);
    expect(event?.mnemonic).toBe("EXT");
    expect(event?.regWrites).toEqual([{ reg: 0, before: 0, after: 0x1234 }]);
    cpu.step();
    expect(matches).toBe(1);
    expect(cpu.state.ir).toBe(0x1021);
  });
  it("uses an injected memory map and supports relaxed checking", () => {
    const isa = {
      ...LC3,
      memoryMap: { userStart: 0x4000, userEnd: 0x4fff, mmioStart: 0x5000 },
    };
    const cpu = new Cpu(isa);
    cpu.psr = 0x8002;
    cpu.pc = 0x3000;
    expect(cpu.step()?.exception).toBe("access-violation");
    const relaxed = new Cpu(isa, undefined, undefined, { strictAccess: false });
    relaxed.psr = 0x8002;
    relaxed.pc = 0x3000;
    relaxed.state.memory[0x3000] = 0x1021;
    expect(relaxed.step()?.exception).toBeUndefined();
    expect(relaxed.reg(0)).toBe(1);
  });
  it("clones all state as plain data without sharing RAM or registers", () => {
    const state = createMachineState();
    const clone = structuredClone(state);
    clone.regs[0] = 123;
    clone.memory[0] = 456;
    clone.keyboard.buffer.push(65);
    expect(state.regs[0]).toBe(0);
    expect(state.memory[0]).toBe(0);
    expect(state.keyboard.buffer).toEqual([]);
  });
  it("records PSR/MCR accesses and writes through the bus", () => {
    const cpu = new Cpu(LC3);
    const accesses: Array<number> = [];
    cpu.bus.onAccess(({ addr }) => accesses.push(addr));
    cpu.state.memory[0x3000] = 0x7040;
    cpu.pc = 0x3000;
    cpu.setReg(1, 0xfffc);
    cpu.setReg(0, 7);
    const event = cpu.step();
    expect(event?.memWrites).toEqual([{ addr: 0xfffc, before: 2, after: 7 }]);
    expect(cpu.psr & 7).toBe(7);
    expect(cpu.bus.read(0xfffc)).toBe(7);
    expect(accesses).toContain(0xfffc);
    cpu.write(0xfffe, 0);
    expect(accesses).toContain(0xfffe);
    expect(cpu.step()).toBeNull();
  });
  it("takes a keyboard interrupt before fetch, then restores user state", () => {
    const cpu = new Cpu(LC3);
    const keyboard = new Keyboard(cpu.state, cpu.bus);
    cpu.psr = 0x8304;
    cpu.pc = 0x3000;
    cpu.setReg(6, 0xf000);
    cpu.state.memory[0x180] = 0x2000;
    cpu.state.memory[0x2000] = 0x8000;
    cpu.state.keyboard.status = 0x4000;
    keyboard.input("A");
    const event = cpu.step();
    expect(event?.interrupt).toBe(0x80);
    expect(event?.word).toBeNull();
    expect(cpu.pc).toBe(0x2000);
    expect(cpu.psr).toBe(0x0404);
    expect(cpu.state.memory[0x2ffe]).toBe(0x3000);
    expect(cpu.state.memory[0x2fff]).toBe(0x8304);
    expect(cpu.bus.read(0xfe02)).toBe(65);
    cpu.step();
    expect(cpu.pc).toBe(0x3000);
    expect(cpu.psr).toBe(0x8304);
    expect(cpu.reg(6)).toBe(0xf000);
  });
  it("does not accept a keyboard interrupt at equal or higher priority", () => {
    const cpu = new Cpu(LC3);
    const keyboard = new Keyboard(cpu.state, cpu.bus);
    cpu.pc = 0x3000;
    cpu.psr = 0x8402;
    cpu.state.memory[0x3000] = 0x1021;
    cpu.state.keyboard.status = 0x4000;
    keyboard.input("A");
    expect(cpu.step()?.interrupt).toBeUndefined();
    expect(cpu.reg(0)).toBe(1);
  });
  it("maps source lines for blocks, strings and address wrap", () => {
    const image = assemble(
      parse(
        tokenize(
          '.ORIG xFFFF\n; comment\nBR TARGET\nTARGET .BLKW #2\n.STRINGZ "Hi"\n.END\n',
        ),
      ),
    );
    expect(image.origin).toBe(0xffff);
    expect(image.words).toHaveLength(6);
    expect(image.sourceMap).toEqual(
      new Map([
        [0xffff, 3],
        [0, 4],
        [1, 4],
        [2, 5],
        [3, 5],
        [4, 5],
      ]),
    );
  });
});
