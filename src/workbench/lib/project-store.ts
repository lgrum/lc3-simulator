/** A project as it is saved: plain data, no revision. */
export type SavedProject = {
  /** Path -> text, e.g. `"lib/trig.asm"`. */
  files: Record<string, string>;
  /** Folder paths, so empty folders survive. */
  folders: Array<string>;
  /** Path of the entry file. */
  entry: string;
};

export type Project = {
  files: ReadonlyMap<string, string>;
  folders: ReadonlySet<string>;
  entry: string;
  /** Bumped on every change, to tell when the last build is stale. */
  revision: number;
};

/**
 * Where a project is read from and written to. Phase 1 has only the
 * localStorage backend.
 */
export type ProjectBackend = {
  load: () => SavedProject | undefined;
  save: (project: SavedProject) => void;
};

const PROJECT_KEY = "lc3sim.project";
/** The single editor buffer saved before projects existed. */
const LEGACY_SOURCE_KEY = "lc3sim.source";
/** The file the old buffer moves into. */
export const MIGRATED_ENTRY = "main.asm";

function isSavedProject(value: unknown): value is SavedProject {
  if (typeof value !== "object" || value === null) return false;
  const { files, folders, entry } = value as Record<string, unknown>;
  return (
    typeof files === "object" &&
    files !== null &&
    Object.values(files).every((text) => typeof text === "string") &&
    Array.isArray(folders) &&
    folders.every((folder) => typeof folder === "string") &&
    typeof entry === "string" &&
    entry in files
  );
}

function readJson(storage: Storage, key: string): unknown {
  try {
    return JSON.parse(storage.getItem(key) ?? "null");
  } catch {
    return undefined;
  }
}

/** localStorage, or null where it is missing or blocked. */
function browserStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Saves the project to localStorage. The first load moves the old single
 * buffer into main.asm, marked as the entry file. Storage can be full or
 * disabled; the project then lives in memory only.
 */
export function localStorageBackend(
  storage: Storage | null = browserStorage(),
): ProjectBackend {
  if (!storage) return { load: () => undefined, save: () => {} };
  return {
    load() {
      const saved = readJson(storage, PROJECT_KEY);
      if (isSavedProject(saved)) return saved;
      const legacy = readJson(storage, LEGACY_SOURCE_KEY) as {
        text?: unknown;
      } | null;
      if (typeof legacy?.text !== "string") return undefined;
      const project: SavedProject = {
        files: { [MIGRATED_ENTRY]: legacy.text },
        folders: [],
        entry: MIGRATED_ENTRY,
      };
      try {
        storage.setItem(PROJECT_KEY, JSON.stringify(project));
        storage.removeItem(LEGACY_SOURCE_KEY);
      } catch {
        // Keep the old buffer; the next load migrates it again.
      }
      return project;
    },
    save(project) {
      try {
        storage.setItem(PROJECT_KEY, JSON.stringify(project));
      } catch {
        // Storage can be full or disabled; the project still works in memory.
      }
    },
  };
}

function parentsOf(path: string): Array<string> {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/**
 * The files of the local project, kept outside React so typing does not
 * re-render the workbench. Saved through its backend on every change.
 * Compatible with useSyncExternalStore.
 */
export class ProjectStore {
  private project: Project;
  private readonly listeners = new Set<() => void>();

  constructor(
    fallback: SavedProject,
    private readonly backend: ProjectBackend = localStorageBackend(),
  ) {
    this.project = toProject(backend.load() ?? fallback, 0);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getProject = (): Project => this.project;

  getText(path: string): string | undefined {
    return this.project.files.get(path);
  }

  setText(path: string, text: string): void {
    if (this.project.files.get(path) === text) return;
    if (!this.project.files.has(path)) throw new Error(`No file ${path}`);
    this.change({ files: new Map(this.project.files).set(path, text) });
  }

  /** Adds a file, or replaces the text of an existing one. */
  writeFile(path: string, text: string): void {
    if (this.project.files.get(path) === text) return;
    const folders = new Set(this.project.folders);
    for (const folder of parentsOf(path)) folders.add(folder);
    this.change({
      files: new Map(this.project.files).set(path, text),
      folders,
    });
  }

  deleteFile(path: string): void {
    if (!this.project.files.has(path)) return;
    if (path === this.project.entry)
      throw new Error("The entry file can't be deleted");
    const files = new Map(this.project.files);
    files.delete(path);
    this.change({ files });
  }

  createFolder(path: string): void {
    if (this.project.folders.has(path)) return;
    const folders = new Set(this.project.folders);
    for (const folder of [...parentsOf(path), path]) folders.add(folder);
    this.change({ folders });
  }

  setEntry(path: string): void {
    if (path === this.project.entry) return;
    if (!this.project.files.has(path)) throw new Error(`No file ${path}`);
    this.change({ entry: path });
  }

  /** Replaces the whole project, e.g. with an example. */
  replace(project: SavedProject): void {
    this.change(toProject(project, 0));
  }

  toSaved(): SavedProject {
    return {
      files: Object.fromEntries(this.project.files),
      folders: [...this.project.folders],
      entry: this.project.entry,
    };
  }

  private change(changes: Partial<Omit<Project, "revision">>): void {
    this.project = {
      ...this.project,
      ...changes,
      revision: this.project.revision + 1,
    };
    this.backend.save(this.toSaved());
    for (const listener of this.listeners) listener();
  }
}

function toProject(saved: SavedProject, revision: number): Project {
  const folders = new Set(saved.folders);
  for (const path of Object.keys(saved.files))
    for (const folder of parentsOf(path)) folders.add(folder);
  return {
    files: new Map(Object.entries(saved.files)),
    folders,
    entry: saved.entry,
    revision,
  };
}
