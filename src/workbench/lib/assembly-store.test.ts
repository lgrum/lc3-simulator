import { describe, expect, it } from "vite-plus/test";

import { createMachineController } from "@/lib/simulator/controller";

import { AssemblyStore } from "./assembly-store";
import { ChangeTracker } from "./change-tracker";
import { ProjectStore, localStorageBackend } from "./project-store";

function setup(text: string) {
  const machine = createMachineController();
  const project = new ProjectStore(
    { files: { "a.asm": text }, folders: [], entry: "a.asm" },
    localStorageBackend(null),
  );
  const store = new AssemblyStore(machine, new ChangeTracker(machine), project);
  return { machine, project, store };
}

describe("AssemblyStore", () => {
  it("loads a program and publishes its line map before the machine loads", () => {
    const { machine, store } = setup(".ORIG x3100\nHALT\n.END");
    let linesOnLoad: unknown;
    machine.subscribe(() => (linesOnLoad = store.getState().lines));

    expect(store.assemble()).toBe(true);
    expect(machine.getSnapshot().pc).toBe(0x3100);
    expect(linesOnLoad).toBe(store.getState().lines);
    expect(store.getState().lines.get("a.asm")?.addressOf.get(2)).toBe(0x3100);
    expect(store.getState()).toMatchObject({ diagnostics: [] });
  });

  it("keeps the loaded program when the new text fails to assemble", () => {
    const { project, store } = setup(".ORIG x3000\nHALT\n.END");
    store.assemble();
    const image = store.getState().image;

    project.setText("a.asm", ".ORIG x3000\nBR NOWHERE\n.END");
    expect(store.assemble()).toBe(false);
    expect(store.getState().image).toBe(image);
    expect(store.getState().diagnostics).toMatchObject([
      { file: "a.asm", severity: "error", position: { line: 2 } },
    ]);
    expect(store.isStale()).toBe(false);
  });

  it("is stale when any file changes and links only when every file assembles", () => {
    const { project, store } = setup(".ORIG x3000\nHALT\n.END");
    store.assemble();
    expect(store.isStale()).toBe(false);

    project.writeFile("b.asm", "not even code");
    expect(store.isStale()).toBe(true);
    expect(store.assemble()).toBe(false);
    expect(store.getState().diagnostics).toMatchObject([
      { file: "b.asm", severity: "error" },
    ]);

    project.setText("b.asm", "X RET\n");
    expect(store.assemble()).toBe(true);
    expect(store.getState().image?.segments).toHaveLength(1);
  });

  it("links the files the entry file imports and loads them", () => {
    const { machine, project, store } = setup(
      ".EXTERNAL TRIG-SIN\nLD R5, P\nJSRR R5\nHALT\nP .FILL TRIG-SIN\n",
    );
    project.writeFile("lib/trig.asm", "SIN RET\n");
    expect(store.assemble()).toBe(true);
    expect(store.getState().lines.get("lib/trig.asm")?.addressOf.get(1)).toBe(
      0x3004,
    );
    expect(machine.disassemble(0x3004)).toMatchObject({
      file: "lib/trig.asm",
      label: "TRIG-SIN",
    });
  });

  it("loads an entry file without .ORIG at x3000, with a relocated .FILL", () => {
    const { machine, store } = setup(
      "LEA R0, DATA\nHALT\nPTR .FILL DATA\nDATA .FILL #7\n",
    );
    expect(store.assemble()).toBe(true);
    expect(machine.getSnapshot().pc).toBe(0x3000);
    expect(machine.readMemory(0x3002, 1)[0]).toBe(0x3003);
  });

  it("opens a project and assembles it", () => {
    const { project, store } = setup("");
    expect(
      store.openProject({
        files: { "b.asm": ".ORIG x3000\nHALT" },
        folders: [],
        entry: "b.asm",
      }),
    ).toBe(true);
    expect([...project.getProject().files.keys()]).toEqual(["b.asm"]);
  });

  it("keeps breakpoints on re-assemble but not for another project", () => {
    const { machine, store } = setup(".ORIG x3000\nHALT\n.END");
    store.assemble();
    machine.breakpoints.add(0x3000);
    machine.watchpoints.add(0x3000, "rw");
    store.assemble();
    expect(machine.breakpoints.list()).toHaveLength(1);

    store.openProject({
      files: { "b.asm": ".ORIG x3000\nHALT" },
      folders: [],
      entry: "b.asm",
    });
    expect(machine.breakpoints.list()).toHaveLength(0);
    expect(machine.watchpoints.list()).toHaveLength(0);
  });

  it("reports one problem per broken file, then the link errors", () => {
    const { project, store } = setup(".EXTERNAL MATH-SQRT\nHALT\n");
    project.writeFile("p.asm", "BR NOWHERE\n");
    project.writeFile("q.asm", "ADD R0\n");
    expect(store.assemble()).toBe(false);
    expect(
      store
        .getState()
        .diagnostics.map(({ file, severity }) => [file, severity]),
    ).toEqual([
      ["p.asm", "error"],
      ["q.asm", "error"],
    ]);

    project.setText("p.asm", "X RET\n");
    project.setText("q.asm", ".ORIG x4000\nY RET\n");
    expect(store.assemble()).toBe(false);
    expect(store.getState().diagnostics).toEqual([
      {
        file: "a.asm",
        position: { line: 1 },
        severity: "error",
        text: "No module named MATH in this program",
      },
    ]);
  });

  it("shows labels of other modules with their prefix", () => {
    const { machine, project, store } = setup(
      ".EXTERNAL P-GO\n.EXTERNAL Q-GO\nLOOP BR LOOP\n",
    );
    project.writeFile("p.asm", "GO RET\nLOOP BR LOOP\n");
    project.writeFile("q.asm", "GO RET\nLOOP BR LOOP\n");
    expect(store.assemble()).toBe(true);
    expect(machine.disassemble(0x3000)).toMatchObject({
      label: "LOOP",
      text: expect.stringMatching(/ LOOP$/),
    });
    expect(machine.disassemble(0x3002)).toMatchObject({
      label: "P-LOOP",
      text: expect.stringMatching(/ P-LOOP$/),
    });
    expect(machine.disassemble(0x3004)).toMatchObject({
      label: "Q-LOOP",
      text: expect.stringMatching(/ Q-LOOP$/),
    });
    expect(machine.lookupSymbol("q-loop")).toBe(0x3004);
  });
});
