import { describe, expect, it } from "vite-plus/test";

import { createMachineController } from "@/lib/simulator/controller";

import { localModuleIdentity, overrideNote, visibleName } from "./admin-build";
import type { BuildLibrary, FetchedModule } from "./admin-build";
import { AssemblyStore } from "./assembly-store";
import { ChangeTracker } from "./change-tracker";
import { ProjectStore, localStorageBackend } from "./project-store";

const ADMIN = "admin:a1";

const MAIN = `        .ORIG x3000
        .EXTERNAL G7_TRIG-SIN
        .EXTERNAL G3_TRIG-SIN
        LD R5, P7
        JSRR R5
        LD R5, P3
        JSRR R5
        HALT
P7      .FILL G7_TRIG-SIN
P3      .FILL G3_TRIG-SIN
        .END
`;

/** Published modules on a fake server, by the admin's names. */
const PUBLISHED: Record<string, FetchedModule> = {
  g7_trig: {
    name: "g7_trig",
    namespace: "group:7",
    module: "trig",
    version: 4,
    source: `        .EXTERNAL HELPERS-TWICE
SIN     ST R7, SAVE
        LD R5, PTR
        JSRR R5
        LD R7, SAVE
        RET
PTR     .FILL HELPERS-TWICE
SAVE    .BLKW #1
`,
  },
  g7_helpers: {
    name: "g7_helpers",
    namespace: "group:7",
    module: "helpers",
    version: 1,
    source: "TWICE   ADD R0, R0, R0\n        RET\n",
  },
  g3_trig: {
    name: "g3_trig",
    namespace: "group:3",
    module: "trig",
    version: 2,
    source: "SIN     ADD R0, R0, #1\n        RET\n",
  },
};

function setup(files: Record<string, string>) {
  const machine = createMachineController();
  const project = new ProjectStore(
    { files, folders: [], entry: "main.asm" },
    localStorageBackend(null),
  );
  const store = new AssemblyStore(machine, new ChangeTracker(machine), project);
  const asked: Array<Array<string>> = [];
  const library: BuildLibrary = {
    namespace: ADMIN,
    fetch: (names) => {
      asked.push(names);
      return Promise.resolve(
        names.flatMap((name) => PUBLISHED[name.toLowerCase()] ?? []),
      );
    },
  };
  store.setLibrary(library);
  return { machine, project, store, asked };
}

describe("names in an admin's build", () => {
  it("treats local g<n>_ files as copies of group modules", () => {
    expect(localModuleIdentity("work/g7_trig.asm", ADMIN, false)).toEqual({
      namespace: "group:7",
      name: "trig",
    });
    expect(localModuleIdentity("calc.asm", ADMIN, false)).toEqual({
      namespace: ADMIN,
      name: "calc",
    });
    expect(localModuleIdentity("main.asm", ADMIN, true)).toEqual({
      namespace: ADMIN,
      name: "main",
    });
  });

  it("names visible modules as the admin does", () => {
    expect(visibleName("group:7", "trig", ADMIN)).toBe("g7_trig");
    expect(visibleName(ADMIN, "calc", ADMIN)).toBe("calc");
    expect(visibleName("admin:a2", "calc", ADMIN)).toBeNull();
  });

  it("writes override notes", () => {
    expect(overrideNote("work/g7_trig.asm", PUBLISHED.g7_trig, ADMIN)).toBe(
      "Using local g7_trig.asm instead of group 7's published v4",
    );
  });
});

describe("AssemblyStore.build for admins", () => {
  it("fetches what the link set needs, level by level, into read-only lib/", async () => {
    const { machine, project, store, asked } = setup({ "main.asm": MAIN });
    expect(await store.build()).toBe(true);
    expect(asked).toEqual([["g7_trig", "g3_trig"], ["g7_helpers"]]);
    const { remote, files } = project.getProject();
    expect([...remote].sort()).toEqual([
      "lib/g3_trig.asm",
      "lib/g7_helpers.asm",
      "lib/g7_trig.asm",
    ]);
    expect(files.get("lib/g7_trig.asm")).toBe(PUBLISHED.g7_trig.source);
    // lib/ isn't part of the saved project, and fetching isn't an edit.
    expect(Object.keys(project.toSaved().files)).toEqual(["main.asm"]);
    expect(store.isStale()).toBe(false);

    // Source-level debugging reaches into each group's module.
    const { lines } = store.getState();
    expect(lines.get("lib/g7_trig.asm")?.addressOf.get(2)).toBeDefined();
    expect(lines.get("lib/g3_trig.asm")?.addressOf.get(1)).toBeDefined();
    machine.writeRegister("R0", 5);
    for (let i = 0; i < 200 && machine.getSnapshot().pc !== 0x3004; i++)
      machine.stepInto();
    expect(machine.getSnapshot().regs[0]).toBe(11);
  });

  it("lets a local g<n>_ file replace the published module, with a note", async () => {
    const { project, store } = setup({
      "main.asm": MAIN,
      "work/g7_trig.asm": PUBLISHED.g7_trig.source.replace(
        "ST R7, SAVE",
        "ST R7, SAVE ; my fix",
      ),
    });
    expect(await store.build()).toBe(true);
    const { image, diagnostics } = store.getState();
    expect(image?.map.map((entry) => entry.file)).toContain("work/g7_trig.asm");
    expect(image?.map.map((entry) => entry.file)).not.toContain(
      "lib/g7_trig.asm",
    );
    expect(diagnostics).toContainEqual({
      file: "work/g7_trig.asm",
      position: null,
      severity: "info",
      text: "Using local g7_trig.asm instead of group 7's published v4",
    });
    // The local copy's own imports still resolve in group 7's namespace.
    expect(project.getProject().remote.has("lib/g7_helpers.asm")).toBe(true);
  });

  it("reports modules nobody can see as missing", async () => {
    const { store } = setup({
      "main.asm":
        ".EXTERNAL CALC-RUN\nLD R5, P\nJSRR R5\nHALT\nP .FILL CALC-RUN\n",
    });
    expect(await store.build()).toBe(false);
    expect(store.getState().diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        text: "No module named CALC in this program",
      }),
    );
  });

  it("reports a server it can't reach", async () => {
    const { store } = setup({ "main.asm": MAIN });
    store.setLibrary({
      namespace: "admin:a2",
      fetch: () => Promise.reject(new Error("offline")),
    });
    expect(await store.build()).toBe(false);
    expect(store.getState().diagnostics[0].text).toMatch(
      /Couldn't fetch published modules: offline/,
    );
  });

  it("stubs modules nobody has published when asked to", async () => {
    const { store } = setup({
      "main.asm": MAIN.replaceAll("G3_TRIG", "G9_TRIG"),
    });
    expect(await store.build()).toBe(false);
    expect(await store.setStubMissing(true)).toBe(true);
    expect(store.getState().diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        text: expect.stringMatching(/^G9_TRIG-SIN is missing/),
      }),
    );
    expect(await store.setStubMissing(false)).toBe(false);
  });

  it("never stubs outside admin builds", () => {
    const { store } = setup({ "main.asm": MAIN });
    store.setLibrary(null);
    void store.setStubMissing(true);
    expect(store.getState().image).toBeNull();
  });

  it("drops lib/ when the admin logs out", async () => {
    const { project, store } = setup({ "main.asm": MAIN });
    await store.build();
    store.setLibrary(null);
    expect(project.getProject().remote.size).toBe(0);
  });
});
