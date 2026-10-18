import { assembleModule, diagnosticOf } from "@/lib/assembler/assemble-source";
import { link, moduleName } from "@/lib/assembler/linker";
import type {
  Diagnostic,
  LinkedImage,
  ObjectModule,
} from "@/lib/assembler/types";
import type { MachineController } from "@/lib/simulator/controller";

import {
  libraryPath,
  localModuleIdentity,
  overrideNote,
  walkLinkSet,
} from "./admin-build";
import type { BuildLibrary, FetchedModule } from "./admin-build";
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
  /**
   * Admin builds only: imports nothing provides become RET stubs, so main
   * runs before every group has published.
   */
  stubMissing: boolean;
};

/** How many rounds of fetching a build may take: one per level of imports. */
const MAX_FETCH_ROUNDS = 16;

/** The modules of a build, or the first error of each broken file. */
type Collected = {
  modules: Array<ObjectModule>;
  errors: Array<Diagnostic>;
  /** Info notes for local files used instead of published modules. */
  notes: Array<Diagnostic>;
};

const INITIAL: Assembly = {
  image: null,
  lines: new Map(),
  diagnostics: [],
  revision: null,
  stubMissing: false,
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
  /** Where an admin's build fetches published modules; null otherwise. */
  private library: BuildLibrary | null = null;
  /** The fetched modules, by their path in lib/. */
  private fetched = new Map<string, FetchedModule>();
  /** Problems reaching the server in the last build, shown with the rest. */
  private fetchProblems: Array<Diagnostic> = [];
  /** Counts builds, so a slow one can't overwrite a newer one. */
  private builds = 0;

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
   * Makes this an admin's build, which fetches the modules the link set needs
   * from the server, or a local one (null). A local build drops lib/.
   */
  setLibrary(library: BuildLibrary | null): void {
    if (library?.namespace === this.library?.namespace) return;
    this.library = library;
    this.fetched = new Map();
    this.fetchProblems = [];
    this.project.setRemoteFiles(new Map());
  }

  /** Turns stubs for missing modules on or off and builds again. */
  setStubMissing(on: boolean): Promise<boolean> {
    this.publish({ ...this.state, stubMissing: on });
    return this.build();
  }

  /** Assembles every local file, and the given fetched modules. */
  private collect(fetched: ReadonlyMap<string, FetchedModule>): Collected {
    const { entry, files } = this.project.getProject();
    const admin = this.library?.namespace;
    const modules: Array<ObjectModule> = [];
    const errors: Array<Diagnostic> = [];
    const notes: Array<Diagnostic> = [];
    const add = (
      file: string,
      text: string,
      identity: { namespace: string; name: string },
    ) => {
      const assembled = assembleModule(text, {
        file,
        entry: file === entry,
        ...identity,
      });
      if (assembled.ok) modules.push(assembled.module);
      else errors.push(diagnosticOf(assembled.error, file));
    };
    for (const [file, text] of files) {
      if (this.project.isRemote(file)) continue;
      add(
        file,
        text,
        admin
          ? localModuleIdentity(file, admin, file === entry)
          : { namespace: "local", name: moduleName(file) },
      );
    }
    if (admin)
      for (const [path, module] of fetched) {
        // A local file with the same name wins: it may be a fix to test.
        const local = modules.find(
          (other) =>
            other.namespace === module.namespace &&
            other.name.toLowerCase() === module.module.toLowerCase(),
        );
        if (local) {
          notes.push({
            file: local.file,
            position: null,
            severity: "info",
            text: overrideNote(local.file, module, admin),
          });
          continue;
        }
        add(path, module.source, {
          namespace: module.namespace,
          name: module.module,
        });
      }
    return { modules, errors, notes };
  }

  /**
   * Builds the program. For an admin, first fetches the latest published
   * version of every module the link set needs that isn't local, into a
   * read-only lib/ folder; the build otherwise works like assemble().
   */
  async build(): Promise<boolean> {
    const library = this.library;
    if (!library) return this.assemble();
    const run = ++this.builds;
    const { entry } = this.project.getProject();
    const fetched = new Map<string, FetchedModule>();
    const asked = new Set<string>();
    const problems: Array<Diagnostic> = [];
    for (let round = 0; round < MAX_FETCH_ROUNDS; round++) {
      const { modules, errors } = this.collect(fetched);
      if (errors.length) break;
      const { reached, missing } = walkLinkSet(
        modules,
        entry,
        library.namespace,
      );
      // Local modules that may replace published ones, for the notes.
      const local = reached
        .filter((module) => module.file !== entry && !fetched.has(module.file))
        .map((module) => moduleName(module.file).toLowerCase());
      const wanted = [...new Set([...missing, ...local])].filter(
        (name) => !asked.has(name),
      );
      if (wanted.length === 0) break;
      for (const name of wanted) asked.add(name);
      try {
        for (const module of await library.fetch(wanted))
          fetched.set(libraryPath(module), module);
      } catch (error) {
        problems.push({
          file: null,
          position: null,
          severity: "error",
          text: `Couldn't fetch published modules: ${error instanceof Error ? error.message : String(error)}`,
        });
        break;
      }
      // A newer build started meanwhile; it will publish its own result.
      if (run !== this.builds) return false;
    }
    if (run !== this.builds) return false;
    this.fetched = fetched;
    this.fetchProblems = problems;
    this.project.setRemoteFiles(
      new Map([...fetched].map(([path, module]) => [path, module.source])),
    );
    return this.assemble();
  }

  /**
   * Assembles every file, links from the entry file and loads the image.
   * Each broken file reports its first error, and linking runs only when all
   * files assemble. Returns whether it worked; on failure the machine keeps
   * the last loaded program. An admin's build uses the modules the last
   * build() fetched.
   */
  assemble(): boolean {
    const { entry, revision } = this.project.getProject();
    const fetched = new Map(
      [...this.fetched].filter(([path]) => this.project.isRemote(path)),
    );
    const { modules, errors, notes } = this.collect(fetched);
    const before = [...this.fetchProblems, ...notes];
    if (errors.length) {
      this.publish({
        ...this.state,
        diagnostics: [...before, ...errors],
        revision,
      });
      return false;
    }
    const linked = link(modules, {
      entry,
      stubMissing: this.library !== null && this.state.stubMissing,
    });
    if (!linked.ok) {
      this.publish({
        ...this.state,
        diagnostics: [...before, ...linked.diagnostics],
        revision,
      });
      return false;
    }
    const { image } = linked;
    const diagnostics = [...before, ...linked.diagnostics];
    this.breakpoints.capture();
    // Publish first, so machine subscribers see the new line map on load.
    this.publish({
      ...this.state,
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
