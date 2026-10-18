import { describe, expect, it } from "vite-plus/test";

import { childPaths } from "./file-sidebar";

describe("childPaths", () => {
  const files = ["main.asm", "lib/trig.asm", "lib/a/b.asm", "a.asm"];
  const folders = ["lib", "lib/a", "empty"];

  it("lists the root's folders, then its files, sorted", () => {
    expect(childPaths(files, folders, "")).toEqual([
      "empty",
      "lib",
      "a.asm",
      "main.asm",
    ]);
  });

  it("lists only what is directly inside a folder", () => {
    expect(childPaths(files, folders, "lib")).toEqual([
      "lib/a",
      "lib/trig.asm",
    ]);
    expect(childPaths(files, folders, "lib/a")).toEqual(["lib/a/b.asm"]);
    expect(childPaths(files, folders, "empty")).toEqual([]);
  });
});
