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
