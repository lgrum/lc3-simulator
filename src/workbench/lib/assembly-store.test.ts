import { describe, expect, it } from "vite-plus/test";

import { createMachineController } from "@/lib/simulator/controller";

import { AssemblyStore } from "./assembly-store";
import { ChangeTracker } from "./change-tracker";
import { SourceStore } from "./source-store";

function setup(text: string) {
  const machine = createMachineController();
  const source = new SourceStore({ name: "a.asm", text }, undefined);
  const store = new AssemblyStore(machine, new ChangeTracker(machine), source);
  return { machine, source, store };
}

describe("AssemblyStore", () => {
  it("loads a program and publishes its line map before the machine loads", () => {
    const { machine, store } = setup(".ORIG x3100\nHALT\n.END");
    let linesOnLoad: unknown;
    machine.subscribe(() => (linesOnLoad = store.getState().lines));

    expect(store.assemble()).toBe(true);
    expect(machine.getSnapshot().pc).toBe(0x3100);
    expect(linesOnLoad).toBe(store.getState().lines);
    expect(store.getState()).toMatchObject({ error: null });
  });

  it("keeps the loaded program when the new text fails to assemble", () => {
    const { source, store } = setup(".ORIG x3000\nHALT\n.END");
    store.assemble();
    const program = store.getState().program;

    source.setText(".ORIG x3000\nBR NOWHERE\n.END");
    expect(store.assemble()).toBe(false);
    expect(store.getState().program).toBe(program);
    expect(store.getState().error?.position).toEqual({ line: 2 });
    expect(store.getState().assembledText).toBe(source.getFile().text);
  });

  it("opens a file and assembles it", () => {
    const { source, store } = setup("");
    expect(store.openFile({ name: "b.asm", text: ".ORIG x3000\nHALT" })).toBe(
      true,
    );
    expect(source.getFile().name).toBe("b.asm");
  });
});
