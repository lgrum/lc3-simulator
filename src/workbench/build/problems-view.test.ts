import { describe, expect, it } from "vite-plus/test";

import type { Diagnostic } from "@/lib/assembler/types";

import { sortProblems } from "./problems-view";

const problem = (severity: Diagnostic["severity"], text: string) => ({
  file: "main.asm",
  position: { line: 1 },
  severity,
  text,
});

describe("sortProblems", () => {
  it("puts errors first and notes last, keeping build order", () => {
    const sorted = sortProblems([
      problem("info", "note"),
      problem("error", "first"),
      problem("warning", "warn"),
      problem("error", "second"),
    ]);
    expect(sorted.map(({ text }) => text)).toEqual([
      "first",
      "second",
      "warn",
      "note",
    ]);
  });
});
