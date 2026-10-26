import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vite-plus/test";

import { unzipProject, zipProject } from "./project-zip";

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

function zipOf(entries: Record<string, string>) {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, text]) => [path, strToU8(text)]),
    ),
  );
}

describe("unzipProject", () => {
  it("reads back what zipProject writes, with main.asm as the entry", () => {
    const zip = zipProject({
      files: new Map([
        ["a.asm", "A"],
        ["main.asm", "MAIN"],
        ["lib/trig.asm", "TRIG"],
      ]),
      folders: new Set(["lib", "empty"]),
    });
    expect(unzipProject(zip)).toEqual({
      ok: true,
      project: {
        files: { "a.asm": "A", "main.asm": "MAIN", "lib/trig.asm": "TRIG" },
        folders: ["empty"],
        entry: "main.asm",
      },
      skipped: [],
    });
  });

  it("opens the contents of a zipped folder and leaves out other files", () => {
    const result = unzipProject(
      zipOf({
        "calc/": "",
        "calc/lib/trig.asm": "TRIG",
        "calc/sin.asm": "SIN",
        "calc/notes.txt": "notes",
        "calc/my-file.asm": "bad name",
        "calc/lc3os.asm": "reserved",
        "calc/.DS_Store": "",
        "__MACOSX/calc/._sin.asm": "",
      }),
    );
    expect(result).toEqual({
      ok: true,
      project: {
        files: { "lib/trig.asm": "TRIG", "sin.asm": "SIN" },
        folders: [],
        // No main.asm: the first file nearest the top.
        entry: "sin.asm",
      },
      skipped: ["calc/notes.txt", "calc/my-file.asm", "calc/lc3os.asm"],
    });
  });

  it("says why a file can't be opened as a project", () => {
    expect(unzipProject(strToU8("not a zip"))).toEqual({
      ok: false,
      reason: "unreadable",
    });
    expect(unzipProject(zipOf({ "readme.txt": "hi" }))).toEqual({
      ok: false,
      reason: "no-files",
    });
  });
});
