import { describe, expect, it } from "vite-plus/test";

import { createMachineController } from "../simulator/controller";
import { assembleModule } from "./assemble-source";
import { link, overlappingSegments } from "./linker";
import type { ObjectModule } from "./types";

/** Assembles one project file; throws its first error. */
function moduleOf(file: string, source: string, entry = false): ObjectModule {
  const result = assembleModule(source, { file, entry });
  if (!result.ok) throw result.error;
  return result.module;
}

function linkOne(source: string) {
  const result = link([moduleOf("main.asm", source, true)], {
    entry: "main.asm",
  });
  if (!result.ok) throw new Error(result.diagnostics[0].text);
  return result;
}

describe("assembler output", () => {
  it("assembles as if the file started at 0 and records local .FILLs", () => {
    const module = moduleOf(
      "lib/trig.asm",
      ".ORIG x4000\nLD R0, PTR\nPTR .FILL DATA\nDATA .FILL #5\n.END\n",
    );
    expect(module).toMatchObject({
      name: "trig",
      namespace: "local",
      file: "lib/trig.asm",
      origin: 0x4000,
      words: [0x2000, 0x0002, 0x0005],
      relocations: [{ kind: "local-abs16", offset: 1 }],
    });
    expect(module.symbols).toEqual(
      new Map([
        ["PTR", 1],
        ["DATA", 2],
      ]),
    );
  });

  it("notes an ignored .ORIG in modules but not in the entry file", () => {
    expect(moduleOf("trig.asm", ".ORIG x4000\nRET\n").diagnostics).toEqual([
      {
        file: "trig.asm",
        position: { line: 1 },
        severity: "info",
        text: ".ORIG is ignored in modules; the linker places this code",
      },
    ]);
    expect(
      moduleOf("main.asm", ".ORIG x4000\nRET\n", true).diagnostics,
    ).toEqual([]);
  });

  it("keeps .ORIG rules: first statement, no label, only one", () => {
    expect(() => moduleOf("a.asm", "RET\n.ORIG x3000\n")).toThrow(
      ".ORIG must be the first statement",
    );
    expect(() => moduleOf("a.asm", "GO .ORIG x3000\nRET\n")).toThrow(
      ".ORIG cannot have a label",
    );
    expect(() => moduleOf("a.asm", ".ORIG x3000\nRET\n.ORIG x4000\n")).toThrow(
      "Multiple .ORIG blocks are not supported",
    );
  });
});

describe("link", () => {
  it("loads a file without .ORIG at x3000", () => {
    const { image } = linkOne("LOOP BR LOOP\nPTR .FILL LOOP\n");
    expect(image.entry).toBe(0x3000);
    expect(image.segments).toEqual([
      { origin: 0x3000, words: [0x0fff, 0x3000], file: "main.asm" },
    ]);
  });

  it("relocates local .FILLs to the load address", () => {
    const source = ".ORIG x4000\nLEA R0, DATA\nPTR .FILL DATA\nDATA .FILL #1\n";
    const { image } = linkOne(source);
    expect(image.entry).toBe(0x4000);
    expect(image.segments[0].words).toEqual([0xe001, 0x4002, 0x0001]);
    expect(image.symbols).toEqual(
      new Map([
        ["PTR", 0x4001],
        ["DATA", 0x4002],
      ]),
    );

    const moved = linkOne(source.replace("x4000", "x5000")).image;
    expect(moved.segments[0].words).toEqual([0xe001, 0x5002, 0x0001]);
  });

  it("maps addresses to files and lines and lists the module in the map", () => {
    const { image } = linkOne(".ORIG x3000\nSTART ADD R0, R0, #1\nHALT\n");
    expect(image.sourceMap).toEqual(
      new Map([
        [0x3000, { file: "main.asm", line: 2 }],
        [0x3001, { file: "main.asm", line: 3 }],
      ]),
    );
    expect(image.map).toEqual([
      {
        file: "main.asm",
        module: "main",
        start: 0x3000,
        end: 0x3001,
        symbols: [{ name: "START", addr: 0x3000 }],
      },
    ]);
  });

  it("lets the entry file wrap at xFFFF as before", () => {
    const { image } = linkOne(".ORIG xFFFF\nBR NEXT\nNEXT .FILL NEXT\n");
    expect(image.segments[0].words).toEqual([0x0e00, 0x0000]);
    expect(image.symbols.get("NEXT")).toBe(0);
  });

  it("reports a missing entry file", () => {
    expect(link([], { entry: "main.asm" })).toEqual({
      ok: false,
      diagnostics: [
        {
          file: null,
          position: null,
          severity: "error",
          text: "There is no entry file main.asm",
        },
      ],
    });
  });
});

