import { describe, expect, it } from "vite-plus/test";

import { assembleSource } from "@/lib/assembler/assemble-source";

import { addressAtOrAfter, createLineMap } from "./line-map";

describe("createLineMap", () => {
  it("maps lines to their first address and addresses back to lines", () => {
    const result = assembleSource(
      ".ORIG x3000\nADD R0, R0, #1\nBUF .BLKW #3\nHALT\n.END",
    );
    if (!result.ok) throw result.error;
    const lines = createLineMap(result.program);

    expect(lines.addressOf.get(2)).toBe(0x3000);
    expect(lines.addressOf.get(3)).toBe(0x3001);
    expect(lines.addressOf.get(4)).toBe(0x3004);
    expect(lines.addressOf.has(1)).toBe(false);
    expect(lines.lineOf.get(0x3002)).toBe(3);
  });

  it("finds the statement a label or comment line belongs to", () => {
    const result = assembleSource(
      ".ORIG x3000\nHALT\n; note\nNEXT\n  ADD R0, R0, #1\n.END",
    );
    if (!result.ok) throw result.error;
    const lines = createLineMap(result.program);

    expect(addressAtOrAfter(lines, 2)).toBe(0x3000);
    expect(addressAtOrAfter(lines, 3)).toBe(0x3001);
    expect(addressAtOrAfter(lines, 4)).toBe(0x3001);
    expect(addressAtOrAfter(lines, 6)).toBeUndefined();
  });
});
