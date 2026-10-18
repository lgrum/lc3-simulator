import { describe, expect, it } from "vite-plus/test";

import type { Viewer } from "./access";
import {
  MAX_SOURCE_BYTES,
  canRead,
  checkPublish,
  importTarget,
  isModuleName,
  parseGroupModuleName,
} from "./modules";
import type { ImportTarget } from "./modules";

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

const TRIG = `
        .EXTERNAL HELPERS-HALF
SIN     LD R5, PTR
        JSRR R5
        RET
PTR     .FILL HELPERS-HALF
        .END
`;

const none = () => Promise.resolve(false);
const all = () => Promise.resolve(true);

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

describe("checkPublish", () => {
  it("accepts a group module without checking its imports", async () => {
    expect(await checkPublish(group7, "trig", TRIG, none)).toBeNull();
  });

  it("refuses invalid names", async () => {
    expect(await checkPublish(group7, "my-trig", TRIG, all)).toEqual({
      kind: "name",
    });
  });

  it("refuses the reserved g<n>_ names for admins only", async () => {
    const source = "RET\n.END\n";
    expect(await checkPublish(prof, "g7_trig", source, all)).toEqual({
      kind: "reserved",
    });
    expect(await checkPublish(group7, "g7_trig", source, all)).toBeNull();
  });

  it("refuses sources over 64 KB", async () => {
    const big = `; ${"x".repeat(MAX_SOURCE_BYTES)}\nRET\n`;
    expect(await checkPublish(group7, "big", big, all)).toEqual({
      kind: "too-large",
    });
  });

  it("refuses assembly errors, with the line", async () => {
    expect(
      await checkPublish(group7, "bad", "ADD R1, R2\n", all),
    ).toMatchObject({ kind: "assembly", line: 1 });
  });

  it("refuses an admin's imports that don't exist or aren't visible", async () => {
    const asked: Array<ImportTarget> = [];
    const problem = await checkPublish(prof, "main", TRIG, (target) => {
      asked.push(target);
      return Promise.resolve(false);
    });
    expect(problem).toEqual({ kind: "import", module: "HELPERS", line: 2 });
    expect(asked).toEqual([{ kind: "own", name: "HELPERS" }]);
  });

  it("accepts an admin's imports of visible modules", async () => {
    const source = `
        .EXTERNAL G7_TRIG-SIN
        LD R5, PTR
        JSRR R5
        HALT
PTR     .FILL G7_TRIG-SIN
`;
    const asked: Array<ImportTarget> = [];
    expect(
      await checkPublish(prof, "main", source, (target) => {
        asked.push(target);
        return Promise.resolve(true);
      }),
    ).toBeNull();
    expect(asked).toEqual([{ kind: "group", group: 7, name: "TRIG" }]);
  });
});
