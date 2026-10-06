import { createContext, use, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { createMachineController } from "@/lib/simulator/controller";
import type {
  MachineController,
  MachineSnapshot,
} from "@/lib/simulator/controller";
import { assembleOs } from "@/lib/simulator/os/load";
import osSource from "@/lib/simulator/os/lc3os.asm?raw";

import type { SourceKind } from "./editor/machine-markers";
import { EXAMPLES } from "./examples";
import { AssemblyStore } from "./lib/assembly-store";
import type { Assembly } from "./lib/assembly-store";
import { ChangeTracker } from "./lib/change-tracker";
import { createLineMap } from "./lib/line-map";
import type { LineMap } from "./lib/line-map";
import { SourceStore } from "./lib/source-store";
import type { SourceFile } from "./lib/source-store";

/** Long-lived objects, created once per page and never replaced. */
export type Workbench = {
  machine: MachineController;
  changes: ChangeTracker;
  source: SourceStore;
  assembly: AssemblyStore;
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => MachineSnapshot;
  os: { fileName: string; source: string; lines: LineMap };
  /** Where the cursor was in the last focused editor, for run to cursor. */
  cursor: { kind: SourceKind; line: number };
};

const WorkbenchContext = createContext<Workbench | null>(null);

function createWorkbench(): Workbench {
  const machine = createMachineController();
  const [example] = EXAMPLES;
  const changes = new ChangeTracker(machine);
  const source = new SourceStore({
    name: example.fileName,
    text: example.source,
  });
  const assembly = new AssemblyStore(machine, changes, source);
  assembly.assemble();
  return {
    machine,
    changes,
    source,
    assembly,
    subscribe: machine.subscribe.bind(machine),
    getSnapshot: machine.getSnapshot.bind(machine),
    os: {
      fileName: "lc3os.asm",
      source: osSource,
      lines: createLineMap(assembleOs()),
    },
    cursor: { kind: "program", line: 1 },
  };
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  // Created on the first client render, never at module level: the SPA shell
  // is prerendered at build time.
  const [workbench] = useState(createWorkbench);
  return <WorkbenchContext value={workbench}>{children}</WorkbenchContext>;
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

/**
 * Reads machine state during render, e.g. disassembly or the breakpoint
 * list. React Compiler assumes render reads are pure and would cache them,
 * but the machine changes without React knowing; this hook always reads
 * again and re-renders whenever the snapshot changes.
 */
export function useMachineRead<T>(read: (machine: MachineController) => T): T {
  "use no memo";
  const { machine } = useWorkbench();
  useSnapshot();
  return read(machine);
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

export function useAssembly(): Assembly {
  const { assembly } = useWorkbench();
  return useSyncExternalStore(assembly.subscribe, assembly.getState);
}

/** Whether the editor buffer differs from what was last assembled. */
export function useIsStale(): boolean {
  const file = useSourceFile();
  return useAssembly().assembledText !== file.text;
}
