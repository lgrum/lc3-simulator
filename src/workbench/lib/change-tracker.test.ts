import { describe, expect, it } from "vite-plus/test";

import { assembleSource } from "@/lib/assembler/assemble-source";
import { createMachineController } from "@/lib/simulator/controller";

import { ChangeTracker } from "./change-tracker";

function setup() {
  const machine = createMachineController();
  const result = assembleSource(
    ".ORIG x3000\nADD R0, R0, #5\nST R0, SLOT\nHALT\nSLOT .FILL #0\n.END",
  );
  if (!result.ok) throw result.error;
  machine.load(result.program);
  const tracker = new ChangeTracker(machine);
  return { machine, tracker };
}

describe("ChangeTracker", () => {
  it("reports registers and memory changed by the last step", () => {
    const { machine, tracker } = setup();
    expect(tracker.getChanges().registers.size).toBe(0);

    machine.stepInto();
    expect([...tracker.getChanges().registers]).toEqual(
      expect.arrayContaining(["R0", "PC", "IR", "PSR"]),
    );
    // PSR is memory-mapped at xFFFC, so its new flags show up there too.
    expect([...tracker.getChanges().memory]).toEqual([0xfffc]);

    machine.stepInto();
    expect(tracker.getChanges().registers.has("R0")).toBe(false);
    expect([...tracker.getChanges().memory]).toEqual([0x3003]);
  });

  it("highlights what step back restored, and forgets history on rebase", () => {
    const { machine, tracker } = setup();
    machine.stepInto();
    machine.stepBack();
    expect(tracker.getChanges().registers.has("R0")).toBe(true);

    tracker.rebase();
    expect(tracker.getChanges().registers.size).toBe(0);
  });

  it("notifies only when the changes differ", () => {
    const { machine, tracker } = setup();
    let notifications = 0;
    tracker.subscribe(() => notifications++);
    machine.stepInto();
    expect(notifications).toBe(1);
    machine.breakpoints.add(0x3002);
    expect(notifications).toBe(2);
  });
});
