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
    expect(store.getState()).toMatchObject({ error: null });
  });

  it("keeps the loaded program when the new text fails to assemble", () => {
    const { project, store } = setup(".ORIG x3000\nHALT\n.END");
    store.assemble();
    const image = store.getState().image;

    project.setText("a.asm", ".ORIG x3000\nBR NOWHERE\n.END");
    expect(store.assemble()).toBe(false);
    expect(store.getState().image).toBe(image);
    expect(store.getState().error?.file).toBe("a.asm");
    expect(store.getState().error?.error.position).toEqual({ line: 2 });
    expect(store.isStale()).toBe(false);
  });

  it("is stale when any file changes and assembles the entry file", () => {
    const { project, store } = setup(".ORIG x3000\nHALT\n.END");
    store.assemble();
    expect(store.isStale()).toBe(false);

    project.writeFile("b.asm", "not even code");
    expect(store.isStale()).toBe(true);
    expect(store.assemble()).toBe(true);

    project.setEntry("b.asm");
    expect(store.assemble()).toBe(false);
    expect(store.getState().error?.file).toBe("b.asm");
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
});