/** Assembles every file of a project and links it from `entry`. */
function linkProject(files: Record<string, string>, entry = "main.asm") {
  const modules = Object.entries(files).map(([file, source]) =>
    moduleOf(file, source, file === entry),
  );
  return link(modules, { entry });
}

function linked(files: Record<string, string>, entry = "main.asm") {
  const result = linkProject(files, entry);
  if (!result.ok) throw new Error(result.diagnostics[0].text);
  return result.image;
}

const MAIN = `        .ORIG x3000
        .EXTERNAL TRIG-SIN
        LD   R5, SIN_PTR
        JSRR R5
        HALT
SIN_PTR .FILL TRIG-SIN
        .END
`;

const TRIG = `; Doubles R0.
SIN     ADD R0, R0, R0
        RET
        .END
`;

describe("linking several files", () => {
  it("calls a label of another file through .FILL and JSRR", () => {
    const image = linked({ "main.asm": MAIN, "lib/trig.asm": TRIG });
    expect(image.segments).toEqual([
      {
        origin: 0x3000,
        words: [0x2a02, 0x4140, 0xf025, 0x3004],
        file: "main.asm",
      },
      { origin: 0x3004, words: [0x1000, 0xc1c0], file: "lib/trig.asm" },
    ]);
    expect(image.sourceMap.get(0x3004)).toEqual({
      file: "lib/trig.asm",
      line: 2,
    });
    expect(image.symbols.get("TRIG-SIN")).toBe(0x3004);
    expect(image.symbols.get("SIN_PTR")).toBe(0x3003);

    const machine = createMachineController();
    machine.load(image);
    machine.writeRegister("R0", 21);
    for (let i = 0; i < 100 && machine.getSnapshot().pc !== 0x3002; i++)
      machine.stepInto();
    expect(machine.getSnapshot().regs[0]).toBe(42);
    expect(machine.disassemble(0x3004)).toMatchObject({
      file: "lib/trig.asm",
      line: 2,
    });
  });

  it("matches module names ignoring case and labels exactly", () => {
    const image = linked({
      "main.asm": MAIN.replaceAll("TRIG-SIN", "Trig-SIN"),
      "TRIG.asm": TRIG,
    });
    expect(image.segments[0].words[3]).toBe(0x3004);
  });

  it("collects modules breadth-first in .EXTERNAL order and skips the rest", () => {
    const files = {
      "main.asm": ".EXTERNAL B-Y\n.EXTERNAL A-X\nHALT\n",
      "a.asm": ".EXTERNAL C-Z\nX RET\n",
      "b.asm": ".EXTERNAL A-X\nY RET\nRET\n",
      "c.asm": "Z RET\n",
      "unused.asm": "X RET\n",
    };
    const image = linked(files);
    expect(image.map.map(({ file, start, end }) => [file, start, end])).toEqual(
      [
        ["main.asm", 0x3000, 0x3000],
        ["b.asm", 0x3001, 0x3002],
        ["a.asm", 0x3003, 0x3003],
        ["c.asm", 0x3004, 0x3004],
      ],
    );
    // The same sources give the same layout, whatever order they come in.
    const reversed = Object.fromEntries(Object.entries(files).reverse());
    expect(linked(reversed)).toEqual(image);
  });

  it("prefixes labels of other modules in the image and the map", () => {
    const image = linked({
      "main.asm": ".EXTERNAL A-START\nLOOP BR LOOP\n",
      "a.asm": "LOOP BR LOOP\nSTART RET\n",
    });
    expect(image.symbols).toEqual(
      new Map([
        ["LOOP", 0x3000],
        ["A-LOOP", 0x3001],
        ["A-START", 0x3002],
      ]),
    );
    expect(image.map[1].symbols).toEqual([
      { name: "A-LOOP", addr: 0x3001 },
      { name: "A-START", addr: 0x3002 },
    ]);
  });

  it("lets a local label win over an imported one", () => {
    const image = linked({
      "main.asm":
        ".EXTERNAL TRIG-SIN\nJSR Sin\nHALT\nSin RET\nP .FILL TRIG-SIN\n",
      "trig.asm": TRIG,
    });
    expect(image.segments[0].words[0]).toBe(0x4801);
    expect(() =>
      linked({ "main.asm": ".EXTERNAL TRIG-SIN\nJSR SIN\n", "trig.asm": TRIG }),
    ).toThrow("Label SIN doesn't exist");
  });

  it("reports missing modules and labels at the .EXTERNAL line", () => {
    const result = linkProject({
      "main.asm": ".EXTERNAL MATH-SQRT\n.EXTERNAL TRIG-COS\nHALT\n",
      "trig.asm": TRIG,
    });
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          file: "main.asm",
          position: { line: 1 },
          severity: "error",
          text: "No module named MATH in this program",
        },
        {
          file: "main.asm",
          position: { line: 2 },
          severity: "error",
          text: "trig.asm has no label COS",
        },
      ],
    });
  });

  it("requires .EXTERNAL before using a qualified name", () => {
    expect(() => moduleOf("main.asm", "P .FILL MATH-SQRT\n", true)).toThrow(
      expect.objectContaining({
        text: "MATH-SQRT is used without .EXTERNAL MATH-SQRT",
        position: { line: 1 },
      }),
    );
  });
});

