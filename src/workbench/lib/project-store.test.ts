import { describe, expect, it } from "vite-plus/test";

import { ProjectStore, localStorageBackend } from "./project-store";
import type { SavedProject } from "./project-store";

export function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const FALLBACK: SavedProject = {
  files: { "hello.asm": "HELLO" },
  folders: [],
  entry: "hello.asm",
};

function store(storage: Storage | null) {
  return new ProjectStore(FALLBACK, localStorageBackend(storage));
}

describe("ProjectStore", () => {
  it("starts from the fallback and restores the saved project", () => {
    const storage = memoryStorage();
    const project = store(storage);
    expect(project.getProject()).toMatchObject({
      entry: "hello.asm",
      revision: 0,
    });

    project.writeFile("lib/trig.asm", "SIN");
    project.createFolder("empty/inner");
    project.setText("hello.asm", "HI");

    const restored = store(storage).getProject();
    expect(Object.fromEntries(restored.files)).toEqual({
      "hello.asm": "HI",
      "lib/trig.asm": "SIN",
    });
    expect([...restored.folders].sort()).toEqual([
      "empty",
      "empty/inner",
      "lib",
    ]);
    expect(restored.entry).toBe("hello.asm");
  });

  it("moves the old single buffer into main.asm as the entry file", () => {
    const storage = memoryStorage();
    storage.setItem(
      "lc3sim.source",
      JSON.stringify({ name: "mine.asm", text: "MY CODE" }),
    );

    const project = store(storage).getProject();
    expect(Object.fromEntries(project.files)).toEqual({
      "main.asm": "MY CODE",
    });
    expect(project.entry).toBe("main.asm");
    expect(storage.getItem("lc3sim.source")).toBeNull();
    expect(store(storage).getProject().files.get("main.asm")).toBe("MY CODE");
  });

  it("bumps the revision and notifies on changes only", () => {
    const project = store(memoryStorage());
    let notifications = 0;
    project.subscribe(() => notifications++);

    project.setText("hello.asm", "HELLO");
    expect(notifications).toBe(0);
    project.writeFile("a.asm", "A");
    project.setEntry("a.asm");
    project.deleteFile("hello.asm");
    expect(notifications).toBe(3);
    expect(project.getProject().revision).toBe(3);

    project.replace(FALLBACK);
    expect(project.getProject().revision).toBe(4);
  });

  it("refuses to delete the entry file", () => {
    const project = store(memoryStorage());
    expect(() => project.deleteFile("hello.asm")).toThrow();
  });

  it("ignores corrupt storage and keeps working without storage", () => {
    const storage = memoryStorage();
    storage.setItem("lc3sim.project", "{not json");
    expect(store(storage).getProject().entry).toBe("hello.asm");

    const full = memoryStorage();
    full.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    const project = store(full);
    project.setText("hello.asm", "STILL HERE");
    expect(project.getText("hello.asm")).toBe("STILL HERE");

    const none = store(null);
    none.setText("hello.asm", "MEMORY");
    expect(none.getText("hello.asm")).toBe("MEMORY");
  });

  it("moves files and whole folders, following the entry file", () => {
    const storage = memoryStorage();
    const project = store(storage);
    project.writeFile("lib/trig.asm", "SIN");
    project.writeFile("lib/deep/x.asm", "X");
    project.createFolder("lib/empty");

    expect(project.move("hello.asm", "app/hello.asm")).toEqual(
      new Map([["hello.asm", "app/hello.asm"]]),
    );
    expect(project.getProject().entry).toBe("app/hello.asm");

    expect(project.move("lib", "src")).toEqual(
      new Map([
        ["lib/trig.asm", "src/trig.asm"],
        ["lib/deep/x.asm", "src/deep/x.asm"],
      ]),
    );
    const moved = store(storage).getProject();
    expect([...moved.files.keys()].sort()).toEqual([
      "app/hello.asm",
      "src/deep/x.asm",
      "src/trig.asm",
    ]);
    expect([...moved.folders].sort()).toEqual([
      "app",
      "src",
      "src/deep",
      "src/empty",
    ]);
  });

  it("refuses moves that overwrite or go into themselves", () => {
    const project = store(memoryStorage());
    project.writeFile("lib/hello.asm", "OTHER");
    expect(() => project.move("hello.asm", "lib/hello.asm")).toThrow();
    expect(() => project.move("lib", "lib/inner")).toThrow();
    expect(project.getText("hello.asm")).toBe("HELLO");
  });

  it("deletes a folder with everything in it, but not the entry file", () => {
    const project = store(memoryStorage());
    project.writeFile("lib/a.asm", "A");
    project.writeFile("lib/sub/b.asm", "B");
    project.deleteFolder("lib");
    expect([...project.getProject().files.keys()]).toEqual(["hello.asm"]);
    expect([...project.getProject().folders]).toEqual([]);

    project.move("hello.asm", "app/hello.asm");
    expect(() => project.deleteFolder("app")).toThrow();
  });
});
