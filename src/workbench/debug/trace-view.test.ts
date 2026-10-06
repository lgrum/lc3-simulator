import { describe, expect, it } from "vite-plus/test";

import { assembleSource } from "@/lib/assembler/assemble-source";
import { createMachineController } from "@/lib/simulator/controller";

import { describeStep } from "./trace-view";

function stepsOf(source: string, count: number) {
  const result = assembleSource(source);
  if (!result.ok) throw result.error;
  const machine = createMachineController();
  machine.load(result.program);
  return Array.from({ length: count }, () => machine.stepInto());
}

describe("describeStep", () => {
  it("lists register, memory and flag changes", () => {
    const [add, store] = stepsOf(
      ".ORIG x3000\nADD R0, R0, #-1\nST R0, SLOT\nHALT\nSLOT .FILL #0\n.END",
      2,
    );
    expect(describeStep(add)).toEqual(["R0 x0000 → xFFFF", "nZp → Nzp"]);
    expect(describeStep(store)).toEqual(["[x3003] x0000 → xFFFF"]);
  });

  it("reports output from the display", () => {
    const steps = stepsOf(
      ".ORIG x3000\nLD R0, CHAR\nOUT\n.END\nCHAR .FILL x41",
      30,
    );
    expect(
      steps.some((step) => describeStep(step).includes('printed "A"')),
    ).toBe(true);
  });
});
