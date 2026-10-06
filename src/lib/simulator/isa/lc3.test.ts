import { describe, expect, it } from "vite-plus/test";

import { assemble } from "../../assembler/assembler";
import { tokenize } from "../../assembler/lexer";
import { parse } from "../../assembler/parser";
import { Cpu } from "../cpu";
import { Bus } from "../bus";
import { createMachineState } from "../state";
import { LC3 } from "./lc3";

function machine(pc = 0x3001) {
  const memory = new Uint16Array(0x10000);
  const state = createMachineState();
  state.memory = memory;
  const cpu = new Cpu(LC3, state, new Bus(memory));
  cpu.pc = pc;
  return { cpu, memory };
}

function execute(cpu: Cpu, word: number) {
  const instruction = LC3.instructions.find(
    (spec) => spec.opcode === word >>> 12 && (spec.match?.(word) ?? true),
  );
  if (!instruction) throw new Error("Instruction not found");
  instruction.execute(cpu, instruction.decode(word));
}

function disassemble(
  word: number,
  pc = 0x3000,
  symbols = new Map<number, string>(),
) {
  const instruction = LC3.instructions.find(
    (spec) => spec.opcode === word >>> 12 && (spec.match?.(word) ?? true),
  );
  if (!instruction?.disassemble) throw new Error("Instruction not found");
  return instruction.disassemble(instruction.decode(word), { pc, symbols });
}

