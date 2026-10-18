import { createContext, use, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { createMachineController } from "@/lib/simulator/controller";
import type {
  MachineController,
  MachineSnapshot,
} from "@/lib/simulator/controller";
import { OS_FILE, assembleOs } from "@/lib/simulator/os/load";
import osSource from "@/lib/simulator/os/lc3os.asm?raw";
import { namespaceOf } from "@/server/access";
// Imported by its alias path, which component tests replace with a stub.
import { accountBackend, modulesBackend } from "@/workbench/lib/server-api";

import { EXAMPLES } from "./examples";
import { AccountStore } from "./lib/account-store";
import type { AccountState } from "./lib/account-store";
import type { ModulesBackend } from "./lib/published-modules";
import { AssemblyStore } from "./lib/assembly-store";
import type { Assembly } from "./lib/assembly-store";
import { ChangeTracker } from "./lib/change-tracker";
import { EditorTabs } from "./lib/editor-tabs";
import type { EditorTabsState } from "./lib/editor-tabs";
import { createLineMaps } from "./lib/line-map";
import type { LineMap } from "./lib/line-map";
import { ProjectStore } from "./lib/project-store";
import type { Project } from "./lib/project-store";

/** Long-lived objects, created once per page and never replaced. */
export type Workbench = {
  machine: MachineController;
  changes: ChangeTracker;
  project: ProjectStore;
  assembly: AssemblyStore;
  tabs: EditorTabs;
  /** Who is logged in; nobody, for anonymous use. */
  account: AccountStore;
  /** Published modules on the server. */
  modules: ModulesBackend;
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => MachineSnapshot;
  /** The read-only OS file. */
  os: { file: string; source: string; lines: LineMap };
  /** Where the cursor was in the last focused editor, for run to cursor. */
  cursor: { file: string; line: number };
};

const WorkbenchContext = createContext<Workbench | null>(null);

function createWorkbench(): Workbench {
  const machine = createMachineController();
  const [example] = EXAMPLES;
  const changes = new ChangeTracker(machine);
  const project = new ProjectStore(example.project);
  const osLines = createLineMaps(assembleOs()).get(OS_FILE) ?? {
    addressOf: new Map(),
    lineOf: new Map(),
  };
  const assembly = new AssemblyStore(
    machine,
    changes,
    project,
    new Map([[OS_FILE, osLines]]),
  );
  assembly.assemble();
  const tabs = new EditorTabs(project, () => machine.getSnapshot().pc);
  const account = new AccountStore(accountBackend);
  // An admin's builds fetch the published modules they need into lib/.
  account.subscribe(() => {
    const { viewer } = account.getState();
    assembly.setLibrary(
      viewer?.kind === "admin"
        ? { namespace: namespaceOf(viewer), fetch: modulesBackend.fetchBuild }
        : null,
    );
  });
  void account.refresh();
  return {
    machine,
    changes,
    project,
    assembly,
    tabs,
    account,
    modules: modulesBackend,
    subscribe: machine.subscribe.bind(machine),
    getSnapshot: machine.getSnapshot.bind(machine),
    os: {
      file: OS_FILE,
      source: osSource,
      lines: osLines,
    },
    cursor: { file: project.getProject().entry, line: 1 },
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

export function useProject(): Project {
  const { project } = useWorkbench();
  return useSyncExternalStore(project.subscribe, project.getProject);
}

export function useEditorTabs(): EditorTabsState {
  const { tabs } = useWorkbench();
  return useSyncExternalStore(tabs.subscribe, tabs.getState);
}

export function useAssembly(): Assembly {
  const { assembly } = useWorkbench();
  return useSyncExternalStore(assembly.subscribe, assembly.getState);
}

/** Whether any file changed since the last assemble. */
export function useIsStale(): boolean {
  return useAssembly().revision !== useProject().revision;
}

export function useAccount(): AccountState {
  const { account } = useWorkbench();
  return useSyncExternalStore(account.subscribe, account.getState);
}
