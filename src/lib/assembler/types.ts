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
  | { type: "stringz"; value: string }
  /** `.EXTERNAL MODULE-LABEL`: a label of another module. */
  | { type: "external"; name: string };

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

/** How bad a diagnostic is. Info notes don't stop a build. */
export type Severity = "error" | "warning" | "info";

export type Diagnostic = {
  /** The project file, or null for whole-program problems. */
  file: string | null;
  position: SourcePosition | null;
  severity: Severity;
  text: string;
};

/** A word the linker patches once it knows where modules go. */
export type Relocation =
  /** `.FILL LOCAL_LABEL`: add the module's base address. */
  | { kind: "local-abs16"; offset: number }
  | {
      kind: "abs16" | "pc9" | "pc11";
      offset: number;
      /** The qualified name as written, e.g. `TRIG-SIN`. */
      external: string;
      line: number;
    };

/** One file, assembled as if it started at address 0. */
export type ObjectModule = {
  /** The module name, as used in prefixes: the file's base name. */
  name: string;
  /** "local" | `group:${number}` | `admin:${userId}`; phase 1 uses "local". */
  namespace: string;
  /** The project path, for diagnostics and source maps. */
  file: string;
  /** The .ORIG operand, if any. Only the entry file's is used. */
  origin: number | null;
  /** Externals are encoded as 0. */
  words: Array<number>;
  /** Label -> offset. */
  symbols: Map<string, number>;
  /** Qualified name as written -> where it points and the .EXTERNAL line. */
  externals: Map<string, { module: string; label: string; line: number }>;
  relocations: Array<Relocation>;
  /** Offset -> line. */
  sourceMap: Map<number, number>;
  /** Info notes, e.g. an ignored .ORIG. */
  diagnostics: Array<Diagnostic>;
};

export type LinkResult =
  | { ok: true; image: LinkedImage; diagnostics: Array<Diagnostic> }
  | { ok: false; diagnostics: Array<Diagnostic> };