describe("LC-3 instructions", () => {
  it("complements every sixteen-bit value and sets its condition codes", () => {
    const { cpu } = machine();
    for (let value = 0; value <= 0xffff; value += 1) {
      cpu.setReg(0, value);
      execute(cpu, 0x923f);
      const result = value ^ 0xffff;
      expect(cpu.reg(1)).toBe(result);
      expect(cpu.psr & 7).toBe(result === 0 ? 2 : result & 0x8000 ? 4 : 1);
    }
  });

  it.each([
    [0x1001, 0xffff, 1, 0, 0b010],
    [0x1001, 0x7fff, 1, 0x8000, 0b100],
    [0x103f, 0, 0, 0xffff, 0b100],
    [0x1021, 5, 100, 6, 0b001],
    [0x5020, 0xffff, 0, 0, 0b010],
    [0x503f, 0x8123, 0, 0x8123, 0b100],
    [0x5001, 0x1234, 0x00ff, 0x0034, 0b001],
    [0x903f, 0, 0, 0xffff, 0b100],
    [0x903f, 0xffff, 0, 0, 0b010],
  ])(
    "computes word %i and its sixteen-bit condition codes",
    (word, r0, r1, result, flags) => {
      const { cpu } = machine();
      cpu.psr = 0x0502;
      cpu.setReg(0, r0);
      cpu.setReg(1, r1);
      execute(cpu, word);
      expect(cpu.reg(0)).toBe(result);
      expect(cpu.psr).toBe(0x0500 | flags);
    },
  );

  it("covers every ADD/AND operand form and register alias", () => {
    const { cpu } = machine();
    for (const opcode of [0x1000, 0x5000]) {
      for (let dr = 0; dr < 8; dr += 1) {
        for (let sr1 = 0; sr1 < 8; sr1 += 1) {
          for (let operand = 0; operand < 40; operand += 1) {
            for (const seed of [0, 1, 0x7fff, 0x8000, 0xffff]) {
              for (let reg = 0; reg < 8; reg += 1) {
                cpu.setReg(reg, seed + reg * 0x1357);
              }
              const immediate = operand >= 8;
              const raw = immediate ? operand - 8 : operand;
              const value = immediate
                ? raw < 16
                  ? raw
                  : raw - 32
                : cpu.reg(raw);
              const result =
                (opcode === 0x1000
                  ? cpu.reg(sr1) + value
                  : cpu.reg(sr1) & value) & 0xffff;
              execute(
                cpu,
                opcode | (dr << 9) | (sr1 << 6) | (immediate ? 0x20 : 0) | raw,
              );
              expect(cpu.reg(dr)).toBe(result);
              expect(cpu.psr & 7).toBe(
                result === 0 ? 2 : result & 0x8000 ? 4 : 1,
              );
            }
          }
        }
      }
    }
  });

  it("branches for exactly the requested condition flags", () => {
    const { cpu } = machine();
    for (const flags of [1, 2, 4]) {
      for (let mask = 0; mask < 8; mask += 1) {
        cpu.pc = 0x3001;
        cpu.psr = flags;
        execute(cpu, (mask << 9) | 0x1ff);
        expect(cpu.pc).toBe(mask & flags ? 0x3000 : 0x3001);
        expect(cpu.psr).toBe(flags);
      }
    }
  });

  it("covers all PC-relative offsets including address wrapping", () => {
    const { cpu, memory } = machine();
    for (const opcode of [0x0000, 0x2000, 0x3000, 0x4000, 0xe000]) {
      const bits = opcode === 0x4000 ? 11 : 9;
      for (const pc of [0, 0x3001, 0x37ff, 0xffff]) {
        for (let raw = 0; raw < 1 << bits; raw += 1) {
          const offset = raw < 1 << (bits - 1) ? raw : raw - (1 << bits);
          const address = (pc + offset) & 0xffff;
          // PSR and MCR are CPU registers rather than ordinary memory.
          if (
            (opcode === 0x2000 || opcode === 0x3000) &&
            (address === 0xfffc || address === 0xfffe)
          )
            continue;
          cpu.pc = pc;
          cpu.psr = 1;
          cpu.setReg(0, 0x1234);
          memory[address] = 0x8000;
          execute(
            cpu,
            opcode |
              (opcode === 0 ? 0x200 : opcode === 0x4000 ? 0x800 : 0) |
              raw,
          );
          if (opcode === 0x2000) {
            expect(cpu.reg(0)).toBe(0x8000);
            expect(cpu.psr & 7).toBe(4);
          } else if (opcode === 0x3000) {
            expect(memory[address]).toBe(0x1234);
          } else if (opcode === 0xe000) {
            expect(cpu.reg(0)).toBe(address);
            expect(cpu.psr).toBe(1);
          } else {
            expect(cpu.pc).toBe(address);
            if (opcode === 0x4000) expect(cpu.reg(7)).toBe(pc);
          }
        }
      }
    }
  });

  it("loads and stores indirectly with every signed offset", () => {
    const { cpu, memory } = machine();
    for (let raw = 0; raw < 512; raw += 1) {
      const offset = raw < 256 ? raw : raw - 512;
      memory[0x3001 + offset] = 0x4000;
      memory[0x4000] = 0x8000;
      execute(cpu, 0xa000 | raw);
      expect(cpu.reg(0)).toBe(0x8000);
      expect(cpu.psr & 7).toBe(4);
      cpu.setReg(0, 0x1234);
      execute(cpu, 0xb000 | raw);
      expect(memory[0x4000]).toBe(0x1234);
      expect(memory[0x8000]).toBe(0);
    }
  });

  it("wraps indirect pointer addresses", () => {
    const { cpu, memory } = machine(0xffff);
    memory[0] = 0x4000;
    memory[0x4000] = 0x8000;
    execute(cpu, 0xa001);
    expect(cpu.reg(0)).toBe(0x8000);
    cpu.setReg(0, 0x1234);
    execute(cpu, 0xb001);
    expect(memory[0x4000]).toBe(0x1234);
  });

  it("covers all base offsets and their wrapping addresses", () => {
    const { cpu, memory } = machine();
    for (const base of [0, 0x4000, 0xffff]) {
      for (let raw = 0; raw < 64; raw += 1) {
        const offset = raw < 32 ? raw : raw - 64;
        const address = (base + offset) & 0xffff;
        if (address === 0xfffc || address === 0xfffe) continue;
        cpu.setReg(1, base);
        memory[address] = 0x8000;
        execute(cpu, 0x6040 | raw);
        expect(cpu.reg(0)).toBe(0x8000);
        expect(cpu.psr & 7).toBe(4);
        cpu.setReg(0, 0x1234);
        execute(cpu, 0x7040 | raw);
        expect(memory[address]).toBe(0x1234);
      }
    }
  });

  it("jumps through every base register and uses the old R7 for JSRR", () => {
    const { cpu } = machine();
    for (let base = 0; base < 8; base += 1) {
      cpu.pc = 0x3001;
      cpu.setReg(base, 0x4321);
      execute(cpu, 0xc000 | (base << 6));
      expect(cpu.pc).toBe(0x4321);
      cpu.pc = 0x3001;
      cpu.setReg(base, 0x4321);
      execute(cpu, 0x4000 | (base << 6));
      expect(cpu.pc).toBe(0x4321);
      expect(cpu.reg(7)).toBe(0x3001);
    }
  });

  it("gives each opcode a single decoder, including the RET alias", () => {
    for (let word = 0; word <= 0xffff; word += 1) {
      const matches = LC3.instructions.filter(
        (spec) => spec.opcode === word >>> 12 && (spec.match?.(word) ?? true),
      );
      expect(matches).toHaveLength(word >> 12 === 0xd ? 0 : 1);
    }
    expect(disassemble(0xc1c0)).toBe("RET");
  });

  it.each([
    [0x103f, "ADD R0, R0, #-1"],
    [0x5030, "AND R0, R0, #-16"],
    [0x607f, "LDR R0, R1, #-1"],
    [0x707f, "STR R0, R1, #-1"],
    [0x8000, "RTI"],
    [0xc040, "JMP R1"],
  ])("disassembles word %i with signed operands", (word, text) => {
    expect(disassemble(word)).toBe(text);
  });

  it("preserves never-branch words when reassembled", () => {
    for (const word of [0, 1, 0x1ff]) {
      const text = disassemble(word);
      const { words } = assemble(
        parse(tokenize(`.ORIG x3000\n${text}\n.END\n`)),
      );
      expect(words[0]).toBe(word);
    }
  });

  it("uses the instruction address plus one for labels and wraps it", () => {
    const symbols = new Map([[0, "TARGET"]]);
    for (const word of [
      0x0e00, 0x2000, 0x3000, 0x4800, 0xa000, 0xb000, 0xe000,
    ]) {
      expect(disassemble(word, 0xffff, symbols)).toContain("TARGET");
    }
  });

  it("round-trips every canonical instruction variant through the assembler", () => {
    const words = [
      0x1283, 0x12bf, 0x5283, 0x52b0, 0x0800, 0xc080, 0x4800, 0x4080, 0x2200,
      0xa200, 0x6280, 0xe200, 0x92bf, 0xc1c0, 0x8000, 0x3200, 0xb200, 0x7280,
      0xf020,
    ];
    const source = words.map((word) => disassemble(word)).join("\n");
    const { words: assembled } = assemble(
      parse(tokenize(`.ORIG x3000\n${source}\n.END\n`)),
    );
    expect(assembled).toEqual(words);
  });
});
