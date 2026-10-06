import type { InstructionSpec, IsaDefinition } from "./types";

const FIVE_BIT_MASK = 0b11111;
const SIX_BIT_MASK = 0b111111;
const NINE_BIT_MASK = 0b111111111;
const ELEVEN_BIT_MASK = 0b11111111111;

type DR_SR1_Register_Addressing = {
  dr: number;
  sr1: number;
  sr2_or_imm5:
    | {
        type: "register";
        sr2: number;
      }
    | {
        type: "immediate";
        imm5: number;
      };
};

type PC_Offset_Addressing = {
  dr: number;
  address: number;
};

const ADD: InstructionSpec<DR_SR1_Register_Addressing> = {
  mnemonic: "ADD",
  opcode: 0b0001,
  decode: (word: number) => ({
    dr: (word >> 9) & 0b111,
    sr1: (word >> 6) & 0b111,
    sr2_or_imm5:
      (word >> 5) & 1
        ? { type: "immediate", imm5: word & FIVE_BIT_MASK }
        : { type: "register", sr2: word & 0b111 },
  }),
  execute: (cpu, fields) => {
    const sr2_or_imm5 = fields.sr2_or_imm5;
    const value2 =
      sr2_or_imm5.type === "register"
        ? cpu.reg(sr2_or_imm5.sr2)
        : signExtend(sr2_or_imm5.imm5, 5);
    const result = (cpu.reg(fields.sr1) + value2) & 0xffff;
    cpu.setReg(fields.dr, result);
    cpu.setCC(result);
  },
  disassemble: (fields) => {
    const sr2_or_imm5 = fields.sr2_or_imm5;
    if (sr2_or_imm5.type === "register") {
      return `ADD R${fields.dr}, R${fields.sr1}, R${sr2_or_imm5.sr2}`;
    } else {
      return `ADD R${fields.dr}, R${fields.sr1}, #${signExtend(sr2_or_imm5.imm5, 5)}`;
    }
  },
};

const AND: InstructionSpec<DR_SR1_Register_Addressing> = {
  mnemonic: "AND",
  opcode: 0b0101,
  decode: (word: number) => ({
    dr: (word >> 9) & 0b111,
    sr1: (word >> 6) & 0b111,
    sr2_or_imm5:
      (word >> 5) & 1
        ? { type: "immediate", imm5: word & FIVE_BIT_MASK }
        : { type: "register", sr2: word & 0b111 },
  }),
  execute: (cpu, fields) => {
    const sr2_or_imm5 = fields.sr2_or_imm5;
    const value2 =
      sr2_or_imm5.type === "register"
        ? cpu.reg(sr2_or_imm5.sr2)
        : signExtend(sr2_or_imm5.imm5, 5);
    const result = cpu.reg(fields.sr1) & value2;
    cpu.setReg(fields.dr, result);
    cpu.setCC(result);
  },
  disassemble: (fields) => {
    const sr2_or_imm5 = fields.sr2_or_imm5;
    if (sr2_or_imm5.type === "register") {
      return `AND R${fields.dr}, R${fields.sr1}, R${sr2_or_imm5.sr2}`;
    } else {
      return `AND R${fields.dr}, R${fields.sr1}, #${signExtend(sr2_or_imm5.imm5, 5)}`;
    }
  },
};

const NOT: InstructionSpec<{
  dr: number;
  sr: number;
}> = {
  mnemonic: "NOT",
  opcode: 0b1001,
  decode: (word: number) => ({
    dr: (word >> 9) & 0b111,
    sr: (word >> 6) & 0b111,
  }),
  execute: (cpu, fields) => {
    const result = ~cpu.reg(fields.sr) & 0xffff;
    cpu.setReg(fields.dr, result);
    cpu.setCC(result);
  },
  disassemble: (fields) => `NOT R${fields.dr}, R${fields.sr}`,
};

const BR: InstructionSpec<{
  n: boolean;
  z: boolean;
  p: boolean;
  pc_offset_9: number;
}> = {
  mnemonic: "BR",
  opcode: 0b0000,
  decode: (word: number) => ({
    n: ((word >> 11) & 1) === 1,
    z: ((word >> 10) & 1) === 1,
    p: ((word >> 9) & 1) === 1,
    pc_offset_9: signExtend(word & NINE_BIT_MASK, 9),
  }),
  execute: (cpu, fields) => {
    const mask =
      (Number(fields.n) << 2) | (Number(fields.z) << 1) | Number(fields.p);
    if ((cpu.psr & mask) !== 0) {
      cpu.pc = (cpu.pc + fields.pc_offset_9) & 0xffff;
    }
  },
  disassemble: (fields, ctx) => {
    const cc = `${fields.n ? "n" : ""}${fields.z ? "z" : ""}${fields.p ? "p" : ""}`;
    if (cc === "") {
      // Bare BR means BRnzp in assembly; preserve a never-branch word as data.
      return `.FILL x${(fields.pc_offset_9 & NINE_BIT_MASK).toString(16).padStart(4, "0")}`;
    }
    const offsetAddr = (ctx.pc + 1 + fields.pc_offset_9) & 0xffff;
    const label = ctx.symbols.get(offsetAddr);
    return label
      ? `BR${cc} ${label}`
      : `BR${cc} #${fields.pc_offset_9} ; x${offsetAddr.toString(16).padStart(4, "0").toUpperCase()}`;
  },
};

