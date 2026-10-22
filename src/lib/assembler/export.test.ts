import { describe, expect, it } from "vite-plus/test";

import { assembleModule } from "./assemble-source";
import { programWords, toHexText, toObjectBytes } from "./export";
import { link } from "./linker";
import type { LinkedImage } from "./types";

function linked(files: Record<string, string>): LinkedImage {
  const modules = Object.entries(files).map(([file, source]) => {
    const result = assembleModule(source, {
      file,
      entry: file === "main.asm",
    });
    if (!result.ok) throw result.error;
    return result.module;
  });
  const result = link(modules, { entry: "main.asm" });
  if (!result.ok) throw new Error(result.diagnostics[0].text);
  return result.image;
}

/** An image with only segments, for layouts the linker doesn't make. */
function imageOf(segments: LinkedImage["segments"]): LinkedImage {
  return {
    entry: 0x3000,
    segments,
    symbols: new Map(),
    sourceMap: new Map(),
    map: [],
  };
}

describe("program export", () => {
  it("exports the entry file and its imported modules, without the OS", () => {
    const program = programWords(
      linked({
        "main.asm":
          ".ORIG x3000\n.EXTERNAL MATH-ONE\nLD R5, PTR\nJSRR R5\nHALT\nPTR .FILL MATH-ONE\n.END\n",
        "math.asm": "ONE AND R0, R0, #0\nADD R0, R0, #1\nRET\n",
      }),
    );
    expect(program).toEqual({
      origin: 0x3000,
      words: [0x2a02, 0x4140, 0xf025, 0x3004, 0x5020, 0x1021, 0xc1c0],
    });
    expect(toHexText(program)).toBe("3000 2A02 4140 F025 3004 5020 1021 C1C0");
  });

  it("writes big-endian words with the origin first", () => {
    expect([
      ...toObjectBytes({ origin: 0x3000, words: [0xf025, 0x0001] }),
    ]).toEqual([0x30, 0x00, 0xf0, 0x25, 0x00, 0x01]);
  });

  it("orders segments by address and fills gaps with zeros", () => {
    const program = programWords(
      imageOf([
        { origin: 0x3003, words: [0xbbbb], file: "b.asm" },
        { origin: 0x3000, words: [0xaaaa], file: "a.asm" },
        { origin: 0x3005, words: [], file: "empty.asm" },
      ]),
    );
    expect(program).toEqual({
      origin: 0x3000,
      words: [0xaaaa, 0, 0, 0xbbbb],
    });
  });

  it("exports only the origin for an empty program", () => {
    expect(toHexText(programWords(imageOf([])))).toBe("3000");
  });
});
