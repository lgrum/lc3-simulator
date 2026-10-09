import { EditorSelection, EditorState } from "@codemirror/state";
import type { Transaction } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";

import { TAB_WIDTH, insertTabStop, tabStops } from "./tab-stops";

function pressTab(state: EditorState): EditorState {
  let next = state;
  insertTabStop({
    state,
    dispatch: (tr: Transaction) => {
      next = tr.state;
    },
  });
  return next;
}

function stateAt(doc: string, cursor: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [tabStops(), EditorState.tabSize.of(TAB_WIDTH)],
  });
}

describe("insertTabStop", () => {
  it("pads at the cursor to the next tab stop, not at the line start", () => {
    const state = pressTab(stateAt("        HALT", 12));
    expect(state.doc.toString()).toBe("        HALT    ");
    expect(state.selection.main.head).toBe(16);
  });
  it("moves a full tab width from a tab stop", () => {
    expect(pressTab(stateAt("LOOP    ", 8)).doc.toString()).toBe(
      "LOOP            ",
    );
  });
  it("counts tab characters as reaching the next stop", () => {
    expect(pressTab(stateAt("\tADD", 4)).doc.toString()).toBe("\tADD     ");
  });
  it("indents the selected lines when there is a selection", () => {
    const state = pressTab(
      EditorState.create({
        doc: "ADD\nAND",
        selection: EditorSelection.range(0, 7),
        extensions: tabStops(),
      }),
    );
    expect(state.doc.toString()).toBe("        ADD\n        AND");
  });
  it("does nothing in a read-only editor", () => {
    const state = EditorState.create({
      doc: "HALT",
      extensions: [tabStops(), EditorState.readOnly.of(true)],
    });
    expect(insertTabStop({ state, dispatch: () => {} })).toBe(false);
  });
});