const JMP: InstructionSpec<{ baseR: number }> = {
  mnemonic: "JMP",
  opcode: 0b1100,
  match: (word: number) => ((word >> 6) & 0b111) !== 7,
  decode: (word: number) => ({
    baseR: (word >> 6) & 0b111,
  }),
  execute: (cpu, fields) => {
    const address = cpu.reg(fields.baseR);
    cpu.pc = address;
  },
  disassemble: (fields) => `JMP R${fields.baseR}`,
};

const JSR: InstructionSpec<{ pc_offset_11: number }> = {
  mnemonic: "JSR",
  flow: "call",
  opcode: 0b0100,
  match: (word: number) => ((word >> 11) & 1) === 1,
  decode: (word: number) => ({
    pc_offset_11: signExtend(word & ELEVEN_BIT_MASK, 11),
  }),
  execute: (cpu, fields) => {
    cpu.setReg(7, cpu.pc);
    cpu.pc = (cpu.pc + fields.pc_offset_11) & 0xffff;
  },
  disassemble: (fields, ctx) => {
    const offsetAddr = (ctx.pc + 1 + fields.pc_offset_11) & 0xffff;
    const label = ctx.symbols.get(offsetAddr);
    return label
      ? `JSR ${label}`
      : `JSR #${fields.pc_offset_11} ; x${offsetAddr.toString(16).padStart(4, "0").toUpperCase()}`;
  },
};

const JSRR: InstructionSpec<{
  baseR: number;
}> = {
  mnemonic: "JSRR",
  flow: "call",
  opcode: 0b0100,
  match: (word: number) => ((word >> 11) & 1) === 0,
  decode: (word: number) => ({ baseR: (word >> 6) & 0b111 }),
  execute: (cpu, fields) => {
    const address = cpu.reg(fields.baseR);
    cpu.setReg(7, cpu.pc);
    cpu.pc = address;
  },
  disassemble: (fields) => `JSRR R${fields.baseR}`,
};

const LD: InstructionSpec<PC_Offset_Addressing> = {
  mnemonic: "LD",
  opcode: 0b0010,
  decode: (word: number) => ({
    dr: (word >> 9) & 0b111,
    address: signExtend(word & 0x1ff, 9),
  }),
  execute: (cpu, fields) => {
    const value = cpu.read((cpu.pc + fields.address) & 0xffff);
    cpu.setReg(fields.dr, value);
    cpu.setCC(value);
  },
  disassemble: (fields, ctx) => {
    const offsetAddr = (ctx.pc + 1 + fields.address) & 0xffff;
    const label = ctx.symbols.get(offsetAddr);
    return label
      ? `LD R${fields.dr}, ${label}`
      : `LD R${fields.dr}, #${fields.address} ; x${offsetAddr.toString(16).padStart(4, "0").toUpperCase()}`;
  },
};

const LDI: InstructionSpec<PC_Offset_Addressing> = {
  mnemonic: "LDI",
  opcode: 0b1010,
  decode: (word: number) => ({
    dr: (word >> 9) & 0b111,
    address: signExtend(word & 0x1ff, 9),
  }),
  execute: (cpu, fields) => {
    const address = cpu.read((cpu.pc + fields.address) & 0xffff);
    const value = cpu.read(address);
    cpu.setReg(fields.dr, value);
    cpu.setCC(value);
  },
  disassemble: (fields, ctx) => {
    const offsetAddr = (ctx.pc + 1 + fields.address) & 0xffff;
    const label = ctx.symbols.get(offsetAddr);
    return label
      ? `LDI R${fields.dr}, ${label}`
      : `LDI R${fields.dr}, #${fields.address} ; x${offsetAddr.toString(16).padStart(4, "0").toUpperCase()}`;
  },
};

const LDR: InstructionSpec<{
  dr: number;
  baseR: number;
  offset_6: number;
}> = {
  mnemonic: "LDR",
  opcode: 0b0110,
  decode: (word: number) => ({
    dr: (word >> 9) & 0b111,
    baseR: (word >> 6) & 0b111,
    offset_6: signExtend(word & SIX_BIT_MASK, 6),
  }),
  execute: (cpu, fields) => {
    const value = cpu.read((cpu.reg(fields.baseR) + fields.offset_6) & 0xffff);
    cpu.setReg(fields.dr, value);
    cpu.setCC(value);
  },
  disassemble: (fields) =>
    `LDR R${fields.dr}, R${fields.baseR}, #${fields.offset_6}`,
};

