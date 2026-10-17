import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";

import { EditorTabs } from "./editor-tabs";
import { ProjectStore, localStorageBackend } from "./project-store";

function setup() {
  const project = new ProjectStore(
    {
      files: { "main.asm": "M", "trig.asm": "T" },
      folders: [],
      entry: "main.asm",
    },
    localStorageBackend(null),
  );
  let pc = 0x3000;
  const tabs = new EditorTabs(project, () => pc);
  return { project, tabs, setPc: (value: number) => (pc = value) };
}

describe("EditorTabs", () => {
  it("opens the entry file and shows files the user picks", () => {
    const { tabs } = setup();
    expect(tabs.getState()).toEqual({ open: ["main.asm"], chosen: null });

    tabs.show("trig.asm");
    expect(tabs.getState()).toEqual({
      open: ["main.asm", "trig.asm"],
      chosen: { file: "trig.asm", pc: 0x3000 },
    });

    tabs.close("trig.asm");
    expect(tabs.getState()).toEqual({ open: ["main.asm"], chosen: null });
  });

  it("closes the tab of a deleted file", () => {
    const { project, tabs } = setup();
    tabs.show("trig.asm");
    project.deleteFile("trig.asm");
    expect(tabs.getState().open).toEqual(["main.asm"]);
  });

  it("keeps a closed editor's state while the text is unchanged", () => {
    const { project, tabs } = setup();
    tabs.saveEditorState("trig.asm", EditorState.create({ doc: "T" }));
    expect(tabs.takeEditorState("trig.asm")?.doc.toString()).toBe("T");
    expect(tabs.takeEditorState("trig.asm")).toBeUndefined();

    tabs.saveEditorState("trig.asm", EditorState.create({ doc: "T" }));
    project.setText("trig.asm", "changed");
    expect(tabs.takeEditorState("trig.asm")).toBeUndefined();
  });

  it("reveals a line once, in the file it was asked for", () => {
    const { tabs } = setup();
    tabs.reveal("trig.asm", 7);
    expect(tabs.getState().open).toContain("trig.asm");
    expect(tabs.getState().chosen?.file).toBe("trig.asm");
    expect(tabs.takeReveal("main.asm")).toBeUndefined();
    expect(tabs.takeReveal("trig.asm")).toBe(7);
    expect(tabs.takeReveal("trig.asm")).toBeUndefined();
  });

  it("keeps tabs open on renamed files", () => {
    const { project, tabs } = setup();
    tabs.show("trig.asm");
    const moves = project.movesFor("trig.asm", "lib/trig.asm");
    tabs.expectRenames(moves);
    project.move("trig.asm", "lib/trig.asm");
    expect(tabs.getState().open).toEqual(["main.asm", "lib/trig.asm"]);
    expect(tabs.getState().chosen?.file).toBe("lib/trig.asm");
  });
});
