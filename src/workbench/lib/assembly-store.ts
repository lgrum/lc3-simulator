import { assembleModule, diagnosticOf } from "@/lib/assembler/assemble-source";
import { link } from "@/lib/assembler/linker";
import type {
  Diagnostic,
  LinkedImage,
  ObjectModule,
} from "@/lib/assembler/types";
import type { MachineController } from "@/lib/simulator/controller";

import { BreakpointLines } from "./breakpoints";
import type { ChangeTracker } from "./change-tracker";
import { createLineMaps } from "./line-map";
import type { LineMap } from "./line-map";
import type { ProjectStore, SavedProject } from "./project-store";

export type Assembly = {
  /** The image loaded into the machine, from the last successful assemble. */
  image: LinkedImage | null;
  /** One line map per file of the loaded image. */
  lines: ReadonlyMap<string, LineMap>;
  /** Errors, warnings and notes from the last assemble. */
  diagnostics: ReadonlyArray<Diagnostic>;
  /** The project revision that was last assembled, to tell when it is stale. */
  revision: number | null;
};

const INITIAL: Assembly = {
  image: null,
  lines: new Map(),
  diagnostics: [],
  revision: null,
};

/**
 * Assembles every file of the project, links from the entry file and loads
 * the program into the machine. Compatible with useSyncExternalStore.
 */
export class AssemblyStore {
  private state = INITIAL;
  private readonly listeners = new Set<() => void>();
  /** Breakpoints by source line, put back on their lines after each load. */
  readonly breakpoints: BreakpointLines;

  constructor(
    private readonly machine: Pick<
      MachineController,
      "load" | "breakpoints" | "watchpoints"
    >,
    private readonly changes: Pick<ChangeTracker, "rebase">,
    private readonly project: ProjectStore,
    /** Line maps of files that are always loaded, i.e. the OS. */
    fixedLines: ReadonlyMap<string, LineMap> = new Map(),
  ) {
    this.breakpoints = new BreakpointLines(
      machine,
      () => new Map([...fixedLines, ...this.state.lines]),
    );
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): Assembly => this.state;

  /** Whether the project changed since the last assemble. */
  isStale(): boolean {
    return this.state.revision !== this.project.getProject().revision;
  }

  /**
   * Assembles every file, links from the entry file and loads the image.
   * Each broken file reports its first error, and linking runs only when all
   * files assemble. Returns whether it worked; on failure the machine keeps
   * the last loaded program.
   */
  assemble(): boolean {
    const { entry, files, revision } = this.project.getProject();
    const modules: Array<ObjectModule> = [];
    const errors: Array<Diagnostic> = [];
    for (const [file, text] of files) {
      const assembled = assembleModule(text, { file, entry: file === entry });
      if (assembled.ok) modules.push(assembled.module);
      else errors.push(diagnosticOf(assembled.error, file));
    }
    if (errors.length) {
      this.publish({ ...this.state, diagnostics: errors, revision });
      return false;
    }
    const linked = link(modules, { entry });
    if (!linked.ok) {
      this.publish({
        ...this.state,
        diagnostics: linked.diagnostics,
        revision,
      });
      return false;
    }
    const { image, diagnostics } = linked;
    this.breakpoints.capture();
    // Publish first, so machine subscribers see the new line map on load.
    this.publish({
      image,
      lines: createLineMaps(image),
      diagnostics,
      revision,
    });
    this.machine.load(image);
    this.breakpoints.relink();
    this.changes.rebase();
    return true;
  }

  /**
   * Replaces the project, e.g. with an example, and assembles it. A different
   * program starts without the old one's breakpoints and watchpoints, which
   * the machine keeps by address.
   */
  openProject(project: SavedProject): boolean {
    this.breakpoints.clear();
    for (const watch of this.machine.watchpoints.list())
      this.machine.watchpoints.remove(watch.id);
    this.project.replace(project);
    return this.assemble();
  }

  private publish(state: Assembly): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
