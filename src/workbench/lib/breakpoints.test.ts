import { describe, expect, it } from "vite-plus/test";

import { createMachineController } from "@/lib/simulator/controller";

import { AssemblyStore } from "./assembly-store";
import { toggleBreakpoint } from "./breakpoints";
import { ChangeTracker } from "./change-tracker";
import { addressAtOrAfter } from "./line-map";
import { SourceStore } from "./source-store";

describe("toggleBreakpoint", () => {
  it("adds a breakpoint, then removes every breakpoint at the address", () => {
    const machine = createMachineController();
    toggleBreakpoint(machine, 0x3000);
    expect(machine.breakpoints.list()).toMatchObject([{ addr: 0x3000 }]);

    machine.breakpoints.add(0x3000, { condition: "R0 == 1" });
    machine.breakpoints.add(0x3001);
    toggleBreakpoint(machine, 0x3000);
    expect(machine.breakpoints.list()).toMatchObject([{ addr: 0x3001 }]);
  });
});

const PROGRAM = [
  ".ORIG x3000", // 1
  "ADD R0, R0, #1", // 2
  "ADD R1, R1, #1", // 3
  "HALT", // 4
  ".END", // 5
].join("\n");

function setup(text = PROGRAM) {
  const machine = createMachineController();
  const source = new SourceStore({ name: "main.asm", text }, undefined);
  const store = new AssemblyStore(machine, new ChangeTracker(machine), source);
  store.assemble();
  /** Sets a breakpoint on a line of main.asm, as the gutter does. */
  const breakAt = (line: number) => {
    const lines = store.getState().lines.get("main.asm")!;
    toggleBreakpoint(machine, addressAtOrAfter(lines, line)!);
  };
  return { machine, source, store, breakAt };
}

describe("BreakpointLines", () => {
  it("keeps a breakpoint on its line when code above it grows", () => {
    const { machine, source, store, breakAt } = setup();
    breakAt(4);
    machine.breakpoints.setEnabled(machine.breakpoints.list()[0].id, false);

    // Two instructions inserted above HALT, as typing them would.
    source.setText(PROGRAM.replace("HALT", "NOT R2, R2\nNOT R3, R3\nHALT"));
    store.breakpoints.mapLines("main.asm", (line) =>
      line >= 4 ? line + 2 : line,
    );
    store.assemble();

    expect(machine.breakpoints.list()).toMatchObject([
      { addr: 0x3004, enabled: false },
    ]);
    expect(
      store.breakpoints.locationOf(machine.breakpoints.list()[0].id),
    ).toEqual({ file: "main.asm", line: 6 });
  });

  it("keeps conditions and hit counts when a breakpoint moves", () => {
    const { machine, source, store } = setup();
    machine.breakpoints.add(0x3002, { condition: "R0 == 1", hitCount: 2 });

    source.setText(PROGRAM.replace("ADD R0", "NOT R2, R2\nADD R0"));
    store.breakpoints.mapLines("main.asm", (line) =>
      line >= 2 ? line + 1 : line,
    );
    store.assemble();

    expect(machine.breakpoints.list()).toMatchObject([
      { addr: 0x3003, condition: "R0 == 1", hitCount: 2 },
    ]);
  });

  it("moves a breakpoint to the next line with code", () => {
    const { machine, source, store, breakAt } = setup();
    breakAt(3);

    source.setText(PROGRAM.replace("ADD R1, R1, #1", "; gone"));
    store.assemble();

    expect(machine.breakpoints.list()).toMatchObject([{ addr: 0x3001 }]);
    expect(
      store.breakpoints.locationOf(machine.breakpoints.list()[0].id),
    ).toEqual({ file: "main.asm", line: 4 });
  });

  it("removes breakpoints whose line has no code left after it", () => {
    const { machine, source, store, breakAt } = setup();
    breakAt(4);

    source.setText(PROGRAM.replace("HALT", "; gone"));
    store.assemble();

    expect(machine.breakpoints.list()).toEqual([]);
  });

  it("removes breakpoints whose file is no longer linked", () => {
    const { machine, source, store, breakAt } = setup();
    breakAt(2);

    source.replace({ name: "other.asm", text: PROGRAM });
    store.assemble();

    expect(machine.breakpoints.list()).toEqual([]);
  });

  it("keeps breakpoints at addresses without a source line", () => {
    const { machine, store } = setup();
    machine.breakpoints.add(0x5000);
    store.assemble();
    expect(machine.breakpoints.list()).toMatchObject([{ addr: 0x5000 }]);
  });
});
