import { describe, expect, it } from "vite-plus/test";

import { treeRows } from "./file-sidebar";

describe("treeRows", () => {
  it("lists each folder before its files, sorted, with depth", () => {
    expect(
      treeRows(
        ["main.asm", "lib/trig.asm", "lib/a/b.asm", "a.asm"],
        ["lib", "lib/a", "empty"],
      ),
    ).toEqual([
      { kind: "folder", path: "empty", depth: 0 },
      { kind: "folder", path: "lib", depth: 0 },
      { kind: "folder", path: "lib/a", depth: 1 },
      { kind: "file", path: "lib/a/b.asm", depth: 2 },
      { kind: "file", path: "lib/trig.asm", depth: 1 },
      { kind: "file", path: "a.asm", depth: 0 },
      { kind: "file", path: "main.asm", depth: 0 },
    ]);
  });
});
