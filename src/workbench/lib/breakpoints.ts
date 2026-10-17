import type { SourceLocation } from "@/lib/assembler/types";
import type {
  BreakpointId,
  MachineController,
} from "@/lib/simulator/controller";

import { addressAtOrAfter } from "./line-map";
import type { LineMap } from "./line-map";

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

/**
 * The source line of each breakpoint. The machine keeps breakpoints by
 * address, but an edit or a relink can move a line's code to another
 * address, so the line is what counts. Each breakpoint's line is taken from
 * its address the first time it is seen, then moves with edits, and after
 * every assemble the breakpoint is put back on its line's new address.
 */
export class BreakpointLines {
  private readonly locations = new Map<BreakpointId, SourceLocation>();

  constructor(
    private readonly machine: Pick<MachineController, "breakpoints">,
    /** The line maps of the loaded image, including the OS. */
    private readonly loadedLines: () => ReadonlyMap<string, LineMap>,
  ) {}

  /** Where a breakpoint is, if it is on a source line. */
  locationOf(id: BreakpointId): SourceLocation | undefined {
    this.capture();
    return this.locations.get(id);
  }

  /** Records the line of every new breakpoint and forgets removed ones. */
  capture(): void {
    const points = this.machine.breakpoints.list();
    const ids = new Set(points.map((point) => point.id));
    for (const id of this.locations.keys())
      if (!ids.has(id)) this.locations.delete(id);
    const lines = this.loadedLines();
    for (const point of points) {
      if (this.locations.has(point.id)) continue;
      for (const [file, map] of lines) {
        const line = map.lineOf.get(point.addr);
        if (line === undefined) continue;
        this.locations.set(point.id, { file, line });
        break;
      }
    }
  }

  /** Moves the breakpoints of `file` with an edit to its text. */
  mapLines(file: string, mapLine: (line: number) => number): void {
    this.capture();
    for (const location of this.locations.values())
      if (location.file === file) location.line = mapLine(location.line);
  }

  /**
   * Puts each breakpoint at the address of its line in the image that was
   * just loaded. A line without code moves to the next line that has some.
   * Breakpoints in files that are no longer linked are removed. Call
   * capture() before loading, so breakpoints set on the old image keep
   * their lines.
   */
  relink(): void {
    const lines = this.loadedLines();
    const { breakpoints } = this.machine;
    for (const point of breakpoints.list()) {
      const location = this.locations.get(point.id);
      if (!location) continue;
      const map = lines.get(location.file);
      const addr = map && addressAtOrAfter(map, location.line);
      if (map === undefined || addr === undefined) {
        breakpoints.remove(point.id);
        this.locations.delete(point.id);
        continue;
      }
      const moved = { file: location.file, line: map.lineOf.get(addr)! };
      if (addr === point.addr) {
        this.locations.set(point.id, moved);
        continue;
      }
      breakpoints.remove(point.id);
      this.locations.delete(point.id);
      const id = breakpoints.add(addr, {
        condition: point.condition,
        hitCount: point.hitCount,
      });
      if (!point.enabled) breakpoints.setEnabled(id, false);
      this.locations.set(id, moved);
    }
  }

  /** Removes the breakpoints in `file`, e.g. when it is deleted. */
  removeFile(file: string): void {
    this.capture();
    for (const [id, location] of this.locations)
      if (location.file === file) {
        this.machine.breakpoints.remove(id);
        this.locations.delete(id);
      }
  }

  /** Forgets every breakpoint, e.g. when another program is opened. */
  clear(): void {
    for (const point of this.machine.breakpoints.list())
      this.machine.breakpoints.remove(point.id);
    this.locations.clear();
  }
}
