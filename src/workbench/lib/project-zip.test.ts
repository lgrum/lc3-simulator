import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vite-plus/test";

import { zipProject } from "./project-zip";

describe("zipProject", () => {
  it("stores every file at its path and keeps empty folders", () => {
    const zip = zipProject({
      files: new Map([
        ["main.asm", "MAIN"],
        ["lib/trig.asm", "TRIG"],
      ]),
      folders: new Set(["lib", "empty"]),
    });
    const entries = unzipSync(zip);
    expect(Object.keys(entries).sort()).toEqual([
      "empty/",
      "lib/trig.asm",
      "main.asm",
    ]);
    expect(strFromU8(entries["lib/trig.asm"])).toBe("TRIG");
  });
});
