export type SourceFile = { name: string; text: string };

const STORAGE_KEY = "lc3sim.source";

function isSourceFile(value: unknown): value is SourceFile {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SourceFile).name === "string" &&
    typeof (value as SourceFile).text === "string"
  );
}

/**
 * The editor buffer, kept outside React so typing does not re-render the
 * workbench. Saved to localStorage on every change. Compatible with
 * useSyncExternalStore.
 */
export class SourceStore {
  private file: SourceFile;
  private readonly listeners = new Set<() => void>();

  constructor(
    fallback: SourceFile,
    private readonly storage: Storage | undefined = globalThis.localStorage,
  ) {
    this.file = this.restore() ?? fallback;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getFile = (): SourceFile => this.file;

  setText(text: string): void {
    this.replace({ ...this.file, text });
  }

  replace(file: SourceFile): void {
    if (file.name === this.file.name && file.text === this.file.text) return;
    this.file = file;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(file));
    } catch {
      // Storage can be full or disabled; the buffer still works in memory.
    }
    for (const listener of this.listeners) listener();
  }

  private restore(): SourceFile | undefined {
    try {
      const value: unknown = JSON.parse(
        this.storage?.getItem(STORAGE_KEY) ?? "null",
      );
      return isSourceFile(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
}
