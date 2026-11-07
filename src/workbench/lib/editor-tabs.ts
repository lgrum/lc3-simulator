import type { EditorState } from "@codemirror/state";

import type { ProjectStore } from "./project-store";

/**
 * A published module shown read-only, outside the project: it isn't saved
 * or built. Its tab id starts with PREVIEW_PREFIX, which no path can.
 */
export type Preview = {
  /** The file name the tab shows, e.g. `g7_trig.asm`. */
  name: string;
  version: number;
  source: string;
};

export const PREVIEW_PREFIX = "preview:";

/** The tab id of the preview of the file `name`. */
export function previewId(name: string): string {
  return PREVIEW_PREFIX + name.toLowerCase();
}

export type EditorTabsState = {
  /** Project files and previews with an open tab, in tab order. */
  open: ReadonlyArray<string>;
  /** The open previews, by tab id. */
  previews: ReadonlyMap<string, Preview>;
  /**
   * The tab the user picked and the PC at that moment. The editor shows it
   * until the PC moves, then follows the PC.
   */
  chosen: { file: string; pc: number } | null;
};

/**
 * Which files have an editor tab, plus each closed file's last editor state,
 * so undo history survives closing and reopening a tab. Follows the project:
 * deleted files lose their tab. Compatible with useSyncExternalStore.
 */
export class EditorTabs {
  private state: EditorTabsState;
  private readonly listeners = new Set<() => void>();
  private readonly saved = new Map<string, EditorState>();
  /** A line to put the cursor on once its file's editor is showing. */
  private pendingReveal: { file: string; line: number } | null = null;
  /** Files about to be renamed, whose tabs follow them. */
  private renames = new Map<string, string>();

  constructor(
    private readonly project: ProjectStore,
    private readonly currentPc: () => number,
  ) {
    this.state = {
      open: [project.getProject().entry],
      previews: new Map(),
      chosen: null,
    };
    project.subscribe(() => this.prune());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): EditorTabsState => this.state;

  /** Opens a tab for `file` if it has none, without switching to it. */
  open(file: string): void {
    if (this.state.open.includes(file)) return;
    this.publish({ ...this.state, open: [...this.state.open, file] });
  }

  /** Opens `file` (or the OS file) and switches to its tab. */
  show(file: string): void {
    const open =
      this.state.open.includes(file) || this.project.getText(file) === undefined
        ? this.state.open
        : [...this.state.open, file];
    this.publish({
      ...this.state,
      open,
      chosen: { file, pc: this.currentPc() },
    });
  }

  /**
   * Opens a read-only preview of a published module, or updates its source,
   * and switches to it. One tab per module name.
   */
  preview(preview: Preview): void {
    const id = previewId(preview.name);
    const previews = new Map(this.state.previews).set(id, preview);
    const open = this.state.open.includes(id)
      ? this.state.open
      : [...this.state.open, id];
    this.publish({
      open,
      previews,
      chosen: { file: id, pc: this.currentPc() },
    });
  }

  /** Shows `file` with the cursor on `line`, e.g. for a problem. */
  reveal(file: string, line: number): void {
    this.pendingReveal = { file, line };
    this.show(file);
  }

  /** The line waiting to be revealed in `file`, once; editors call this. */
  takeReveal(file: string): number | undefined {
    if (this.pendingReveal?.file !== file) return undefined;
    const { line } = this.pendingReveal;
    this.pendingReveal = null;
    return line;
  }

  close(file: string): void {
    if (!this.state.open.includes(file)) return;
    const chosen = this.state.chosen?.file === file ? null : this.state.chosen;
    const previews = new Map(this.state.previews);
    previews.delete(file);
    this.publish({
      open: this.state.open.filter((f) => f !== file),
      previews,
      chosen,
    });
  }

  /** Keeps a closed editor's state for when its tab opens again. */
  saveEditorState(file: string, state: EditorState): void {
    this.saved.set(file, state);
  }

  /** The kept state of `file`, if it still matches the file's text. */
  takeEditorState(file: string): EditorState | undefined {
    const state = this.saved.get(file);
    this.saved.delete(file);
    return state && state.doc.toString() === this.project.getText(file)
      ? state
      : undefined;
  }

  /** Keeps the tabs of files the project is about to rename open. */
  expectRenames(moves: ReadonlyMap<string, string>): void {
    this.renames = new Map(moves);
  }

  /** Forgets kept editor states, e.g. when another project is opened. */
  forgetEditorStates(): void {
    this.saved.clear();
  }

  private prune(): void {
    const { files, entry } = this.project.getProject();
    const renames = this.renames;
    this.renames = new Map();
    const renamed = (file: string) => renames.get(file) ?? file;
    for (const file of this.saved.keys())
      if (!files.has(file)) this.saved.delete(file);
    const open = this.state.open
      .map(renamed)
      .filter((file) => files.has(file) || this.state.previews.has(file));
    const chosen = this.state.chosen && {
      ...this.state.chosen,
      file: renamed(this.state.chosen.file),
    };
    if (
      open.length === this.state.open.length &&
      open.every((file, i) => file === this.state.open[i])
    )
      return;
    if (open.length === 0) open.push(entry);
    this.publish({
      open,
      previews: this.state.previews,
      chosen: chosen && open.includes(chosen.file) ? chosen : null,
    });
  }

  private publish(state: EditorTabsState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
