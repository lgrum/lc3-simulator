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
  /** Local files and the read-only remote ones. */
  files: ReadonlyMap<string, string>;
  folders: ReadonlySet<string>;
  entry: string;
  /** Bumped on every local change, to tell when the last build is stale. */
  revision: number;
  /**
   * Read-only files fetched from the server for an admin's build, e.g.
   * `lib/g7_trig.asm`. Kept in memory for the session, never saved.
   */
  remote: ReadonlySet<string>;
};

/**
 * Where the local project is read from and written to: localStorage. Remote
 * files come from the server instead (setRemoteFiles) and are never saved.
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
  /** Folders that exist only because remote files are in them. */
  private remoteFolders: ReadonlySet<string> = new Set();

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

  /** Whether a file is a read-only remote one. */
  isRemote(path: string): boolean {
    return this.project.remote.has(path);
  }

  /** Whether a path is a remote file or a folder holding one. */
  holdsRemote(path: string): boolean {
    return [...this.project.remote].some(
      (file) => file === path || file.startsWith(path + "/"),
    );
  }

  private checkWritable(path: string): void {
    if (this.holdsRemote(path)) throw new Error(`${path} is read-only`);
  }

  /**
   * Replaces the read-only remote files. They don't count as a change to the
   * project: its revision stays, and nothing is saved.
   */
  setRemoteFiles(remote: ReadonlyMap<string, string>): void {
    const local = [...this.project.files].filter(
      ([path]) => !this.project.remote.has(path),
    );
    const files = new Map(local);
    const paths = new Set<string>();
    for (const [path, text] of remote)
      if (!files.has(path)) {
        files.set(path, text);
        paths.add(path);
      }
    const folders = new Set(
      [...this.project.folders].filter(
        (folder) => !this.remoteFolders.has(folder),
      ),
    );
    const remoteFolders = new Set<string>();
    for (const path of paths)
      for (const folder of parentsOf(path))
        if (!folders.has(folder)) {
          folders.add(folder);
          remoteFolders.add(folder);
        }
    this.remoteFolders = remoteFolders;
    this.project = { ...this.project, files, folders, remote: paths };
    for (const listener of this.listeners) listener();
  }

  setText(path: string, text: string): void {
    if (this.project.files.get(path) === text) return;
    if (!this.project.files.has(path)) throw new Error(`No file ${path}`);
    this.checkWritable(path);
    this.change({ files: new Map(this.project.files).set(path, text) });
  }

  /** Adds a file, or replaces the text of an existing one. */
  writeFile(path: string, text: string): void {
    if (this.project.files.get(path) === text) return;
    this.checkWritable(path);
    const folders = new Set(this.project.folders);
    for (const folder of parentsOf(path)) folders.add(folder);
    this.change({
      files: new Map(this.project.files).set(path, text),
      folders,
    });
  }

  deleteFile(path: string): void {
    if (!this.project.files.has(path)) return;
    this.checkWritable(path);
    if (path === this.project.entry)
      throw new Error("The entry file can't be deleted");
    const files = new Map(this.project.files);
    files.delete(path);
    this.change({ files });
  }

  /** The files and folders a move of `from` to `to` would rename. */
  movesFor(from: string, to: string): Map<string, string> {
    const moves = new Map<string, string>();
    const prefix = from + "/";
    for (const path of [...this.project.files.keys(), ...this.project.folders])
      if (path === from) moves.set(path, to);
      else if (path.startsWith(prefix))
        moves.set(path, to + "/" + path.slice(prefix.length));
    return moves;
  }

  /**
   * Renames or moves a file or a folder with everything in it. Returns the
   * new path of each moved file. Refuses to overwrite.
   */
  move(from: string, to: string): Map<string, string> {
    if (from === to) return new Map();
    this.checkWritable(from);
    if (to.startsWith(from + "/"))
      throw new Error(`Can't move ${from} into itself`);
    const moves = this.movesFor(from, to);
    const files = new Map<string, string>();
    const folders = new Set<string>();
    for (const [path, text] of this.project.files) {
      const target = moves.get(path) ?? path;
      if (files.has(target)) throw new Error(`${target} already exists`);
      files.set(target, text);
    }
    for (const folder of this.project.folders) {
      const target = moves.get(folder) ?? folder;
      if (this.project.files.has(target) && !moves.has(target))
        throw new Error(`${target} already exists`);
      folders.add(target);
    }
    for (const path of [...files.keys(), ...folders])
      for (const folder of parentsOf(path)) folders.add(folder);
    const fileMoves = new Map(
      [...moves].filter(([path]) => this.project.files.has(path)),
    );
    if (moves.size === 0) return fileMoves;
    this.change({
      files,
      folders,
      entry: moves.get(this.project.entry) ?? this.project.entry,
    });
    return fileMoves;
  }

  /** Deletes a folder with every file and folder in it. */
  deleteFolder(path: string): void {
    this.checkWritable(path);
    const inside = (other: string) =>
      other === path || other.startsWith(path + "/");
    if (inside(this.project.entry))
      throw new Error("The entry file can't be deleted");
    this.change({
      files: new Map([...this.project.files].filter(([file]) => !inside(file))),
      folders: new Set([...this.project.folders].filter((f) => !inside(f))),
    });
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
    this.checkWritable(path);
    this.change({ entry: path });
  }

  /** Replaces the whole project, e.g. with an example, dropping remote files. */
  replace(project: SavedProject): void {
    this.remoteFolders = new Set();
    this.change(toProject(project, 0));
  }

  /** The local project, without remote files or folders only they need. */
  toSaved(): SavedProject {
    const { files, folders, remote, entry } = this.project;
    return {
      files: Object.fromEntries(
        [...files].filter(([path]) => !remote.has(path)),
      ),
      folders: [...folders].filter((folder) => !this.remoteFolders.has(folder)),
      entry,
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
    remote: new Set(),
  };
}
