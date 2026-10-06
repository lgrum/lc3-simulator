import { describe, expect, it } from "vite-plus/test";

import { SourceStore } from "./source-store";

function memoryStorage(): Storage {
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

describe("SourceStore", () => {
  it("starts from the fallback and restores the saved buffer", () => {
    const storage = memoryStorage();
    const store = new SourceStore({ name: "a.asm", text: "A" }, storage);
    expect(store.getFile()).toEqual({ name: "a.asm", text: "A" });

    store.setText("B");
    const restored = new SourceStore({ name: "x.asm", text: "X" }, storage);
    expect(restored.getFile()).toEqual({ name: "a.asm", text: "B" });
  });

  it("notifies on changes only and ignores corrupt storage", () => {
    const storage = memoryStorage();
    storage.setItem("lc3sim.source", "{not json");
    const store = new SourceStore({ name: "a.asm", text: "A" }, storage);
    expect(store.getFile().text).toBe("A");

    let notifications = 0;
    store.subscribe(() => notifications++);
    store.setText("A");
    store.replace({ name: "b.asm", text: "B" });
    expect(notifications).toBe(1);
  });
});
