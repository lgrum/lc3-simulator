import type { SourcePosition, Token, TokenType } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

// The scanner uses UTF-8 bytes like lexer.rs. All call sites pass ASCII characters.
function asciiByte(character: string): number {
  return character.charCodeAt(0);
}

export class LexerError extends Error {
  readonly text: string;
  /** The scanner position, one column past the offending text. */
  readonly line: number;
  readonly column: number;
  /** The offending text, from the start of its token to the scanner. */
  readonly position: SourcePosition;

  constructor(
    text: string,
    line: number,
    column: number,
    position: SourcePosition = { line, column: column - 1, endColumn: column },
  ) {
    super(`${text} at ${line}:${column - 1}`);
    this.name = "LexerError";
    this.text = text;
    this.line = line;
    this.column = column;
    this.position = position;
  }
}

export class Lexer {
  private source: Uint8Array;
  private start: number;
  private current: number;
  private line: number;
  private column: number;
  private tokenLine: number;
  private tokenColumn: number;

  private constructor(source: string) {
    this.source = encoder.encode(source);
    this.start = 0;
    this.current = 0;
    this.line = 1;
    this.column = 1;
    this.tokenLine = 1;
    this.tokenColumn = 1;
  }

  public static tokenize(input: string): Array<Token> {
    const tokens: Array<Token> = [];
    const lexer = new Lexer(input);

    let token: Token;
    do {
      token = lexer.nextToken();
      tokens.push(token);
    } while (token.type !== "eof");

    return tokens;
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private lexeme(): string {
    return decoder.decode(this.source.subarray(this.start, this.current));
  }

  private error(text: string): LexerError {
    return new LexerError(text, this.line, this.column, {
      line: this.tokenLine,
      column: this.tokenColumn,
      endColumn: Math.max(this.column, this.tokenColumn + 1),
    });
  }

  private makeToken(tokenType: TokenType): Token {
    return {
      type: tokenType,
      lexeme: this.lexeme(),
      line: this.tokenLine,
      column: this.tokenColumn,
    };
  }

  private peek(): number | null {
    if (this.isAtEnd()) {
      return null;
    }

    return this.source.at(this.current) ?? null;
  }

  private advance(): number | null {
    if (this.isAtEnd()) {
      return null;
    }

    const ch = this.peek();

    if (ch === null) {
      return null;
    }

    this.current += 1;

    if (ch === asciiByte("\n")) {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }

    return ch;
  }

  private skipIgnored(): void {
    while (this.peek() !== null) {
      const ch = this.peek();

      switch (ch) {
        case asciiByte(" "):
        case asciiByte("\t"):
        case asciiByte("\r"):
          this.advance();
          break;
        case asciiByte(";"):
          while (this.peek() !== asciiByte("\n") && this.peek() !== null) {
            this.advance();
          }
          break;
        default:
          return;
      }
    }
  }

  private nextToken(): Token {
    this.skipIgnored();

    this.start = this.current;
    this.tokenLine = this.line;
    this.tokenColumn = this.column;

    if (this.isAtEnd()) {
      return this.makeToken("eof");
    }

    const ch = this.advance();

    switch (ch) {
      case asciiByte(","):
        return this.makeToken("comma");
      case asciiByte(":"):
        return this.makeToken("colon");
      case asciiByte("\n"):
        return this.makeToken("newline");
      case asciiByte('"'): {
        return this.scanString();
      }
      case asciiByte("."): {
        return this.scanDirective();
      }
      case asciiByte("#"): {
        return this.scanDecimal();
      }
      case asciiByte("x"):
      case asciiByte("X"): {
        const peek = this.peek();
        if (isAsciiHexdigit(peek)) {
          return this.scanHexadecimal();
        }
        return this.scanIdentifierOrKeyword();
      }
      default: {
        if (isIdentifierStart(ch)) {
          return this.scanIdentifierOrKeyword();
        } else {
          throw this.error(
            `Unexpected character '${String.fromCharCode(ch!)}'`,
          );
        }
      }
    }
  }

  private scanString(): Token {
    while (this.peek() !== null) {
      const ch = this.peek();

      switch (ch) {
        case asciiByte("\n"):
          throw this.error("Unterminated string");
        case asciiByte('"'): {
          this.advance();
          return this.makeToken("string_literal");
        }
        default:
          this.advance();
      }
    }

    throw this.error("Unterminated string");
  }

  private scanDecimal(): Token {
    const digitStart = this.current;

    if (this.peek() === asciiByte("-")) {
      this.advance();
    }

    const numberStart = this.current;

    while (isAsciiDigit(this.peek())) {
      this.advance();
    }

    if (digitStart === this.current) {
      throw this.error("Expected decimal digits after '#'");
    }

    if (numberStart === this.current) {
      throw this.error("Invalid decimal literal");
    }

    return this.makeToken("number_literal");
  }

  private scanHexadecimal(): Token {
    while (isAsciiHexdigit(this.peek())) {
      this.advance();
    }

    if (isIdentifierContinue(this.peek())) {
      while (isIdentifierContinue(this.peek())) {
        this.advance();
      }
      throw this.error("Invalid hexadecimal literal");
    }

    return this.makeToken("number_literal");
  }

  private scanDirective(): Token {
    while (isIdentifierContinue(this.peek())) {
      this.advance();
    }

    if (this.current === this.start + 1) {
      throw this.error("Expected directive after '.'");
    }

    return this.makeToken("directive");
  }

  private scanIdentifierOrKeyword(): Token {
    while (isIdentifierContinue(this.peek())) {
      this.advance();
    }

    const text = this.lexeme();

    if (parseRegister(text) !== null) {
      return this.makeToken("register");
    }

    if (isOpcode(text)) {
      return this.makeToken("opcode");
    }

    if (isTrapRoutine(text)) {
      return this.makeToken("trap");
    }

    return this.makeToken("identifier");
  }
}

function isAsciiDigit(c: number | null): boolean {
  return c !== null && c >= asciiByte("0") && c <= asciiByte("9");
}

function isAsciiHexdigit(c: number | null): boolean {
  if (c === null) return false;
  return (
    (c >= asciiByte("0") && c <= asciiByte("9")) ||
    (c >= asciiByte("a") && c <= asciiByte("f")) ||
    (c >= asciiByte("A") && c <= asciiByte("F"))
  );
}

function isIdentifierContinue(c: number | null): boolean {
  if (c === null) return false;
  return (
    (c >= asciiByte("0") && c <= asciiByte("9")) ||
    (c >= asciiByte("a") && c <= asciiByte("z")) ||
    (c >= asciiByte("A") && c <= asciiByte("Z")) ||
    c === asciiByte("_")
  );
}

function isIdentifierStart(c: number | null): boolean {
  return (
    c !== null &&
    ((c >= asciiByte("a") && c <= asciiByte("z")) ||
      (c >= asciiByte("A") && c <= asciiByte("Z")) ||
      c === asciiByte("_"))
  );
}

function parseRegister(text: string): number | null {
  if (text.length !== 2) {
    return null;
  }

  const prefix = text[0];
  if (prefix !== "R" && prefix !== "r") {
    return null;
  }

  const regChar = text[1];
  // Rust's exclusive b'0'..b'7' range misses R7; LC-3 includes it.
  if (regChar >= "0" && regChar <= "7") {
    return regChar.charCodeAt(0) - asciiByte("0");
  }

  return null;
}

const OPCODES = new Set([
  "ADD",
  "AND",
  "BR",
  "BRN",
  "BRZ",
  "BRP",
  "BRNZ",
  "BRNP",
  "BRZP",
  "BRNZP",
  "JMP",
  "JSR",
  "JSRR",
  "LD",
  "LDI",
  "LDR",
  "LEA",
  "NOT",
  "RET",
  "RTI",
  "ST",
  "STI",
  "STR",
  "TRAP",
]);

function isOpcode(text: string): boolean {
  return OPCODES.has(text.toUpperCase());
}

const TRAP_ROUTINES = new Set(["GETC", "OUT", "PUTS", "IN", "PUTSP", "HALT"]);

function isTrapRoutine(text: string): boolean {
  return TRAP_ROUTINES.has(text.toUpperCase());
}

export function tokenize(input: string): Array<Token> {
  return Lexer.tokenize(input);
}

export { parseRegister };
