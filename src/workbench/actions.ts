import type { SourceKind } from "./editor/machine-markers";
import { toggleBreakpoint } from "./lib/breakpoints";
import { addressAtOrAfter } from "./lib/line-map";
import type { LineMap } from "./lib/line-map";
import type { Workbench } from "./workbench-provider";

export function isStale({ assembly, source }: Workbench): boolean {
  return assembly.getState().assembledText !== source.getFile().text;
}

/** Assembles first if the buffer changed. Returns whether a program is loaded. */
export function ensureAssembled(workbench: Workbench): boolean {
  if (isStale(workbench)) return workbench.assembly.assemble();
  return workbench.assembly.getState().program !== null;
}

export function linesOf(
  workbench: Workbench,
  kind: SourceKind,
): LineMap | null {
  return kind === "os"
    ? workbench.os.lines
    : workbench.assembly.getState().lines;
}

/** Toggles a breakpoint on the statement at or after `line`. */
export function toggleBreakpointAtLine(
  workbench: Workbench,
  kind: SourceKind,
  line: number,
): void {
  if (kind === "program" && !ensureAssembled(workbench)) return;
  const lines = linesOf(workbench, kind);
  const addr = lines && addressAtOrAfter(lines, line);
  if (addr !== null && addr !== undefined)
    toggleBreakpoint(workbench.machine, addr);
}

/** Runs until the statement under the cursor of the last focused editor. */
export function runToCursor(workbench: Workbench): void {
  const { kind, line } = workbench.cursor;
  if (kind === "program" && !ensureAssembled(workbench)) return;
  const lines = linesOf(workbench, kind);
  const addr = lines && addressAtOrAfter(lines, line);
  if (addr !== null && addr !== undefined) workbench.machine.runTo(addr);
}
