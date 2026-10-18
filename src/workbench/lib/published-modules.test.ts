import { describe, expect, it } from "vite-plus/test";

import { restorePath } from "./published-modules";

describe("restorePath", () => {
  it("replaces the local file of the same module, in any folder", () => {
    expect(restorePath(["main.asm", "lib/Trig.asm"], "trig")).toEqual({
      path: "lib/Trig.asm",
      exists: true,
    });
  });

  it("adds the module at the root when there is no such file", () => {
    expect(restorePath(["main.asm"], "trig")).toEqual({
      path: "trig.asm",
      exists: false,
    });
  });
});
