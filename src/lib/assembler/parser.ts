import { parseRegister } from "./lexer";
import type {
  Directive,
  DirectiveOperand,
  Instruction,
  Offset,
  Program,
  RegisterOrImmediate,
  Statement,
  StatementKind,
  Token,
  TokenType,
} from "./types";

const TRAP_VECTORS = new Map([
  ["GETC", 0x20],
  ["OUT", 0x21],
  ["PUTS", 0x22],
  ["IN", 0x23],
  ["PUTSP", 0x24],
  ["HALT", 0x25],
]);

export class ParserError extends Error {
  readonly token: Token;
  readonly text: string;

  constructor(text: string, token: Token) {
    super(`${text} at ${token.line}:${token.column - 1}`);
    this.name = "ParserError";
    this.token = token;
    this.text = text;
  }
}

class Parser {
  private current = 0;

  constructor(private readonly tokens: Array<Token>) {}

  parse(): Program {
    const statements: Array<Statement> = [];

    this.skipNewlines();
    while (!this.isAtEnd()) {
      statements.push(this.parseStatement());
      this.skipNewlines();
    }

    return { statements };
  }

  private error(text: string, token = this.peek()): ParserError {
    return new ParserError(text, token);
  }

  private peek(): Token {
    const token = this.tokens.at(this.current);
    if (!token) {
      throw new Error("Parser requires an EOF token");
    }
    return token;
  }

  private isAtEnd(): boolean {
    return this.peek().type === "eof";
  }

  private advance(): Token {
    const token = this.peek();
    if (!this.isAtEnd()) {
      this.current += 1;
    }
    return token;
  }