/** The text of every diagnostic of a link that fails. */
function linkErrors(files: Record<string, string>, entry = "main.asm") {
  const result = linkProject(files, entry);
  if (result.ok) throw new Error("Expected the link to fail");
  return result.diagnostics.map(({ file, position, text }) => ({
    file,
    line: position?.line ?? null,
    text,
  }));
}

/** Pads a module so that its label SIN sits `words` words in. */
const farTrig = (words: number) => `PAD .BLKW #${words}\nSIN RET\n`;

describe("external labels in instructions", () => {
  it("patches PC-relative uses that reach", () => {
    const image = linked({
      "main.asm":
        ".EXTERNAL TRIG-SIN\n.EXTERNAL TRIG-DATA\nJSR TRIG-SIN\nBRz TRIG-SIN\nLD R1, TRIG-DATA\nLEA R2, TRIG-DATA\nHALT\n",
      "trig.asm": "SIN RET\nDATA .FILL #9\n",
    });
    // main is x3000-x3004; SIN is x3005 and DATA x3006.
    expect(image.segments[0].words).toEqual([
      0x4804, 0x0403, 0x2203, 0xe402, 0xf025,
    ]);

    const machine = createMachineController();
    machine.load(image);
    machine.stepInto();
    expect(machine.getSnapshot().pc).toBe(0x3005);
    machine.stepInto();
    expect(machine.getSnapshot().pc).toBe(0x3001);
    // Z is set after loading, so BRz jumps to SIN again.
    machine.stepInto();
    expect(machine.getSnapshot().pc).toBe(0x3005);
  });

  it("reports PC-relative uses that don't reach, with the pattern to use", () => {
    expect(
      linkErrors({
        "main.asm":
          ".EXTERNAL TRIG-SIN\nJSR TRIG-SIN\nBRnp TRIG-SIN\nLEA R0, TRIG-SIN\nST R0, TRIG-SIN\nHALT\n",
        "trig.asm": farTrig(2000),
      }),
    ).toEqual([
      {
        file: "main.asm",
        line: 2,
        text: "JSR TRIG-SIN: target x37D5 is 2004 words away, JSR reaches ±1024. Use .FILL with JSRR.",
      },
      {
        file: "main.asm",
        line: 3,
        text: "BRnp TRIG-SIN: target x37D5 is 2003 words away, BRnp reaches ±256. Use .FILL with JSRR.",
      },
      {
        file: "main.asm",
        line: 4,
        text: "LEA TRIG-SIN: target x37D5 is 2002 words away, LEA reaches ±256. Use .FILL with LD.",
      },
      {
        file: "main.asm",
        line: 5,
        text: "ST TRIG-SIN: target x37D5 is 2001 words away, ST reaches ±256. Use .FILL with LDR or STR.",
      },
    ]);
  });

  it("rejects external labels in TRAP and as LDR or STR offsets", () => {
    const head = ".EXTERNAL OS2-X\n";
    expect(() => moduleOf("main.asm", head + "TRAP OS2-X\n", true)).toThrow(
      "External labels can't be used in TRAP",
    );
    expect(() =>
      moduleOf("main.asm", head + "LDR R0, R1, OS2-X\n", true),
    ).toThrow("External labels can't be used as an LDR offset");
    expect(() =>
      moduleOf("main.asm", head + "STR R0, R1, OS2-X\n", true),
    ).toThrow("External labels can't be used as an STR offset");
  });
});

