import type { BuildProgress } from "@/workbench/lib/assembly-store";
import { m } from "@/paraglide/messages";

/** What a running build is doing, e.g. "Fetching published modules: 4 of 9". */
export function buildStatusText(building: BuildProgress): string {
  return building.phase === "fetching"
    ? m.assemble_fetching({ done: building.done, total: building.total })
    : m.assemble_linking();
}

/** How much of a running build is done, from 0 to 1. */
export function buildShare(building: BuildProgress): number {
  if (building.phase === "assembling") return 1;
  return building.total === 0 ? 0 : building.done / building.total;
}