  private checkToken(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw this.error(`Expected ${type} but found ${token.type} instead`);
    }
    this.advance();
    return token;
  }

  private skipNewlines(): void {
    while (this.checkToken("newline")) {
      this.advance();
    }
  }

  private parseStatement(): Statement {
    this.skipNewlines();
    if (this.isAtEnd()) {
      throw this.error("No more tokens exist");
    }

    const label = this.parseOptionalLabel();
    this.skipNewlines();

    const line = this.peek().line;
    const kind: StatementKind = this.checkToken("directive")
      ? { type: "directive", directive: this.parseDirective() }
      : { type: "instruction", instruction: this.parseInstruction() };

    if (!this.checkToken("newline")) {
      throw this.error(
        `All statements must end with a new line character, found '${this.peek().lexeme}'`,
      );
    }
    this.advance();

    return { line, label, kind };
  }

  private parseDirective(): Directive {
    const token = this.advance();
    switch (token.lexeme.toUpperCase()) {
      case ".ORIG":
        return { type: "orig", operand: this.parseDirectiveOperand() };
      case ".FILL":
        return { type: "fill", operand: this.parseDirectiveOperand() };
      case ".BLKW":
        return { type: "blkw", operand: this.parseDirectiveOperand() };
      case ".END":
        return { type: "end" };
      case ".STRINGZ": {
        if (!this.checkToken("string_literal")) {
          throw this.error("Expected string literal after .STRINGZ");
        }
        const lexeme = this.advance().lexeme;
        return { type: "stringz", value: lexeme.slice(1, -1) };
      }
      default:
        throw this.error(`Unknown directive '${token.lexeme}'`, token);
    }
  }

  private parseDirectiveOperand(): DirectiveOperand {
    const token = this.advance();
    switch (token.type) {
      case "number_literal":
        return { type: "immediate", value: this.parseNumber(token) };
      case "identifier":
        return { type: "label", label: token.lexeme };
      default:
        throw this.error("Expected operand");
    }
  }

  private parseInstruction(): Instruction {
    if (this.checkToken("trap")) {
      const token = this.advance();
      const vector = TRAP_VECTORS.get(token.lexeme.toUpperCase());
      if (vector === undefined) {
        throw this.error(`Expected routine, found '${token.lexeme}'`);
      }
      return { type: "trap", trapvect_8: { type: "immediate", value: vector } };
    }

    const token = this.advance();
    const opcode = token.lexeme.toUpperCase();

    switch (opcode) {
      case "ADD":
      case "AND": {
        const dr = this.parseRegister();
        this.expect("comma");
        const sr1 = this.parseRegister();
        this.expect("comma");
        return {
          type: opcode.toLowerCase() as "add" | "and",
          dr,
          sr1,
          sr2_or_imm5: this.parseRegisterOrImmediate(),
        };
      }
      case "BR":
      case "BRN":
      case "BRZ":
      case "BRP":
      case "BRNZ":
      case "BRZP":
      case "BRNP":
      case "BRNZP": {
        const flags = opcode.slice(2);
        return {
          type: "br",
          n: flags === "" || flags.includes("N"),
          z: flags === "" || flags.includes("Z"),
          p: flags === "" || flags.includes("P"),
          pc_offset_9: this.parseOffset("pc_offset_9"),
        };
      }
      case "JMP":
      case "JSRR":
        return {
          type: opcode === "JMP" ? "jmp" : "jsrr",
          base_r: this.parseRegister(),
        };
      case "JSR":
        return { type: "jsr", pc_offset_11: this.parseOffset("pc_offset_11") };
      case "LD":
      case "LDI":
      case "LEA":
      case "ST":
      case "STI": {
        const dr = this.parseRegister();
        this.expect("comma");
        return {
          type: opcode.toLowerCase() as "ld" | "ldi" | "lea" | "st" | "sti",
          dr,
          pc_offset_9: this.parseOffset("pc_offset_9"),
        };
      }
      case "LDR":
      case "STR": {
        const dr = this.parseRegister();
        this.expect("comma");
        const base_r = this.parseRegister();
        this.expect("comma");
        return {
          type: opcode === "LDR" ? "ldr" : "str",
          dr,
          base_r,
          offset_6: this.parseOffset("offset_6"),
        };
      }
      case "NOT": {
        const dr = this.parseRegister();
        this.expect("comma");
        return { type: "not", dr, sr: this.parseRegister() };
      }
      case "RET":
        return { type: "ret" };
      case "RTI":
        return { type: "rti" };
      case "TRAP":
        return { type: "trap", trapvect_8: this.parseOffset("trapvect_8") };
      default:
        throw this.error(`Unknown opcode '${token.lexeme}'`, token);
    }
  }

  private parseOffset(operand: string): Offset {
    const token = this.advance();
    switch (token.type) {
      case "identifier":
        return { type: "label", label: token.lexeme };
      case "number_literal":
        return { type: "immediate", value: this.parseNumber(token) };
      default:
        throw this.error(`Expected '${operand}'`);
    }
  }

  private parseRegister(): number {
    const token = this.advance();
    const register =
      token.type === "register" ? parseRegister(token.lexeme) : null;
    if (register === null) {
      throw this.error(
        `Expected Register, found ${token.type} '${token.lexeme}'`,
        token,
      );
    }
    return register;
  }

  private parseRegisterOrImmediate(): RegisterOrImmediate {
    const token = this.advance();
    if (token.type === "register") {
      const register = parseRegister(token.lexeme);
      if (register !== null) {
        return { type: "register", register };
      }
    } else if (token.type === "number_literal") {
      return { type: "immediate", value: this.parseNumber(token) };
    }
    throw this.error("Expected register or immediate");
  }

  private parseNumber(token: Token): number {
    const lexeme = token.lexeme;
    let value: number;
    if (/^#-?\d+$/.test(lexeme)) {
      value = Number(lexeme.slice(1));
      if (value >= -0x8000 && value <= 0x7fff) {
        return value;
      }
    } else if (/^[xX][0-9a-fA-F]+$/.test(lexeme)) {
      value = Number.parseInt(lexeme.slice(1), 16);
      if (value <= 0xffff) {
        return value >= 0x8000 ? value - 0x10000 : value;
      }
    }
    throw this.error(`Invalid 16-bit number '${lexeme}'`, token);
  }

  private parseOptionalLabel(): string | null {
    const token = this.peek();
    if (token.type !== "identifier") {
      return null;
    }

    this.advance();
    if (this.checkToken("colon")) {
      this.advance();
    }
    return token.lexeme;
  }
}

export function parse(tokens: Array<Token>): Program {
  return new Parser(tokens).parse();
}
