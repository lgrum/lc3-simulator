import { createContext, use, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { assembleSource } from "@/lib/assembler/assemble-source";
import type { AssemblyError } from "@/lib/assembler/assemble-source";
import type { AssemblyResult } from "@/lib/assembler/types";
import { createMachineController } from "@/lib/simulator/controller";
import type {
  MachineController,
  MachineSnapshot,
} from "@/lib/simulator/controller";
import { assembleOs } from "@/lib/simulator/os/load";
import osSource from "@/lib/simulator/os/lc3os.asm?raw";

import { EXAMPLES } from "./examples";
import { ChangeTracker } from "./lib/change-tracker";
import { createLineMap } from "./lib/line-map";
import type { LineMap } from "./lib/line-map";
import { SourceStore } from "./lib/source-store";
import type { SourceFile } from "./lib/source-store";

/** Long-lived objects, created once per page. */
type Workbench = {
  machine: MachineController;
  changes: ChangeTracker;
  source: SourceStore;
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => MachineSnapshot;
  os: { source: string; lines: LineMap };
};

export type Assembly = {
  /** The program loaded into the machine, from the last successful assemble. */
  program: AssemblyResult | null;
  lines: LineMap | null;
  /** The error from the last assemble, if it failed. */
  error: AssemblyError | null;
  /** The editor text that was last assembled, to tell when it is stale. */
  assembledText: string | null;
};

type AssemblyContextValue = Assembly & {
  /** Assembles the editor buffer and loads it. Returns whether it worked. */
  assemble: () => boolean;
  /** Replaces the editor buffer, e.g. with an example, and assembles it. */
  openFile: (file: SourceFile) => void;
};

const WorkbenchContext = createContext<Workbench | null>(null);
const AssemblyContext = createContext<AssemblyContextValue | null>(null);

function assembleInto(workbench: Workbench, previous: Assembly): Assembly {
  const text = workbench.source.getFile().text;
  const result = assembleSource(text);
  if (!result.ok)
    return { ...previous, error: result.error, assembledText: text };
  workbench.machine.load(result.program);
  workbench.changes.rebase();
  return {
    program: result.program,
    lines: createLineMap(result.program),
    error: null,
    assembledText: text,
  };
}

function createWorkbench(): { workbench: Workbench; assembly: Assembly } {
  const machine = createMachineController();
  const [example] = EXAMPLES;
  const workbench: Workbench = {
    machine,
    changes: new ChangeTracker(machine),
    source: new SourceStore({ name: example.fileName, text: example.source }),
    subscribe: machine.subscribe.bind(machine),
    getSnapshot: machine.getSnapshot.bind(machine),
    os: { source: osSource, lines: createLineMap(assembleOs()) },
  };
  const empty: Assembly = {
    program: null,
    lines: null,
    error: null,
    assembledText: null,
  };
  return { workbench, assembly: assembleInto(workbench, empty) };
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  // Created on the first client render, never at module level: the SPA shell
  // is prerendered at build time.
  const [initial] = useState(createWorkbench);
  const { workbench } = initial;
  const [assembly, setAssembly] = useState(initial.assembly);

  const assemble = () => {
    const next = assembleInto(workbench, assembly);
    setAssembly(next);
    return next.error === null;
  };
  const openFile = (file: SourceFile) => {
    workbench.source.replace(file);
    setAssembly(assembleInto(workbench, assembly));
  };

  return (
    <WorkbenchContext value={workbench}>
      <AssemblyContext value={{ ...assembly, assemble, openFile }}>
        {children}
      </AssemblyContext>
    </WorkbenchContext>
  );
}

export function useWorkbench(): Workbench {
  const workbench = use(WorkbenchContext);
  if (!workbench)
    throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return workbench;
}

export function useMachine(): MachineController {
  return useWorkbench().machine;
}

/** The machine state; re-renders once per run slice, not per instruction. */
export function useSnapshot(): MachineSnapshot {
  const { subscribe, getSnapshot } = useWorkbench();
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Registers and memory words that changed at the last stop. */
export function useChanges() {
  const { changes } = useWorkbench();
  return useSyncExternalStore(changes.subscribe, changes.getChanges);
}

export function useSourceFile(): SourceFile {
  const { source } = useWorkbench();
  return useSyncExternalStore(source.subscribe, source.getFile);
}

export function useAssembly(): AssemblyContextValue {
  const assembly = use(AssemblyContext);
  if (!assembly)
    throw new Error("useAssembly must be used inside WorkbenchProvider");
  return assembly;
}
