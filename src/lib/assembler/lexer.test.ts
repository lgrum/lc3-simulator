import { describe, expect, it } from "vite-plus/test";

import { LexerError, tokenize } from "./lexer";

describe("assembler lexer", () => {
  it("classifies tokens and preserves source positions", () => {
    expect(tokenize("ADD R7, #-3\n; comment\nHALT\n")).toEqual([
      { type: "opcode", lexeme: "ADD", line: 1, column: 1 },
      { type: "register", lexeme: "R7", line: 1, column: 5 },
      { type: "comma", lexeme: ",", line: 1, column: 7 },
      { type: "number_literal", lexeme: "#-3", line: 1, column: 9 },
      { type: "newline", lexeme: "\n", line: 1, column: 12 },
      { type: "newline", lexeme: "\n", line: 2, column: 10 },
      { type: "trap", lexeme: "HALT", line: 3, column: 1 },
      { type: "newline", lexeme: "\n", line: 3, column: 5 },
      { type: "eof", lexeme: "", line: 4, column: 1 },
    ]);
  });

  it("counts UTF-8 bytes like the Rust lexer", () => {
    expect(tokenize('"é" RET\n')[1]).toEqual({
      type: "opcode",
      lexeme: "RET",
      line: 1,
      column: 6,
    });
  });

  it("rejects hexadecimal suffixes and a bare directive marker", () => {
    expect(() => tokenize("x12G\n")).toThrow("Invalid hexadecimal literal");
    expect(() => tokenize(".\n")).toThrow("Expected directive after '.'");
  });

  it("reports the Rust lexer's error location", () => {
    try {
      tokenize("ADD R0, x12G\n");
      throw new Error("Expected a LexerError");
    } catch (error) {
      expect(error).toBeInstanceOf(LexerError);
      expect(error).toMatchObject({
        text: "Invalid hexadecimal literal",
        line: 1,
        column: 13,
        message: "Invalid hexadecimal literal at 1:12",
        position: { line: 1, column: 9, endColumn: 13 },
      });
    }
  });

  it("reports the offending text's position on its own line", () => {
    try {
      tokenize('.ORIG x3000\nLEA R0, "open\n');
      throw new Error("Expected a LexerError");
    } catch (error) {
      expect(error).toMatchObject({
        text: "Unterminated string",
        position: { line: 2, column: 9, endColumn: 14 },
      });
    }
  });

  it("keeps escaped quotes inside a string", () => {
    expect(tokenize('"say \\"hi\\"\\\\" RET\n').slice(0, 2)).toEqual([
      {
        type: "string_literal",
        lexeme: '"say \\"hi\\"\\\\"',
        line: 1,
        column: 1,
      },
      { type: "opcode", lexeme: "RET", line: 1, column: 16 },
    ]);
  });

  it("rejects unknown escape sequences at the backslash", () => {
    try {
      tokenize('.STRINGZ "ok\\q"\n');
      throw new Error("Expected a LexerError");
    } catch (error) {
      expect(error).toBeInstanceOf(LexerError);
      expect(error).toMatchObject({
        text: "Unknown escape sequence '\\q'",
        position: { line: 1, column: 13, endColumn: 15 },
      });
    }
  });

  it("treats a backslash at the end of the line as unterminated", () => {
    expect(() => tokenize('.STRINGZ "open\\\n')).toThrow("Unterminated string");
  });

  it("emits EOF after a comment without a newline", () => {
    expect(tokenize("RET\n; trailing comment").at(-1)).toEqual({
      type: "eof",
      lexeme: "",
      line: 2,
      column: 19,
    });
  });

  it("reads MODULE-LABEL as one identifier", () => {
    expect(
      tokenize(".EXTERNAL Trig-SIN\nPTR .FILL R1-x2\n").map(
        ({ type, lexeme }) => [type, lexeme],
      ),
    ).toEqual([
      ["directive", ".EXTERNAL"],
      ["identifier", "Trig-SIN"],
      ["newline", "\n"],
      ["identifier", "PTR"],
      ["directive", ".FILL"],
      ["identifier", "R1-x2"],
      ["newline", "\n"],
      ["eof", ""],
    ]);
    expect(tokenize("xab-SIN\n")[0]).toMatchObject({
      type: "identifier",
      lexeme: "xab-SIN",
    });
  });

  it("rejects a second '-' in a qualified name", () => {
    expect(() => tokenize(".EXTERNAL A-B-C\n")).toThrow(
      expect.objectContaining({
        text: "A qualified name has exactly one '-'",
        position: { line: 1, column: 11, endColumn: 16 },
      }),
    );
    expect(() => tokenize("A-1\n")).toThrow("Unexpected character '-'");
  });
});
