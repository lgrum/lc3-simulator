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

  it("mean group modules in imports", () => {
    expect(importTarget("G7_TRIG")).toEqual({
      kind: "group",
      group: 7,
      name: "TRIG",
    });
    expect(importTarget("helpers")).toEqual({ kind: "own", name: "helpers" });
  });
});

describe("canRead", () => {
  it("lets owners read their modules", () => {
    expect(canRead(group7, { userId: "g7", kind: "group" })).toBe(true);
    expect(canRead(prof, { userId: "a1", kind: "admin" })).toBe(true);
  });

  it("lets everyone read group modules", () => {
    expect(canRead(prof, { userId: "g7", kind: "group" })).toBe(true);
    expect(canRead(group7, { userId: "g8", kind: "group" })).toBe(true);
  });

  it("never lets anyone read another admin's modules", () => {
    expect(canRead(other, { userId: "a1", kind: "admin" })).toBe(false);
    expect(canRead(group7, { userId: "a1", kind: "admin" })).toBe(false);
  });
});

describe("checkStored", () => {
  const RET = "RET\n";

  it("accepts a valid name and size", () => {
    expect(checkStored("trig", RET)).toBeNull();
  });

  it("refuses invalid names", () => {
    expect(checkStored("my-trig", RET)).toEqual({ kind: "name" });
  });

  it("refuses the g<n>_ names, which mean other groups' modules", () => {
    expect(checkStored("g7_trig", RET)).toEqual({ kind: "reserved" });
  });

  it("refuses sources over 64 KB", () => {
    const big = `; ${"x".repeat(MAX_SOURCE_BYTES)}\n${RET}`;
    expect(checkStored("big", big)).toEqual({ kind: "too-large" });
  });

  it("doesn't assemble: that happens in the browser", () => {
    expect(checkStored("bad", "ADD R1, R2\n")).toBeNull();
  });
});
