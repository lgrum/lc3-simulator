import type { MachineController } from "@/lib/simulator/controller";

/** Removes the breakpoints at `addr`, or adds one if there are none. */
export function toggleBreakpoint(
  machine: Pick<MachineController, "breakpoints">,
  addr: number,
): void {
  const existing = machine.breakpoints
    .list()
    .filter((point) => point.addr === addr);
  if (existing.length === 0) machine.breakpoints.add(addr);
  for (const point of existing) machine.breakpoints.remove(point.id);
}
