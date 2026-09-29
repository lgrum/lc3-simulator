import type {
  AssemblyResult,
  Directive,
  DirectiveOperand,
  Instruction,
  Offset,
  Program,
  Statement,
} from "./types";

const PC_MEMORY_OPCODES = {
  ld: 0b0010,
  ldi: 0b1010,
  lea: 0b1110,
  st: 0b0011,
  sti: 0b1011,
} as const;

export class AssemblerError extends Error {
  readonly text: string;

  constructor(text: string) {
    super(text);
    this.name = "AssemblerError";
    this.text = text;
  }
}

class Assembler {
  private address = 0;
  private readonly symbols = new Map<string, number>();
  private readonly words: Array<number> = [];
  private pc = 0;

  constructor(private readonly statements: Array<Statement>) {}

  assemble(): AssemblyResult {
    this.init();
    this.labelParse();
    this.encode();
    return [this.words, this.symbols];
  }

  private error(text: string): AssemblerError {
    return new AssemblerError(text);
  }

  private init(): void {
    const statement = this.statements.at(0);
    if (!statement) {
      throw this.error("Expected statements, found none");
    }
    if (statement.label !== null) {
      throw this.error(".ORIG cannot have a label");
    }
    if (
      statement.kind.type !== "directive" ||
      statement.kind.directive.type !== "orig"
    ) {
      throw this.error("Expected .ORIG as first statement");
    }
    if (statement.kind.directive.operand.type !== "immediate") {
      throw this.error(".ORIG must have a number literal operand");
    }
    this.address = toWord(statement.kind.directive.operand.value);
  }

  private labelParse(): void {
    let pc = this.address;
    for (const statement of this.statements) {
      if (statement.label !== null) {
        this.symbols.set(statement.label, pc);
      }
      pc = toWord(pc + statementSize(statement));
    }
  }

  private encode(): void {
    this.pc = this.address;
    for (const statement of this.statements) {
      this.pc = toWord(this.pc + statementSize(statement));
      if (statement.kind.type === "directive") {
        this.encodeDirective(statement.kind.directive);
      } else {
        this.words.push(this.encodeInstruction(statement.kind.instruction));
      }
    }
  }

  private encodeDirective(directive: Directive): void {
    switch (directive.type) {
      case "orig":
        if (directive.operand.type !== "immediate") {
          throw this.error(".ORIG must have a number literal operand");
        }
        this.words.push(toWord(directive.operand.value));
        return;
      case "blkw": {
        const count = blockSize(directive);
        for (let i = 0; i < count; i += 1) {
          this.words.push(0);
        }
        return;
      }
      case "fill":
        this.words.push(
          directive.operand.type === "immediate"
            ? toWord(directive.operand.value)
            : this.symbol(directive.operand.label, ".FILL"),
        );
        return;
      case "stringz":
        for (const character of directive.value) {
          this.words.push(toWord(character.codePointAt(0) ?? 0));
        }
        this.words.push(0);
        return;
      case "end":
        return;
    }
  }

  private encodeInstruction(instruction: Instruction): number {
    switch (instruction.type) {
      case "add":
      case "and":
        return this.encodeArithmetic(instruction);
      case "br": {
        const nzp =
          (Number(instruction.n) << 2) |
          (Number(instruction.z) << 1) |
          Number(instruction.p);
        return (nzp << 9) | this.encodeOffset(instruction.pc_offset_9, 9);
      }
      case "jmp":
        return (
          (0b1100 << 12) |
          (this.register(instruction.base_r, "BaseR", "JMP") << 6)
        );
      case "jsr":
        return (
          (0b0100 << 12) |
          (1 << 11) |
          this.encodeOffset(instruction.pc_offset_11, 11)
        );
      case "jsrr":
        return (
          (0b0100 << 12) |
          (this.register(instruction.base_r, "BaseR", "JSRR") << 6)
        );
      case "ld":
      case "ldi":
      case "lea":
      case "st":
      case "sti":
        return this.encodePcMemory(instruction);
      case "ldr":
      case "str":
        return this.encodeBaseMemory(instruction);
      case "not":
        return (
          (0b1001 << 12) |
          (this.register(instruction.dr, "DR", "NOT") << 9) |
          (this.register(instruction.sr, "SR", "NOT") << 6) |
          0b111111
        );
      case "ret":
        return 0b1100000111000000;
      case "rti":
        return 0b1000000000000000;
      case "trap":
        return (0b1111 << 12) | this.encodeTrapVector(instruction.trapvect_8);
    }
  }

