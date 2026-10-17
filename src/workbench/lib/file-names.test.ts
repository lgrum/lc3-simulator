import { describe, expect, it } from "vite-plus/test";

import {
  fileNameProblem,
  folderNameProblem,
  toFileName,
  unusedName,
} from "./file-names";

describe("file names", () => {
  const existing = new Set(["main.asm", "lib", "lib/trig.asm"]);

  it("adds .asm and accepts valid module names", () => {
    expect(toFileName("trig")).toBe("trig.asm");
    expect(toFileName("Trig.ASM")).toBe("Trig.ASM");
    expect(fileNameProblem("my_math", "", existing)).toBeNull();
    expect(fileNameProblem("trig.asm", "", existing)).toBeNull();
  });

  it("refuses names that can't be module names", () => {
    expect(fileNameProblem("  ", "", existing)).toBe("empty");
    expect(fileNameProblem("my-math", "", existing)).toBe("invalid");
    expect(fileNameProblem("2trig", "", existing)).toBe("invalid");
    expect(fileNameProblem("my math.asm", "", existing)).toBe("invalid");
    expect(fileNameProblem("LC3OS", "", existing)).toBe("reserved");
    expect(fileNameProblem("trig", "lib", existing)).toBe("exists");
  });

  it("finds an unused name", () => {
    expect(unusedName("main", "", existing)).toBe("main2.asm");
    expect(unusedName("trig", "", existing)).toBe("trig.asm");
  });

  it("checks folder names", () => {
    expect(folderNameProblem("lib", "", existing)).toBe("exists");
    expect(folderNameProblem("src-2.old", "", existing)).toBeNull();
    expect(folderNameProblem("a/b", "", existing)).toBe("folder-invalid");
    expect(folderNameProblem(" ", "", existing)).toBe("empty");
  });
});
