import { describe, expect, it } from "vite-plus/test";
import { Cpu } from "./cpu";
import { History } from "./history";
import { Keyboard } from "./devices/keyboard";
import { LC3 } from "./isa/lc3";

describe("instruction events and condition codes", () => {
  it.each([
    ["ADD", 0x1021, 1],
    ["AND", 0x5020, 2],
    ["NOT", 0x903f, 4],
    ["LD", 0x2000, 4],
    ["LDI", 0xa000, 4],
    ["LDR", 0x6040, 4],
    ["LEA", 0xe000, 2],
    ["BR", 0x0400, 2],
    ["JMP", 0xc040, 2],
    ["JSR", 0x4800, 2],
    ["JSRR", 0x4040, 2],
    ["RET", 0xc1c0, 2],
    ["ST", 0x3000, 2],
    ["STI", 0xb000, 2],
    ["STR", 0x7040, 2],
    ["TRAP", 0xf020, 2],
    ["RTI", 0x8000, 1],
  ])("records %s and its final flags", (mnemonic, word, flags) => {
    const cpu = new Cpu(LC3);
    cpu.pc = 0x3000;
    cpu.psr = 0x0502;
    cpu.setReg(1, 0x4000);
    cpu.setReg(6, 0x2f00);
    cpu.setReg(7, 0x4000);
    cpu.state.memory[0x3000] = Number(word);
    cpu.state.memory[0x3001] =
      mnemonic === "LDI" || mnemonic === "STI" ? 0x4000 : 0x8000;
    cpu.state.memory[0x4000] = 0x8000;
    cpu.state.memory[0x20] = 0x2000;
    cpu.state.memory[0x2f00] = 0x3001;
    cpu.state.memory[0x2f01] = 0x0501;
    const event = cpu.step();
    expect(event).toMatchObject({
      pc: 0x3000,
      word,
      mnemonic,
      psrBefore: 0x0502,
      psrAfter: 0x0500 | Number(flags),
    });
    expect(event?.exception).toBeUndefined();
    expect(cpu.psr & 7).toBe(flags);
    expect(event?.stateAfter.ir).toBe(word);
  });
  it.each([0, 3, 5, 6, 7])("keeps the exact PSR flag mask %i", (flags) => {
    const cpu = new Cpu(LC3);
    cpu.pc = 0x3000;
    cpu.psr = 0x0500 | flags;
    cpu.state.memory[0x3000] = 0x0801;
    cpu.step();
    expect(cpu.pc).toBe(flags & 4 ? 0x3002 : 0x3001);
    expect(cpu.psr & 7).toBe(flags);
  });
  it.each(["exception", "interrupt"] as const)(
    "undoes %s entry including stack and saved pointers",
    (kind) => {
      const cpu = new Cpu(LC3);
      const keyboard = new Keyboard(cpu.state, cpu.bus);
      cpu.pc = 0x3000;
      cpu.psr = 0x8204;
      cpu.setReg(6, 0xf000);
      cpu.state.memory[0x3000] = 0xd000;
      cpu.state.memory[0x0101] = 0x2000;
      cpu.state.memory[0x0180] = 0x2000;
      if (kind === "interrupt") {
        cpu.state.keyboard.status = 0x4000;
        keyboard.input("X");
      }
      const before = structuredClone(cpu.state);
      const event = cpu.step();
      expect(event).not.toBeNull();
      const history = new History(1);
      history.push(event!, { depth: 0, hits: [] });
      history.undo(cpu.state, cpu.bus);
      expect(cpu.state).toEqual(before);
    },
  );
});