const LEA: InstructionSpec<PC_Offset_Addressing> = {
  mnemonic: "LEA",
  opcode: 0b1110,
  decode: (word: number) => ({
    dr: (word >> 9) & 0b111,
    address: signExtend(word & NINE_BIT_MASK, 9),
  }),
  execute: (cpu, fields) => {
    cpu.setReg(fields.dr, (cpu.pc + fields.address) & 0xffff);
  },
  disassemble: (fields, ctx) => {
    const offsetAddr = (ctx.pc + 1 + fields.address) & 0xffff;
    const label = ctx.symbols.get(offsetAddr);
    return label
      ? `LEA R${fields.dr}, ${label}`
      : `LEA R${fields.dr}, #${fields.address} ; x${offsetAddr.toString(16).padStart(4, "0").toUpperCase()}`;
  },
};

const RET: InstructionSpec<undefined> = {
  mnemonic: "RET",
  flow: "return",
  opcode: 0b1100,
  match: (word: number) => ((word >> 6) & 0b111) === 7,
  decode: () => undefined,
  execute: (cpu) => {
    cpu.pc = cpu.reg(7);
  },
  disassemble: () => `RET`,
};

const RTI: InstructionSpec<undefined> = {
  mnemonic: "RTI",
  flow: "return",
  opcode: 0b1000,
  decode: () => undefined,
  execute: (cpu) => cpu.returnFromInterrupt(),
  disassemble: () => `RTI`,
};

const ST: InstructionSpec<{
  sr: number;
  address: number;
}> = {
  mnemonic: "ST",
  opcode: 0b0011,
  decode: (word: number) => ({
    sr: (word >> 9) & 0b111,
    address: signExtend(word & 0x1ff, 9),
  }),
  execute: (cpu, fields) => {
    const address = (cpu.pc + fields.address) & 0xffff;
    cpu.write(address, cpu.reg(fields.sr));
  },
  disassemble: (fields, ctx) => {
    const offsetAddr = (ctx.pc + 1 + fields.address) & 0xffff;
    const label = ctx.symbols.get(offsetAddr);
    return label
      ? `ST R${fields.sr}, ${label}`
      : `ST R${fields.sr}, #${fields.address} ; x${offsetAddr.toString(16).padStart(4, "0").toUpperCase()}`;
  },
};

const STI: InstructionSpec<{
  sr: number;
  address: number;
}> = {
  mnemonic: "STI",
  opcode: 0b1011,
  decode: (word: number) => ({
    sr: (word >> 9) & 0b111,
    address: signExtend(word & 0x1ff, 9),
  }),
  execute: (cpu, fields) => {
    const address = cpu.read((cpu.pc + fields.address) & 0xffff);
    cpu.write(address, cpu.reg(fields.sr));
  },
  disassemble: (fields, ctx) => {
    const offsetAddr = (ctx.pc + 1 + fields.address) & 0xffff;
    const label = ctx.symbols.get(offsetAddr);
    return label
      ? `STI R${fields.sr}, ${label}`
      : `STI R${fields.sr}, #${fields.address} ; x${offsetAddr.toString(16).padStart(4, "0").toUpperCase()}`;
  },
};

const STR: InstructionSpec<{
  sr: number;
  baseR: number;
  offset_6: number;
}> = {
  mnemonic: "STR",
  opcode: 0b0111,
  decode: (word: number) => ({
    sr: (word >> 9) & 0b111,
    baseR: (word >> 6) & 0b111,
    offset_6: signExtend(word & SIX_BIT_MASK, 6),
  }),
  execute: (cpu, fields) => {
    cpu.write(
      (cpu.reg(fields.baseR) + fields.offset_6) & 0xffff,
      cpu.reg(fields.sr),
    );
  },
  disassemble: (fields) =>
    `STR R${fields.sr}, R${fields.baseR}, #${fields.offset_6}`,
};

const TRAP: InstructionSpec<{
  vector: number;
}> = {
  mnemonic: "TRAP",
  flow: "call",
  opcode: 0b1111,
  decode: (word: number) => ({ vector: word & 0xff }),
  execute: (cpu, fields) => cpu.trap(fields.vector),
  disassemble: (fields) =>
    `TRAP x${fields.vector.toString(16).padStart(2, "0").toUpperCase()}`,
};

// Patt/Patel third edition: LEA preserves CC; TRAP/RTI use the supervisor stack.
export const LC3: IsaDefinition = {
  name: "LC-3",
  instructions: [
    ADD,
    AND,
    BR,
    JMP,
    JSR,
    JSRR,
    LD,
    LDI,
    LDR,
    LEA,
    NOT,
    RET,
    RTI,
    ST,
    STI,
    STR,
    TRAP,
  ],
  memoryMap: {
    userStart: 0x3000,
    userEnd: 0xfdff,
    mmioStart: 0xfe00,
  },
};

function signExtend(value: number, bitCount: number): number {
  const mask = 1 << (bitCount - 1);
  return (value & mask) !== 0 ? value - (1 << bitCount) : value;
}
