import { assembleSource } from "@/lib/assembler/assemble-source";
import type { AssemblyError } from "@/lib/assembler/assemble-source";
import type { LinkedImage } from "@/lib/assembler/types";
import type { MachineController } from "@/lib/simulator/controller";

import type { ChangeTracker } from "./change-tracker";
import { createLineMaps } from "./line-map";
import type { LineMap } from "./line-map";
import type { SourceFile, SourceStore } from "./source-store";

export type Assembly = {
  /** The image loaded into the machine, from the last successful assemble. */
  image: LinkedImage | null;
  /** One line map per file of the loaded image. */
  lines: ReadonlyMap<string, LineMap>;
  /** The error from the last assemble, if it failed. */
  error: AssemblyError | null;
  /** The editor text that was last assembled, to tell when it is stale. */
  assembledText: string | null;
};

const INITIAL: Assembly = {
  image: null,
  lines: new Map(),
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
    private readonly machine: Pick<
      MachineController,
      "load" | "breakpoints" | "watchpoints"
    >,
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
    const { name, text } = this.source.getFile();
    const result = assembleSource(text, name);
    if (!result.ok) {
      this.publish({ ...this.state, error: result.error, assembledText: text });
      return false;
    }
    // Publish first, so machine subscribers see the new line map on load.
    this.publish({
      image: result.image,
      lines: createLineMaps(result.image),
      error: null,
      assembledText: text,
    });
    this.machine.load(result.image);
    this.changes.rebase();
    return true;
  }

  /**
   * Replaces the editor buffer, e.g. with an example, and assembles it. A
   * different program starts without the old one's breakpoints and
   * watchpoints, which the machine keeps by address.
   */
  openFile(file: SourceFile): boolean {
    for (const point of this.machine.breakpoints.list())
      this.machine.breakpoints.remove(point.id);
    for (const watch of this.machine.watchpoints.list())
      this.machine.watchpoints.remove(watch.id);
    this.source.replace(file);
    return this.assemble();
  }

  private publish(state: Assembly): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
