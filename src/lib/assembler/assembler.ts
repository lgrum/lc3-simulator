import { OS_MODULE, baseName, moduleName } from "./linker";
import { isQualifiedName, splitQualifiedName } from "./parser";
import type {
  Diagnostic,
  Directive,
  DirectiveOperand,
  Instruction,
  ObjectModule,
  Offset,
  Program,
  Relocation,
  SourcePosition,
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
  /** The statement's line, or null for errors about the whole program. */
  readonly position: SourcePosition | null;

  constructor(text: string, line?: number) {
    super(text);
    this.name = "AssemblerError";
    this.text = text;
    this.position = line === undefined ? null : { line };
  }
}

export type AssembleOptions = {
  /** The project path, e.g. `lib/trig.asm`. Its base name names the module. */
  file?: string;
  namespace?: string;
  /** Whether this is the entry file, whose .ORIG sets the load address. */
  entry?: boolean;
};

/**
 * Assembles one file as if it started at address 0. PC-relative offsets
 * inside the file don't change when the linker moves it; `.FILL` of a local
 * label is left as a relocation.
 */
class Assembler {
  private origin: number | null = null;
  private readonly symbols = new Map<string, number>();
  private readonly words: Array<number> = [];
  private pc = 0;
  private readonly sourceMap = new Map<number, number>();
  private readonly relocations: Array<Relocation> = [];
  private readonly diagnostics: Array<Diagnostic> = [];
  private readonly externals: ObjectModule["externals"] = new Map();
  /** The line of the statement being processed, for error positions. */
  private line: number | undefined;

  constructor(
    private readonly statements: Array<Statement>,
    private readonly options: Required<AssembleOptions>,
  ) {}

  assemble(): ObjectModule {
    this.init();
    this.labelParse();
    this.collectExternals();
    this.encode();
    return {
      name: moduleName(this.options.file),
      namespace: this.options.namespace,
      file: this.options.file,
      origin: this.origin,
      words: this.words,
      symbols: this.symbols,
      externals: this.externals,
      relocations: this.relocations,
      sourceMap: this.sourceMap,
      diagnostics: this.diagnostics,
    };
  }

  private error(text: string): AssemblerError {
    return new AssemblerError(text, this.line);
  }

  /** Reads the optional .ORIG, which must come first when present. */
  private init(): void {
    if (this.statements.length === 0) {
      throw this.error("Expected statements, found none");
    }
    // .EXTERNAL lines emit nothing and may come before .ORIG.
    const statement = this.statements.find(
      (s) =>
        s.kind.type !== "directive" || s.kind.directive.type !== "external",
    );
    const origs = this.statements.filter(
      (s) => s.kind.type === "directive" && s.kind.directive.type === "orig",
    );
    if (origs.length === 0 || !statement) return;
    if (origs[0] !== statement) {
      this.line = origs[0].line;
      throw this.error(".ORIG must be the first statement");
    }
    this.line = statement.line;
    if (statement.label !== null) {
      throw this.error(".ORIG cannot have a label");
    }
    if (
      statement.kind.type !== "directive" ||
      statement.kind.directive.type !== "orig" ||
      statement.kind.directive.operand.type !== "immediate"
    ) {
      throw this.error(".ORIG must have a number literal operand");
    }
    if (origs.length > 1) {
      this.line = origs[1].line;
      throw this.error("Multiple .ORIG blocks are not supported");
    }
    this.origin = toWord(statement.kind.directive.operand.value);
    if (!this.options.entry)
      this.diagnostics.push({
        file: this.options.file,
        position: { line: statement.line },
        severity: "info",
        text: ".ORIG is ignored in modules; the linker places this code",
      });
  }

  private labelParse(): void {
    let pc = 0;
    for (const statement of this.statements) {
      this.line = statement.line;
      if (statement.label !== null) {
        if (this.symbols.has(statement.label))
          throw this.error(`Duplicate label ${statement.label}`);
        this.symbols.set(statement.label, pc);
      }
      pc = toWord(pc + statementSize(statement));
    }
  }

