import { describe, expect, it } from "vite-plus/test";

import type { Viewer } from "./access";
import {
  MAX_SOURCE_BYTES,
  canRead,
  checkStored,
  importTarget,
  isModuleName,
  parseGroupModuleName,
} from "./modules";

const group7: Viewer = { kind: "group", userId: "g7", group: 7, name: "G7" };
const prof: Viewer = {
  kind: "admin",
  userId: "a1",
  username: "prof",
  name: "Prof",
};
const other: Viewer = {
  kind: "admin",
  userId: "a2",
  username: "other",
  name: "Other",
};

describe("isModuleName", () => {
  it("follows label rules", () => {
    expect(isModuleName("trig")).toBe(true);
    expect(isModuleName("_util2")).toBe(true);
    expect(isModuleName("2fast")).toBe(false);
    expect(isModuleName("my-math")).toBe(false);
    expect(isModuleName("")).toBe(false);
  });

  it("refuses the OS module", () => {
    expect(isModuleName("LC3OS")).toBe(false);
  });
});

describe("group module names", () => {
  it("parse g<n>_<name>", () => {
    expect(parseGroupModuleName("g7_trig")).toEqual({ group: 7, name: "trig" });
    expect(parseGroupModuleName("G12_Sin_Cos")).toEqual({
      group: 12,
      name: "Sin_Cos",
    });
    expect(parseGroupModuleName("gx_trig")).toBeNull();
    expect(parseGroupModuleName("trig")).toBeNull();
  });

  it("mean group modules only for admins", () => {
    expect(importTarget(prof, "G7_TRIG")).toEqual({
      kind: "group",
      group: 7,
      name: "TRIG",
    });
    expect(importTarget(prof, "helpers")).toEqual({
      kind: "own",
      name: "helpers",
    });
    expect(importTarget(group7, "g3_trig")).toEqual({
      kind: "own",
      name: "g3_trig",
    });
  });
});

describe("canRead", () => {
  it("lets owners read their modules", () => {
    expect(canRead(group7, { userId: "g7", kind: "group" })).toBe(true);
    expect(canRead(prof, { userId: "a1", kind: "admin" })).toBe(true);
  });

  it("lets admins read group modules", () => {
    expect(canRead(prof, { userId: "g7", kind: "group" })).toBe(true);
  });

  it("never lets admins read other admins' modules", () => {
    expect(canRead(other, { userId: "a1", kind: "admin" })).toBe(false);
  });

  it("never lets groups read other accounts' modules", () => {
    expect(canRead(group7, { userId: "g8", kind: "group" })).toBe(false);
    expect(canRead(group7, { userId: "a1", kind: "admin" })).toBe(false);
  });
});

describe("checkStored", () => {
  const RET = "RET\n";

  it("accepts a valid name and size", () => {
    expect(checkStored(group7, "trig", RET)).toBeNull();
  });

  it("refuses invalid names", () => {
    expect(checkStored(group7, "my-trig", RET)).toEqual({ kind: "name" });
  });

  it("refuses the reserved g<n>_ names for admins only", () => {
    expect(checkStored(prof, "g7_trig", RET)).toEqual({ kind: "reserved" });
    expect(checkStored(group7, "g7_trig", RET)).toBeNull();
  });

  it("refuses sources over 64 KB", () => {
    const big = `; ${"x".repeat(MAX_SOURCE_BYTES)}\n${RET}`;
    expect(checkStored(group7, "big", big)).toEqual({ kind: "too-large" });
  });

  it("doesn't assemble: that happens in the browser", () => {
    expect(checkStored(group7, "bad", "ADD R1, R2\n")).toBeNull();
  });
});
