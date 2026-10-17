export type TokenType =
  | "identifier"
  | "opcode"
  | "trap"
  | "register"
  | "directive"
  | "number_literal"
  | "string_literal"
  | "comma"
  | "colon"
  | "newline"
  | "eof";

/**
 * Where an assembly error applies, for editor markers. Lines and columns are
 * 1-based and endColumn is exclusive. Without columns, the error applies to
 * the whole line. Columns count UTF-8 bytes, which equals characters for
 * ASCII source.
 */
export type SourcePosition = {
  line: number;
  column?: number;
  endColumn?: number;
};

export type Token = {
  type: TokenType;
  lexeme: string;
  line: number;
  column: number;
};

export type DirectiveOperand =
  | { type: "immediate"; value: number }
  | { type: "label"; label: string };

export type RegisterOrImmediate =
  | { type: "register"; register: number }
  | { type: "immediate"; value: number };

export type Offset = DirectiveOperand;

export type Instruction =
  | {
      type: "add" | "and";
      dr: number;
      sr1: number;
      sr2_or_imm5: RegisterOrImmediate;
    }
  | {
      type: "br";
      n: boolean;
      z: boolean;
      p: boolean;
      pc_offset_9: Offset;
    }
  | { type: "jmp" | "jsrr"; base_r: number }
  | { type: "jsr"; pc_offset_11: Offset }
  | {
      type: "ld" | "ldi" | "lea" | "st" | "sti";
      dr: number;
      pc_offset_9: Offset;
    }
  | { type: "ldr" | "str"; dr: number; base_r: number; offset_6: Offset }
  | { type: "not"; dr: number; sr: number }
  | { type: "ret" | "rti" }
  | { type: "trap"; trapvect_8: Offset };

export type Directive =
  | { type: "orig" | "fill" | "blkw"; operand: DirectiveOperand }
  | { type: "end" }
  | { type: "stringz"; value: string };

export type StatementKind =
  | { type: "instruction"; instruction: Instruction }
  | { type: "directive"; directive: Directive };

export type Statement = {
  line: number;
  label: string | null;
  kind: StatementKind;
};

export type Program = { statements: Array<Statement> };

export type LoadedProgram = {
  origin: number;
  words: Array<number>;
  symbols: Map<string, number>;
  sourceMap: Map<number, number>;
};
export type AssemblyResult = LoadedProgram;

/** A line in a project file, e.g. `{ file: "main.asm", line: 7 }`. */
export type SourceLocation = { file: string; line: number };

/** Consecutive words loaded at `origin`, all from one file. */
export type Segment = { origin: number; words: Array<number>; file: string };

/** One module's place in a linked image, for the Link map view. */
export type LinkMapEntry = {
  file: string;
  module: string;
  start: number;
  /** Inclusive. */
  end: number;
  symbols: Array<{ name: string; addr: number }>;
};

/** A whole program, ready to load: one segment per linked file. */
export type LinkedImage = {
  /** The PC starts here. */
  entry: number;
  segments: Array<Segment>;
  /** Display name -> address. */
  symbols: Map<string, number>;
  sourceMap: Map<number, SourceLocation>;
  map: Array<LinkMapEntry>;
};
