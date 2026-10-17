import type { MachineSnapshot } from "@/lib/simulator/controller";

import { toggleBreakpoint } from "./lib/breakpoints";
import type { SavedProject } from "./lib/project-store";
import { addressAtOrAfter } from "./lib/line-map";
import type { LineMap } from "./lib/line-map";
import type { Workbench } from "./workbench-provider";

/** Assembles first if a file changed. Returns whether a program is loaded. */
export function ensureAssembled(workbench: Workbench): boolean {
  if (workbench.assembly.isStale()) return workbench.assembly.assemble();
  return workbench.assembly.getState().image !== null;
}

/** Adds a file to the project, or replaces its text, and shows it. */
export function writeFile(
  workbench: Workbench,
  path: string,
  text: string,
): void {
  workbench.project.writeFile(path, text);
  workbench.tabs.show(path);
}

/** Deletes a file with its breakpoints. The entry file can't be deleted. */
export function deleteFile(workbench: Workbench, path: string): void {
  workbench.assembly.breakpoints.removeFile(path);
  workbench.project.deleteFile(path);
}

/**
 * Renames or moves a file or folder. Open tabs and breakpoints follow the
 * files.
 */
export function movePath(workbench: Workbench, from: string, to: string): void {
  const { project, tabs, assembly } = workbench;
  const moves = project.movesFor(from, to);
  tabs.expectRenames(moves);
  project.move(from, to);
  assembly.breakpoints.renameFiles(moves);
  const cursorFile = moves.get(workbench.cursor.file);
  if (cursorFile) workbench.cursor = { ...workbench.cursor, file: cursorFile };
}

/** Deletes a folder with its files and their breakpoints. */
export function deleteFolder(workbench: Workbench, path: string): void {
  for (const file of workbench.project.getProject().files.keys())
    if (file.startsWith(path + "/"))
      workbench.assembly.breakpoints.removeFile(file);
  workbench.project.deleteFolder(path);
}

/** Replaces the project, e.g. with an example, and assembles it. */
export function openProject(
  workbench: Workbench,
  project: SavedProject,
): boolean {
  workbench.tabs.forgetEditorStates();
  const loaded = workbench.assembly.openProject(project);
  workbench.tabs.show(project.entry);
  return loaded;
}

/** The line map of a project file or the OS, if it was loaded. */
export function linesOf(workbench: Workbench, file: string): LineMap | null {
  return file === workbench.os.file
    ? workbench.os.lines
    : (workbench.assembly.getState().lines.get(file) ?? null);
}

/** Toggles a breakpoint on the statement at or after `line`. */
export function toggleBreakpointAtLine(
  workbench: Workbench,
  file: string,
  line: number,
): void {
  if (file !== workbench.os.file && !ensureAssembled(workbench)) return;
  const lines = linesOf(workbench, file);
  const addr = lines && addressAtOrAfter(lines, line);
  if (addr !== null && addr !== undefined)
    toggleBreakpoint(workbench.machine, addr);
}

/** Runs until the statement under the cursor of the last focused editor. */
export function runToCursor(workbench: Workbench): void {
  if (!availableControls(workbench.machine.getSnapshot()).runToCursor) return;
  const { file, line } = workbench.cursor;
  if (file !== workbench.os.file && !ensureAssembled(workbench)) return;
  const lines = linesOf(workbench, file);
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
