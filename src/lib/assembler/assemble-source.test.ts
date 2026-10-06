import { describe, expect, it } from "vite-plus/test";

import { assembleSource } from "./assemble-source";
import { AssemblerError } from "./assembler";
import { LexerError } from "./lexer";
import { ParserError } from "./parser";

describe("assembleSource", () => {
  it("assembles editor text without a final newline", () => {
    const result = assembleSource(".ORIG x3000\nHALT\n.END");

    expect(result).toMatchObject({
      ok: true,
      program: { origin: 0x3000, words: [0xf025] },
    });
  });

  it("returns errors from each stage with a position", () => {
    expect(assembleSource(".ORIG x3000\nADD R0, x12G\n.END")).toMatchObject({
      ok: false,
      error: expect.any(LexerError),
    });
    expect(assembleSource(".ORIG x3000\nFOO R1\n.END")).toMatchObject({
      ok: false,
      error: expect.any(ParserError),
    });
    const result = assembleSource(".ORIG x3000\nBR NOWHERE\n.END");
    expect(result).toMatchObject({
      ok: false,
      error: expect.any(AssemblerError),
    });
    if (!result.ok) expect(result.error.position).toEqual({ line: 2 });
  });
});
