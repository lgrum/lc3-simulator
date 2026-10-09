import { indentLess, indentMore } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorSelection, countColumn } from "@codemirror/state";
import type { Extension, StateCommand } from "@codemirror/state";
import { keymap } from "@codemirror/view";

/** Assembly is laid out in columns: label, opcode, operands, comment. */
export const TAB_WIDTH = 8;

/**
 * Pads each cursor with spaces to the next tab stop, as in a plain text
 * editor. With a selection, indents the selected lines instead.
 */
export const insertTabStop: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.some((range) => !range.empty))
    return indentMore({ state, dispatch });
  dispatch(
    state.update(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.head);
        const column = countColumn(
          line.text.slice(0, range.head - line.from),
          state.tabSize,
        );
        const insert = " ".repeat(state.tabSize - (column % state.tabSize));
        return {
          changes: { from: range.head, insert },
          range: EditorSelection.cursor(range.head + insert.length),
        };
      }),
      { scrollIntoView: true, userEvent: "input" },
    ),
  );
  return true;
};

/** Tab stops every `TAB_WIDTH` columns; Shift+Tab outdents. */
export function tabStops(): Extension {
  return [
    indentUnit.of(" ".repeat(TAB_WIDTH)),
    keymap.of([{ key: "Tab", run: insertTabStop, shift: indentLess }]),
  ];
}