describe("import rules", () => {
  it("refuses imports of the file's own labels, local labels and the OS", () => {
    expect(() => moduleOf("lib/math.asm", ".EXTERNAL Math-SQRT\n")).toThrow(
      expect.objectContaining({
        text: "math.asm can't import its own labels; use SQRT",
        position: { line: 1 },
      }),
    );
    expect(() =>
      moduleOf("main.asm", "SQRT RET\n.EXTERNAL MATH-SQRT\n", true),
    ).toThrow(
      "SQRT is defined in this file, so .EXTERNAL MATH-SQRT can't import it",
    );
    expect(() =>
      moduleOf("main.asm", ".EXTERNAL LC3OS-OS_GETC\n", true),
    ).toThrow(
      "Programs can't import labels of the OS (lc3os.asm); call it with TRAP",
    );
    expect(
      moduleOf("main.asm", "sqrt RET\n.EXTERNAL MATH-SQRT\n", true).externals
        .size,
    ).toBe(1);
  });

  it("refuses imports from the entry file", () => {
    expect(
      linkErrors({
        "main.asm": ".EXTERNAL TRIG-SIN\nSTART HALT\n",
        "trig.asm": ".EXTERNAL MAIN-START\nSIN RET\n",
      }),
    ).toEqual([
      {
        file: "trig.asm",
        line: 1,
        text: "Modules can't import from the entry file main.asm",
      },
    ]);
  });

  it("refuses two files with the same base name", () => {
    expect(
      linkErrors({
        "main.asm": "HALT\n",
        "lib/sin.asm": "X RET\n",
        "work/SIN.asm": "X RET\n",
      }),
    ).toEqual([
      {
        file: null,
        line: null,
        text: "Two files are named sin.asm: lib/sin.asm and work/SIN.asm",
      },
    ]);
  });
});

describe("memory limits", () => {
  it("refuses packed modules that end past xFDFF", () => {
    expect(
      linkErrors({
        "main.asm": ".ORIG xFD00\n.EXTERNAL BIG-X\nHALT\n",
        "big.asm": "X .BLKW #512\n",
      }),
    ).toEqual([
      {
        file: null,
        line: null,
        text: "The program doesn't fit in user memory (ends at xFF00, limit xFDFF)",
      },
    ]);
  });

  it("still lets a lone entry file sit high and wrap", () => {
    expect(linked({ "main.asm": ".ORIG xFE00\nHALT\n" }).entry).toBe(0xfe00);
  });

  it("finds segments that share addresses, including across xFFFF", () => {
    const at = (origin: number, length: number, file: string) => ({
      origin,
      words: Array<number>(length).fill(0),
      file,
    });
    const a = at(0x3000, 0x10, "a.asm");
    const b = at(0x300f, 2, "b.asm");
    const c = at(0x3011, 2, "c.asm");
    const wrapped = at(0xfffe, 4, "w.asm");
    const low = at(0x0001, 1, "low.asm");
    expect(overlappingSegments([a, b, c])).toEqual([[a, b]]);
    expect(overlappingSegments([wrapped, low])).toEqual([[wrapped, low]]);
    expect(overlappingSegments([a, at(0x3000, 0, "empty.asm")])).toEqual([]);
  });
});
