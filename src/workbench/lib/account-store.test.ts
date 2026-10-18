import { describe, expect, it, vi } from "vite-plus/test";

import type { Viewer } from "@/server/access";

import { AccountStore } from "./account-store";
import type { AccountBackend } from "./account-store";

const group7: Viewer = { kind: "group", userId: "u7", group: 7, name: "G7" };

function backend(overrides: Partial<AccountBackend> = {}): AccountBackend {
  return {
    fetchViewer: vi.fn(() => Promise.resolve(null)),
    signIn: vi.fn(() => Promise.resolve(null)),
    signOut: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("AccountStore", () => {
  it("is unknown until the first refresh", async () => {
    const store = new AccountStore(
      backend({ fetchViewer: () => Promise.resolve(group7) }),
    );
    expect(store.getState()).toMatchObject({ viewer: null, known: false });
    await store.refresh();
    expect(store.getState()).toMatchObject({ viewer: group7, known: true });
  });

  it("treats an unreachable server as nobody logged in", async () => {
    const store = new AccountStore(
      backend({
        fetchViewer: () => Promise.reject(new Error("offline")),
      }),
    );
    await store.refresh();
    expect(store.getState()).toMatchObject({ viewer: null, known: true });
  });

  it("reads the session again after logging in", async () => {
    let viewer: Viewer | null = null;
    const fake = backend({
      fetchViewer: () => Promise.resolve(viewer),
      signIn: () => {
        viewer = group7;
        return Promise.resolve(null);
      },
    });
    const store = new AccountStore(fake);
    expect(await store.signIn(" 7 ", "secret")).toBeNull();
    expect(store.getState().viewer).toEqual(group7);
  });

  it("trims the username", async () => {
    const fake = backend();
    await new AccountStore(fake).signIn(" 7 ", "pw");
    expect(fake.signIn).toHaveBeenCalledWith("7", "pw");
  });

  it("reports why logging in failed", async () => {
    const store = new AccountStore(
      backend({ signIn: () => Promise.resolve("rate-limited" as const) }),
    );
    expect(await store.signIn("7", "pw")).toBe("rate-limited");
    const offline = new AccountStore(
      backend({
        signIn: () => Promise.reject(new Error("offline")),
      }),
    );
    expect(await offline.signIn("7", "pw")).toBe("unreachable");
  });

  it("forgets the viewer after logging out", async () => {
    let viewer: Viewer | null = group7;
    const store = new AccountStore(
      backend({
        fetchViewer: () => Promise.resolve(viewer),
        signOut: () => {
          viewer = null;
          return Promise.resolve();
        },
      }),
    );
    await store.refresh();
    await store.signOut();
    expect(store.getState().viewer).toBeNull();
  });
});
