import type { MachineSnapshot } from "@/lib/simulator/controller";

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
  if (!availableControls(workbench.machine.getSnapshot()).runToCursor) return;
  const { kind, line } = workbench.cursor;
  if (kind === "program" && !ensureAssembled(workbench)) return;
  const lines = linesOf(workbench, kind);
  const addr = lines && addressAtOrAfter(lines, line);
  if (addr !== null && addr !== undefined) workbench.machine.runTo(addr);
}

/** Which execution controls apply to the current machine state. */
export function availableControls(snapshot: MachineSnapshot) {
  const running = snapshot.status === "running";
  const halted = snapshot.status === "halted";
  return {
    continue: !running,
    pause: running,
    step: !running && !halted,
    stepBack: !running && snapshot.canStepBack,
    runToCursor: !running && !halted,
  };
}

/**
 * Whether the views should follow the PC: always while paused, and while
 * running at a speed slow enough to watch. At max speed the PC moves too fast
 * to show.
 */
export function tracksPc(snapshot: MachineSnapshot): boolean {
  return snapshot.status !== "running" || snapshot.speed !== "max";
}

export type ControlName = keyof ReturnType<typeof availableControls>;

/**
 * Starts or resumes execution. After HALT, starts the program again from a
 * fresh copy, which is what a student pressing Run expects.
 */
export function continueRun({ machine }: Workbench): void {
  const { status } = machine.getSnapshot();
  if (status === "running") return;
  if (status === "halted") machine.reset();
  machine.run();
}

function whenStepping(workbench: Workbench, step: () => void): void {
  if (!availableControls(workbench.machine.getSnapshot()).step) return;
  try {
    step();
  } catch {
    // The clock was stopped by a register edit; the machine now reports
    // "halted", which the status readout shows.
  }
}

export const stepInto = (workbench: Workbench) =>
  whenStepping(workbench, () => workbench.machine.stepInto());
export const stepOver = (workbench: Workbench) =>
  whenStepping(workbench, () => workbench.machine.stepOver());
export const stepOut = (workbench: Workbench) =>
  whenStepping(workbench, () => workbench.machine.stepOut());

export function stepBack({ machine }: Workbench): void {
  if (availableControls(machine.getSnapshot()).stepBack) machine.stepBack();
}

export function pause({ machine }: Workbench): void {
  if (machine.getSnapshot().status === "running") machine.pause();
}

/** Reloads the program into fresh memory, or only resets the processor. */
export function reset(
  { machine, changes }: Workbench,
  { keepMemory = false } = {},
): void {
  machine.reset({ keepMemory });
  changes.rebase();
}
