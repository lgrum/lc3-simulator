import { describe, expect, it } from "vite-plus/test";

import { assembleSource } from "@/lib/assembler/assemble-source";

import { addressAtOrAfter, createLineMaps } from "./line-map";

function linesOf(source: string) {
  const result = assembleSource(source, "main.asm");
  if (!result.ok) throw result.error;
  const lines = createLineMaps(result.image).get("main.asm");
  if (!lines) throw new Error("No line map for main.asm");
  return lines;
}

describe("createLineMaps", () => {
  it("maps lines to their first address and addresses back to lines", () => {
    const lines = linesOf(
      ".ORIG x3000\nADD R0, R0, #1\nBUF .BLKW #3\nHALT\n.END",
    );

    expect(lines.addressOf.get(2)).toBe(0x3000);
    expect(lines.addressOf.get(3)).toBe(0x3001);
    expect(lines.addressOf.get(4)).toBe(0x3004);
    expect(lines.addressOf.has(1)).toBe(false);
    expect(lines.lineOf.get(0x3002)).toBe(3);
  });

  it("builds one map per file of a multi-segment image", () => {
    const maps = createLineMaps({
      sourceMap: new Map([
        [0x3000, { file: "main.asm", line: 4 }],
        [0x3001, { file: "trig.asm", line: 2 }],
        [0x3002, { file: "trig.asm", line: 3 }],
      ]),
    });

    expect([...maps.keys()]).toEqual(["main.asm", "trig.asm"]);
    expect(maps.get("trig.asm")?.addressOf.get(3)).toBe(0x3002);
    expect(maps.get("main.asm")?.lineOf.get(0x3001)).toBeUndefined();
  });

  it("finds the statement a label or comment line belongs to", () => {
    const lines = linesOf(
      ".ORIG x3000\nHALT\n; note\nNEXT\n  ADD R0, R0, #1\n.END",
    );

    expect(addressAtOrAfter(lines, 2)).toBe(0x3000);
    expect(addressAtOrAfter(lines, 3)).toBe(0x3001);
    expect(addressAtOrAfter(lines, 4)).toBe(0x3001);
    expect(addressAtOrAfter(lines, 6)).toBeUndefined();
  });
});