  private encodeArithmetic(
    instruction: Extract<Instruction, { type: "add" | "and" }>,
  ): number {
    const opcode = instruction.type === "add" ? 0b0001 : 0b0101;
    const name = instruction.type.toUpperCase();
    const dr = this.register(instruction.dr, "DR", name);
    const sr1 = this.register(instruction.sr1, "SR1", name);
    const operand = instruction.sr2_or_imm5;
    const last =
      operand.type === "register"
        ? this.register(operand.register, "SR2", name)
        : (1 << 5) | this.encodeSigned(operand.value, 5);
    return (opcode << 12) | (dr << 9) | (sr1 << 6) | last;
  }

  private encodePcMemory(
    instruction: Extract<
      Instruction,
      { type: "ld" | "ldi" | "lea" | "st" | "sti" }
    >,
  ): number {
    const dr = this.register(
      instruction.dr,
      "DR",
      instruction.type.toUpperCase(),
    );
    return (
      (PC_MEMORY_OPCODES[instruction.type] << 12) |
      (dr << 9) |
      this.encodeOffset(instruction.pc_offset_9, 9)
    );
  }

  private encodeBaseMemory(
    instruction: Extract<Instruction, { type: "ldr" | "str" }>,
  ): number {
    const opcode = instruction.type === "ldr" ? 0b0110 : 0b0111;
    const name = instruction.type.toUpperCase();
    const dr = this.register(instruction.dr, "DR", name);
    const base = this.register(instruction.base_r, "BaseR", name);
    return (
      (opcode << 12) |
      (dr << 9) |
      (base << 6) |
      this.encodeOffset(instruction.offset_6, 6)
    );
  }

  private encodeOffset(offset: Offset, bits: number): number {
    const value =
      offset.type === "immediate"
        ? offset.value
        : signedWord(this.symbol(offset.label) - this.pc);
    return this.encodeSigned(value, bits);
  }

  private encodeTrapVector(offset: Offset): number {
    const value =
      offset.type === "immediate"
        ? offset.value
        : toWord(this.symbol(offset.label) - this.address);
    return this.encodeUnsigned(value, 8);
  }

  private symbol(label: string, directive?: string): number {
    const value = this.symbols.get(label);
    if (value === undefined) {
      if (directive === ".FILL") {
        throw this.error(`Symbol ${label} not found in .FILL declaration`);
      }
      throw this.error(`Label ${label} doesn't exist`);
    }
    return value;
  }

  private register(value: number, role: string, instruction: string): number {
    if (!Number.isInteger(value) || value < 0 || value > 7) {
      throw this.error(`${role} in ${instruction} is not a valid register`);
    }
    return value;
  }

  private encodeSigned(value: number, bits: number): number {
    const min = -(1 << (bits - 1));
    const max = (1 << (bits - 1)) - 1;
    if (!Number.isInteger(value) || value < min || value > max) {
      throw this.error(`Immediate value ${value} is larger than ${bits} bits`);
    }
    return value & ((1 << bits) - 1);
  }

  private encodeUnsigned(value: number, bits: number): number {
    if (!Number.isInteger(value) || value < 0 || value >= 1 << bits) {
      throw this.error(`Trap vector ${value} is larger than ${bits} bits`);
    }
    return value;
  }
}

function toWord(value: number): number {
  return value & 0xffff;
}

function signedWord(value: number): number {
  const word = toWord(value);
  return word >= 0x8000 ? word - 0x10000 : word;
}

function blockSize(directive: { operand: DirectiveOperand }): number {
  if (directive.operand.type !== "immediate") {
    throw new AssemblerError(".BLKW must have a number literal operand");
  }
  if (directive.operand.value < 0) {
    throw new AssemblerError(".BLKW can't have a negative value");
  }
  return directive.operand.value;
}

function statementSize(statement: Statement): number {
  if (statement.kind.type !== "directive") {
    return 1;
  }

  const directive = statement.kind.directive;
  switch (directive.type) {
    case "blkw":
      return blockSize(directive);
    case "stringz":
      return Array.from(directive.value).length + 1;
    case "orig":
    case "end":
      return 0;
    case "fill":
      return 1;
  }
}

export function assemble(program: Program): AssemblyResult {
  return new Assembler(program.statements).assemble();
}