  /**
   * Reads every `.EXTERNAL`, in source order. Repeats have no effect. A file
   * can't import its own labels, a label it defines, or the OS's labels.
   */
  private collectExternals(): void {
    const ownModule = moduleName(this.options.file);
    for (const statement of this.statements) {
      if (
        statement.kind.type !== "directive" ||
        statement.kind.directive.type !== "external"
      )
        continue;
      this.line = statement.line;
      const { name } = statement.kind.directive;
      if (this.externals.has(name)) continue;
      const { module, label } = splitQualifiedName(name);
      if (module.toLowerCase() === ownModule.toLowerCase())
        throw this.error(
          `${baseName(this.options.file)} can't import its own labels; use ${label}`,
        );
      if (module.toLowerCase() === OS_MODULE)
        throw this.error(
          `Programs can't import labels of the OS (${OS_MODULE}.asm); call it with TRAP`,
        );
      if (this.symbols.has(label))
        throw this.error(
          `${label} is defined in this file, so .EXTERNAL ${name} can't import it`,
        );
      this.externals.set(name, { module, label, line: statement.line });
    }
  }

  /** Whether `name` matches a `.EXTERNAL` of this file. */
  private isDeclared(name: string): boolean {
    const wanted = splitQualifiedName(name);
    for (const external of this.externals.values())
      if (
        external.module.toLowerCase() === wanted.module.toLowerCase() &&
        external.label === wanted.label
      )
        return true;
    return false;
  }

  private requireDeclared(name: string): void {
    if (!this.isDeclared(name))
      throw this.error(`${name} is used without .EXTERNAL ${name}`);
  }

  private encode(): void {
    this.pc = 0;
    for (const statement of this.statements) {
      this.line = statement.line;
      const size = statementSize(statement);
      if (this.words.length + size > 0x10000)
        throw this.error("Program exceeds 65,536 words");
      for (let i = 0; i < size; i++)
        this.sourceMap.set(toWord(this.pc + i), statement.line);
      this.pc = toWord(this.pc + size);
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
        return;
      case "blkw": {
        const count = blockSize(directive, this.line);
        for (let i = 0; i < count; i += 1) {
          this.words.push(0);
        }
        return;
      }
      case "fill":
        if (
          directive.operand.type === "label" &&
          isQualifiedName(directive.operand.label)
        ) {
          this.requireDeclared(directive.operand.label);
          this.relocations.push({
            kind: "abs16",
            offset: this.words.length,
            external: directive.operand.label,
            line: this.line ?? 0,
          });
          this.words.push(0);
          return;
        }
        if (directive.operand.type === "label")
          this.relocations.push({
            kind: "local-abs16",
            offset: this.words.length,
          });
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
      case "external":
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
      this.encodeOffset(instruction.offset_6, 6, `an ${name} offset`)
    );
  }

  /**
   * A PC-relative offset, or a base offset for LDR and STR (6 bits). An
   * imported label is left to the linker, which checks that it reaches.
   */
  private encodeOffset(offset: Offset, bits: number, use = ""): number {
    if (offset.type === "label" && isQualifiedName(offset.label)) {
      if (bits === 6)
        throw this.error(`External labels can't be used as ${use}`);
      this.requireDeclared(offset.label);
      this.relocations.push({
        kind: bits === 9 ? "pc9" : "pc11",
        offset: this.words.length,
        external: offset.label,
        line: this.line ?? 0,
      });
      return 0;
    }
    const value =
      offset.type === "immediate"
        ? offset.value
        : signedWord(this.symbol(offset.label) - this.pc);
    return this.encodeSigned(value, bits);
  }

  /** A label's offset from the start of the file, as before relocation. */
  private encodeTrapVector(offset: Offset): number {
    if (offset.type === "label" && isQualifiedName(offset.label))
      throw this.error("External labels can't be used in TRAP");
    const value =
      offset.type === "immediate" ? offset.value : this.symbol(offset.label);
    return this.encodeUnsigned(value, 8);
  }

  private symbol(label: string, directive?: string): number {
    if (isQualifiedName(label)) this.requireDeclared(label);
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

function blockSize(
  directive: { operand: DirectiveOperand },
  line?: number,
): number {
  if (directive.operand.type !== "immediate") {
    throw new AssemblerError(".BLKW must have a number literal operand", line);
  }
  if (directive.operand.value < 0) {
    throw new AssemblerError(".BLKW can't have a negative value", line);
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
      return blockSize(directive, statement.line);
    case "stringz":
      return Array.from(directive.value).length + 1;
    case "orig":
    case "end":
    case "external":
      return 0;
    case "fill":
      return 1;
  }
}

/** Assembles one file into a relocatable module; throws its first error. */
export function assemble(
  program: Program,
  {
    file = "main.asm",
    namespace = "local",
    entry = true,
  }: AssembleOptions = {},
): ObjectModule {
  return new Assembler(program.statements, {
    file,
    namespace,
    entry,
  }).assemble();
}
