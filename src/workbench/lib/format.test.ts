import { describe, expect, it } from "vite-plus/test";

import { asciiOf, hex, opcodeBits, parseWord, signed } from "./format";

describe("format", () => {
  it("formats words as LC-3 hex, signed values and opcode bits", () => {
    expect(hex(0x3000)).toBe("x3000");
    expect(hex(0x2a)).toBe("x002A");
    expect(signed(0xffff)).toBe(-1);
    expect(signed(0x7fff)).toBe(32767);
    expect(opcodeBits(0xf025)).toBe("1111");
  });

  it("describes ASCII characters and control codes", () => {
    expect(asciiOf(0x41)).toBe("'A'");
    expect(asciiOf(10)).toBe("LF");
    expect(asciiOf(0x80)).toBeUndefined();
    expect(asciiOf(1)).toBeUndefined();
  });

  it("parses hex, decimal, binary and character input", () => {
    expect(parseWord("x3000")).toBe(0x3000);
    expect(parseWord("0xfe00")).toBe(0xfe00);
    expect(parseWord("#12")).toBe(12);
    expect(parseWord(" 42 ")).toBe(42);
    expect(parseWord("-1")).toBe(0xffff);
    expect(parseWord("b0101")).toBe(5);
    expect(parseWord("'A'")).toBe(0x41);
  });

  it("rejects values outside 16 bits and other text", () => {
    expect(parseWord("x10000")).toBeUndefined();
    expect(parseWord("-32769")).toBeUndefined();
    expect(parseWord("65536")).toBeUndefined();
    expect(parseWord("R1")).toBeUndefined();
    expect(parseWord("")).toBeUndefined();
  });
});
