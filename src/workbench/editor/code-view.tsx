import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useCallback } from "react";

import { toggleBreakpointAtLine } from "../actions";
import type { SourceStore } from "../lib/source-store";
import { useWorkbench } from "../workbench-provider";
import type { Workbench } from "../workbench-provider";
import { asmLanguage } from "./asm-language";
import {
  assemblyDiagnostics,
  cursorLine,
  machineMarkers,
} from "./machine-markers";
import type { SourceKind } from "./machine-markers";
import { TAB_WIDTH, tabStops } from "./tab-stops";

const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--code-text)",
      backgroundColor: "transparent",
      fontSize: "13px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "22px",
      paddingBlock: "6px",
    },
    ".cm-content": { caretColor: "var(--phosphor)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--phosphor)" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
      { backgroundColor: "rgba(159, 211, 255, 0.2)" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "#566050",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 4px" },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.025)" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--silk)",
    },
    ".cm-pc-line": {
      background:
        "linear-gradient(90deg, rgba(255, 181, 71, 0.2), rgba(255, 181, 71, 0.05))",
      boxShadow: "inset 2px 0 var(--phosphor)",
    },
    ".cm-breakpoint-gutter": { width: "22px", cursor: "pointer" },
    ".cm-breakpoint-gutter .cm-gutterElement": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    ".cm-breakpoint-gutter .cm-gutterElement:hover::after": {
      content: '""',
      width: "9px",
      height: "9px",
      borderRadius: "50%",
      background: "var(--lamp-off)",
    },
    ".cm-bp": {
      width: "9px",
      height: "9px",
      borderRadius: "50%",
      background: "var(--lamp)",
      boxShadow: "0 0 5px var(--lamp)",
    },
    ".cm-bp-disabled": {
      background: "transparent",
      border: "1.5px solid var(--lamp)",
      boxShadow: "none",
    },
    ".cm-breakpoint-gutter .cm-gutterElement:has(.cm-bp):hover::after": {
      display: "none",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      border: "1px solid var(--edge-2)",
      borderRadius: "5px",
    },
    ".cm-diagnostic-error": { borderLeftColor: "var(--lamp)" },
    ".cm-panels": {
      backgroundColor: "var(--case-2)",
      color: "var(--silk)",
    },
  },
  { dark: true },
);

/** Keeps the editor and the shared buffer in step, in both directions. */
function sourceSync(store: SourceStore): Extension {
  return [
    EditorView.updateListener.of((update) => {
      if (update.docChanged) store.setText(update.state.doc.toString());
    }),
    ViewPlugin.define((view) => ({
      destroy: store.subscribe(() => {
        const { text } = store.getFile();
        if (text !== view.state.doc.toString())
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: text },
            selection: { anchor: 0 },
          });
      }),
    })),
  ];
}

function trackCursor(workbench: Workbench, kind: SourceKind): Extension {
  return EditorView.updateListener.of((update) => {
    if (update.selectionSet || (update.focusChanged && update.view.hasFocus))
      workbench.cursor = { kind, line: cursorLine(update.state) };
  });
}

function extensionsFor(
  workbench: Workbench,
  kind: SourceKind,
  label: string,
): Extension {
  const { assembly, machine } = workbench;
  const common = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    drawSelection(),
    highlightActiveLine(),
    asmLanguage(),
    EditorState.tabSize.of(TAB_WIDTH),
    theme,
    EditorView.contentAttributes.of({ "aria-label": label, translate: "no" }),
    trackCursor(workbench, kind),
  ];
  if (kind === "os")
    return [
      // First, so the breakpoint gutter sits left of the line numbers.
      machineMarkers({
        machine,
        kind,
        lines: () => workbench.os.lines,
        onToggleLine: (line) => toggleBreakpointAtLine(workbench, kind, line),
      }),
      ...common,
      EditorState.readOnly.of(true),
      keymap.of([...defaultKeymap, ...searchKeymap]),
    ];
  return [
    machineMarkers({
      machine,
      kind,
      lines: () => assembly.getState().lines,
      subscribeLines: assembly.subscribe,
      onToggleLine: (line) => toggleBreakpointAtLine(workbench, kind, line),
    }),
    ...common,
    history(),
    tabStops(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    sourceSync(workbench.source),
    assemblyDiagnostics(() => assembly.getState().error, assembly.subscribe),
  ];
}

/** A CodeMirror editor for the program, or a read-only view of the OS. */
export function CodeView({ kind, label }: { kind: SourceKind; label: string }) {
  const workbench = useWorkbench();
  // Memoized for correctness: a new ref callback would recreate the editor.
  const mount = useCallback(
    (parent: HTMLDivElement | null) => {
      if (!parent) return;
      const doc =
        kind === "os" ? workbench.os.source : workbench.source.getFile().text;
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc,
          extensions: extensionsFor(workbench, kind, label),
        }),
      });
      return () => view.destroy();
    },
    [workbench, kind, label],
  );
  return <div ref={mount} className="h-full min-h-0" />;
}
