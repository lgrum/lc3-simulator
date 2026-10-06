import { describe, expect, it } from "vite-plus/test";

import { createMachineController } from "@/lib/simulator/controller";

import { toggleBreakpoint } from "./breakpoints";

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
