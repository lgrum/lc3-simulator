import { assembleSource } from "@/lib/assembler/assemble-source";
import type { AssemblyError } from "@/lib/assembler/assemble-source";
import type { AssemblyResult } from "@/lib/assembler/types";
import type { MachineController } from "@/lib/simulator/controller";

import type { ChangeTracker } from "./change-tracker";
import { createLineMap } from "./line-map";
import type { LineMap } from "./line-map";
import type { SourceFile, SourceStore } from "./source-store";

export type Assembly = {
  /** The program loaded into the machine, from the last successful assemble. */
  program: AssemblyResult | null;
  lines: LineMap | null;
  /** The error from the last assemble, if it failed. */
  error: AssemblyError | null;
  /** The editor text that was last assembled, to tell when it is stale. */
  assembledText: string | null;
};

const INITIAL: Assembly = {
  program: null,
  lines: null,
  error: null,
  assembledText: null,
};

/**
 * Assembles the editor buffer and loads it into the machine. Compatible with
 * useSyncExternalStore.
 */
export class AssemblyStore {
  private state = INITIAL;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly machine: Pick<MachineController, "load">,
    private readonly changes: Pick<ChangeTracker, "rebase">,
    private readonly source: SourceStore,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): Assembly => this.state;

  /** Assembles the editor buffer and loads it. Returns whether it worked. */
  assemble(): boolean {
    const text = this.source.getFile().text;
    const result = assembleSource(text);
    if (!result.ok) {
      this.publish({ ...this.state, error: result.error, assembledText: text });
      return false;
    }
    // Publish first, so machine subscribers see the new line map on load.
    this.publish({
      program: result.program,
      lines: createLineMap(result.program),
      error: null,
      assembledText: text,
    });
    this.machine.load(result.program);
    this.changes.rebase();
    return true;
  }

  /** Replaces the editor buffer, e.g. with an example, and assembles it. */
  openFile(file: SourceFile): boolean {
    this.source.replace(file);
    return this.assemble();
  }

  private publish(state: Assembly): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
