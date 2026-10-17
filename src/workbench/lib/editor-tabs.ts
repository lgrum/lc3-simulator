import type { EditorState } from "@codemirror/state";

import type { ProjectStore } from "./project-store";

export type EditorTabsState = {
  /** Project files with an open tab, in tab order. */
  open: ReadonlyArray<string>;
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

  constructor(
    private readonly project: ProjectStore,
    private readonly currentPc: () => number,
  ) {
    this.state = { open: [project.getProject().entry], chosen: null };
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
    this.publish({ open, chosen: { file, pc: this.currentPc() } });
  }

  close(file: string): void {
    if (!this.state.open.includes(file)) return;
    const chosen = this.state.chosen?.file === file ? null : this.state.chosen;
    this.publish({ open: this.state.open.filter((f) => f !== file), chosen });
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

  /** Forgets kept editor states, e.g. when another project is opened. */
  forgetEditorStates(): void {
    this.saved.clear();
  }

  private prune(): void {
    const { files, entry } = this.project.getProject();
    for (const file of this.saved.keys())
      if (!files.has(file)) this.saved.delete(file);
    const open = this.state.open.filter((file) => files.has(file));
    if (open.length === this.state.open.length) return;
    if (open.length === 0) open.push(entry);
    const chosen =
      this.state.chosen && open.includes(this.state.chosen.file)
        ? this.state.chosen
        : null;
    this.publish({ open, chosen });
  }

  private publish(state: EditorTabsState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
