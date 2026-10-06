import { describe, expect, it } from "vite-plus/test";

import { LC3 } from "@/lib/simulator/isa/lc3";

import {
  asciiOf,
  hex,
  mnemonicOf,
  opcodeBits,
  parseWord,
  resolveAddress,
  signed,
} from "./format";

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

  it("names instructions, including variants that share an opcode", () => {
    expect(mnemonicOf(LC3, 0x1042)).toBe("ADD");
    expect(mnemonicOf(LC3, 0xc1c0)).toBe("RET");
    expect(mnemonicOf(LC3, 0xc080)).toBe("JMP");
    expect(mnemonicOf(LC3, 0x8000)).toBe("RTI");
    expect(mnemonicOf(LC3, 0xd000)).toBeUndefined();
  });

  it("resolves addresses typed as numbers or labels", () => {
    const symbols = new Map([["LOOP", 0x3002]]);
    const lookup = (name: string) => symbols.get(name.toUpperCase());
    expect(resolveAddress("x3000", lookup)).toBe(0x3000);
    expect(resolveAddress("loop", lookup)).toBe(0x3002);
    expect(resolveAddress("nowhere", lookup)).toBeUndefined();
    expect(resolveAddress("  ", lookup)).toBeUndefined();
  });
});
