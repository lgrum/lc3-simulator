import { describe, expect, it } from "vite-plus/test";

import { assemble, AssemblerError } from "./assembler";
import { tokenize } from "./lexer";
import { parse } from "./parser";

function assembleSource(source: string) {
  return assemble(parse(tokenize(source)));
}

describe("assembler", () => {
  it("resolves labels and returns a separate origin, instruction words and source lines", () => {
    const { origin, words, symbols } = assembleSource(
      ".ORIG x3000\nLOOP ADD R0, R0, #1\nBRp LOOP\nHALT\n.END\n",
    );

    expect(words).toEqual([0x1021, 0x03fe, 0xf025]);
    expect(origin).toBe(0x3000);
    expect(symbols).toEqual(new Map([["LOOP", 0x3000]]));
  });

  it("uses code points for .STRINGZ sizes and stores 16-bit words", () => {
    const { words, symbols } = assembleSource(
      '.ORIG x3000\n.FILL TARGET\n.BLKW #2\n.STRINGZ "é😀"\nTARGET .FILL xFFFF\n.END\n',
    );

    expect(words).toEqual([0x3006, 0, 0, 0x00e9, 0xf600, 0, 0xffff]);
    expect(symbols.get("TARGET")).toBe(0x3006);
  });

  it("encodes R7 and instruction-specific offset widths", () => {
    const { words } = assembleSource(
      ".ORIG x3000\nADD R7, R7, #-1\nJSR #512\nLDR R1, R2, #31\nTRAP xFF\n.END\n",
    );

    expect(words).toEqual([0x1fff, 0x4a00, 0x629f, 0xf0ff]);
    expect(() =>
      assembleSource(".ORIG x3000\nLDR R1, R2, #32\n.END\n"),
    ).toThrow("Immediate value 32 is larger than 6 bits");
    expect(() => assembleSource(".ORIG x3000\nTRAP x100\n.END\n")).toThrow(
      "Trap vector 256 is larger than 8 bits",
    );
  });

  it("encodes every instruction variant", () => {
    const instructions = [
      "ADD R1, R2, R3",
      "AND R1, R2, R3",
      "BRn #0",
      "JMP R2",
      "JSR #0",
      "JSRR R2",
      "LD R1, #0",
      "LDI R1, #0",
      "LDR R1, R2, #0",
      "LEA R1, #0",
      "NOT R1, R2",
      "RET",
      "RTI",
      "ST R1, #0",
      "STI R1, #0",
      "STR R1, R2, #0",
      "TRAP x20",
    ];

    const { words } = assembleSource(
      `.ORIG x3000\n${instructions.join("\n")}\n.END\n`,
    );
    expect(words).toEqual([
      0x1283, 0x5283, 0x0800, 0xc080, 0x4800, 0x4080, 0x2200, 0xa200, 0x6280,
      0xe200, 0x92bf, 0xc1c0, 0x8000, 0x3200, 0xb200, 0x7280, 0xf020,
    ]);
  });

  it("uses the address after JSR for PC-relative labels", () => {
    const { words, symbols } = assembleSource(
      ".ORIG x3000\nJSR TARGET\nRET\nTARGET RTI\n.END\n",
    );

    expect(words).toEqual([0x4801, 0xc1c0, 0x8000]);
    expect(symbols.get("TARGET")).toBe(0x3002);
  });

  it("wraps PC-relative addresses at the 16-bit boundary", () => {
    const { words, symbols } = assembleSource(
      ".ORIG xFFFF\nBR NEXT\nNEXT RET\n.END\n",
    );

    expect(words).toEqual([0x0e00, 0xc1c0]);
    expect(symbols.get("NEXT")).toBe(0);
  });

  it("rejects a second .ORIG block", () => {
    expect(() =>
      assembleSource(".ORIG x3000\nADD R0, R0, #1\n.ORIG x4000\nHALT\n.END\n"),
    ).toThrow("Multiple .ORIG blocks are not supported");
  });

  it("reports missing origin, unresolved labels, and invalid block sizes", () => {
    expect(() => assemble({ statements: [] })).toThrow(AssemblerError);
    expect(() => assembleSource("RET\n")).toThrow(
      "Expected .ORIG as first statement",
    );
    expect(() => assembleSource(".ORIG x3000\nBR MISSING\n.END\n")).toThrow(
      "Label MISSING doesn't exist",
    );
    expect(() => assembleSource(".ORIG x3000\n.BLKW #-1\n.END\n")).toThrow(
      ".BLKW can't have a negative value",
    );
    expect(() => assembleSource(".ORIG x3000\n.BLKW COUNT\n.END\n")).toThrow(
      ".BLKW must have a number literal operand",
    );
  });
});
