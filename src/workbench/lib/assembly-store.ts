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
} from "./library-build";
import type { BuildLibrary, FetchedModule } from "./library-build";
import { BreakpointLines } from "./breakpoints";
import type { ChangeTracker } from "./change-tracker";
import { createLineMaps } from "./line-map";
import type { LineMap } from "./line-map";
import type { ProjectStore, SavedProject } from "./project-store";

/** How far a signed-in build has got. */
export type BuildProgress = {
  /** Fetching published modules, then assembling and linking everything. */
  phase: "fetching" | "assembling";
  /**
   * Modules asked from the server so far, and how many have come back. The
   * total grows as each level of imports shows what the next one needs.
   */
  done: number;
  total: number;
};

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
   * Signed-in builds only: imports nothing provides become RET stubs, so main
   * runs before every group has published.
   */
  stubMissing: boolean;
  /** The build in progress, or null. Only signed-in builds take a while. */
  building: BuildProgress | null;
};

/** How many rounds of fetching a build may take: one per level of imports. */
const MAX_FETCH_ROUNDS = 16;
/** Modules asked per request, and requests in flight at once. */
const FETCH_BATCH = 4;
const FETCH_PARALLEL = 4;

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
  building: null,
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
  /** Where a signed-in build fetches published modules; null otherwise. */
  private library: BuildLibrary | null = null;
  /** The fetched modules, by their path in lib/. */
  private fetched = new Map<string, FetchedModule>();
  /** Problems reaching the server in the last build, shown with the rest. */
  private fetchProblems: Array<Diagnostic> = [];
  /** Counts builds, so a slow one can't overwrite a newer one. */
  private builds = 0;
  /** The signed-in build in progress, which later calls join. */
  private running: Promise<boolean> | null = null;

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
   * Makes this a signed-in build, which fetches the modules the link set needs
   * from the server, or a local one (null). A local build drops lib/.
   */
  setLibrary(library: BuildLibrary | null): void {
    if (library?.namespace === this.library?.namespace) return;
    this.library = library;
    this.fetched = new Map();
    this.fetchProblems = [];
    // A build for the old account stops at its next step.
    this.builds++;
    this.running = null;
    if (this.state.building) this.publish({ ...this.state, building: null });
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
    const own = this.library?.namespace;
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
        own
          ? localModuleIdentity(file, own, file === entry)
          : { namespace: "local", name: moduleName(file) },
      );
    }
    if (own)
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
            text: overrideNote(local.file, module, own),
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
   * Builds the program. When signed in, first fetches the latest published
   * version of every module the link set needs that isn't local, into a
   * read-only lib/ folder; the build otherwise works like assemble(). A call
   * while a signed-in build runs joins it instead of starting another.
   */
  build(): Promise<boolean> {
    const library = this.library;
    if (!library) return Promise.resolve(this.assemble());
    if (this.running) return this.running;
    const running = this.fetchAndAssemble(library, ++this.builds).finally(
      () => {
        if (this.running === running) this.running = null;
      },
    );
    this.running = running;
    return running;
  }

  /** Fetches the modules the link set needs, level by level, then builds. */
  private async fetchAndAssemble(
    library: BuildLibrary,
    run: number,
  ): Promise<boolean> {
    const { entry } = this.project.getProject();
    const fetched = new Map<string, FetchedModule>();
    const asked = new Set<string>();
    const problems: Array<Diagnostic> = [];
    let done = 0;
    const progress = (phase: BuildProgress["phase"]) => {
      if (run === this.builds)
        this.publish({
          ...this.state,
          building: { phase, done, total: asked.size },
        });
    };
    progress("fetching");
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
      progress("fetching");
      try {
        await fetchInBatches(library, wanted, (found, count) => {
          for (const module of found) fetched.set(libraryPath(module), module);
          done += count;
          progress("fetching");
        });
      } catch (error) {
        problems.push({
          file: null,
          position: null,
          severity: "error",
          text: `Couldn't fetch published modules: ${error instanceof Error ? error.message : String(error)}`,
        });
        break;
      }
      // The account changed meanwhile; this build's result is stale.
      if (run !== this.builds) return false;
    }
    if (run !== this.builds) return false;
    done = asked.size;
    progress("assembling");
    // Lets the page draw the last step before assembling holds the thread.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (run !== this.builds) return false;
    this.fetched = fetched;
    this.fetchProblems = problems;
    this.project.setRemoteFiles(
      new Map([...fetched].map(([path, module]) => [path, module.source])),
    );
    const ok = this.assemble();
    this.publish({ ...this.state, building: null });
    return ok;
  }

  /**
   * Assembles every file, links from the entry file and loads the image.
   * Each broken file reports its first error, and linking runs only when all
   * files assemble. Returns whether it worked; on failure the machine keeps
   * the last loaded program. A signed-in build uses the modules the last
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

/**
 * Fetches `names` in batches of FETCH_BATCH, FETCH_PARALLEL requests at a
 * time, so each request stays small and progress shows as batches return.
 */
async function fetchInBatches(
  library: BuildLibrary,
  names: ReadonlyArray<string>,
  /** Called per batch with the modules found and how many were asked. */
  onBatch: (found: Array<FetchedModule>, asked: number) => void,
): Promise<void> {
  const batches: Array<Array<string>> = [];
  for (let i = 0; i < names.length; i += FETCH_BATCH)
    batches.push(names.slice(i, i + FETCH_BATCH));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      onBatch(await library.fetch(batch), batch.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FETCH_PARALLEL, batches.length) }, worker),
  );
}
