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
      });
    }
  });

  it("emits EOF after a comment without a newline", () => {
    expect(tokenize("RET\n; trailing comment").at(-1)).toEqual({
      type: "eof",
      lexeme: "",
      line: 2,
      column: 19,
    });
  });
});
