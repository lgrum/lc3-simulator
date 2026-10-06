import { RangeSet, StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Extension, Text } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
} from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { linter, setDiagnostics } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";

import type { AssemblyError } from "@/lib/assembler/assemble-source";
import type { MachineController } from "@/lib/simulator/controller";

import { tracksPc } from "../actions";
import type { LineMap } from "../lib/line-map";

export type SourceKind = "program" | "os";

type Markers = {
  pcLine: number | null;
  breakpoints: ReadonlyArray<{ line: number; enabled: boolean }>;
};

type MarkerOptions = {
  machine: MachineController;
  kind: SourceKind;
  /** The current line map for this source, or null before it assembles. */
  lines: () => LineMap | null;
  /** Subscribes to changes of the line map, e.g. a new assembly. */
  subscribeLines?: (listener: () => void) => () => void;
  onToggleLine: (line: number) => void;
};

class BreakpointMarker extends GutterMarker {
  constructor(readonly enabled: boolean) {
    super();
  }
  override eq(other: BreakpointMarker) {
    return other.enabled === this.enabled;
  }
  override toDOM() {
    const dot = document.createElement("span");
    dot.className = this.enabled ? "cm-bp" : "cm-bp cm-bp-disabled";
    return dot;
  }
}

const ENABLED = new BreakpointMarker(true);
const DISABLED = new BreakpointMarker(false);
const pcLineDecoration = Decoration.line({ class: "cm-pc-line" });

const setMarkers = StateEffect.define<Markers>();

type MarkerState = {
  markers: Markers;
  pc: DecorationSet;
  breakpoints: RangeSet<GutterMarker>;
};

function lineStart(doc: Text, line: number): number | null {
  return line >= 1 && line <= doc.lines ? doc.line(line).from : null;
}

function build(doc: Text, markers: Markers): MarkerState {
  const pcFrom =
    markers.pcLine === null ? null : lineStart(doc, markers.pcLine);
  const breakpoints = markers.breakpoints
    .map(({ line, enabled }) => ({ from: lineStart(doc, line), enabled }))
    .filter(
      (marker): marker is { from: number; enabled: boolean } =>
        marker.from !== null,
    )
    .sort((a, b) => a.from - b.from)
    .map(({ from, enabled }) => (enabled ? ENABLED : DISABLED).range(from));
  return {
    markers,
    pc:
      pcFrom === null
        ? Decoration.none
        : Decoration.set([pcLineDecoration.range(pcFrom)]),
    breakpoints: RangeSet.of(breakpoints),
  };
}

function sameMarkers(a: Markers, b: Markers): boolean {
  return (
    a.pcLine === b.pcLine &&
    a.breakpoints.length === b.breakpoints.length &&
    a.breakpoints.every(
      (point, i) =>
        point.line === b.breakpoints[i].line &&
        point.enabled === b.breakpoints[i].enabled,
    )
  );
}

function readMarkers({ machine, kind, lines }: MarkerOptions): Markers {
  const map = lines();
  const snapshot = machine.getSnapshot();
  let pcLine: number | null = null;
  if (tracksPc(snapshot)) {
    const word = machine.disassemble(snapshot.pc);
    if (word.source === kind && word.sourceLine !== undefined)
      pcLine = word.sourceLine;
  }
  const breakpoints = map
    ? machine.breakpoints
        .list()
        .flatMap((point) => {
          const line = map.lineOf.get(point.addr);
          return line === undefined ? [] : [{ line, enabled: point.enabled }];
        })
        .sort((a, b) => a.line - b.line)
    : [];
  return { pcLine, breakpoints };
}

/**
 * Shows the PC line and a breakpoint gutter for one source file, following
 * the machine. Markers move with edits until the next assemble.
 */
export function machineMarkers(options: MarkerOptions): Extension {
  const field = StateField.define<MarkerState>({
    create: (state) => build(state.doc, readMarkers(options)),
    update(value, tr) {
      for (const effect of tr.effects)
        if (effect.is(setMarkers)) return build(tr.state.doc, effect.value);
      if (!tr.docChanged) return value;
      return {
        markers: value.markers,
        pc: value.pc.map(tr.changes),
        breakpoints: value.breakpoints.map(tr.changes),
      };
    },
    provide: (f) => EditorView.decorations.from(f, (value) => value.pc),
  });

  const sync = ViewPlugin.define((view) => {
    const refresh = () => {
      const markers = readMarkers(options);
      const previous = view.state.field(field).markers;
      if (sameMarkers(markers, previous)) return;
      const effects: Array<StateEffect<unknown>> = [setMarkers.of(markers)];
      const pcFrom =
        markers.pcLine === null
          ? null
          : lineStart(view.state.doc, markers.pcLine);
      // Follow the PC: keep its line visible whenever it moves.
      if (pcFrom !== null && markers.pcLine !== previous.pcLine)
        effects.push(EditorView.scrollIntoView(pcFrom, { y: "nearest" }));
      view.dispatch({ effects });
    };
    const unsubscribers = [
      options.machine.subscribe(refresh),
      options.subscribeLines?.(refresh),
    ];
    return {
      destroy: () => {
        for (const unsubscribe of unsubscribers) unsubscribe?.();
      },
    };
  });

  const breakpointGutter = gutter({
    class: "cm-breakpoint-gutter",
    markers: (view) => view.state.field(field).breakpoints,
    initialSpacer: () => ENABLED,
    domEventHandlers: {
      mousedown(view, block) {
        options.onToggleLine(view.state.doc.lineAt(block.from).number);
        return true;
      },
    },
  });

  return [field, sync, breakpointGutter];
}

/** Converts an assembly error to a CodeMirror diagnostic in `doc`. */
export function toDiagnostic(error: AssemblyError, doc: Text): Diagnostic {
  const position = error.position;
  const line = doc.line(Math.min(Math.max(position?.line ?? 1, 1), doc.lines));
  const clamp = (column: number) =>
    Math.min(line.to, Math.max(line.from, line.from + column - 1));
  const from =
    position?.column === undefined ? line.from : clamp(position.column);
  const to =
    position?.endColumn === undefined ? line.to : clamp(position.endColumn);
  return {
    from,
    to: Math.max(from, to),
    severity: "error",
    message: error.text,
  };
}

/** Shows the last assembly error inline, and refreshes on each assemble. */
export function assemblyDiagnostics(
  getError: () => AssemblyError | null,
  subscribe: (listener: () => void) => () => void,
): Extension {
  const diagnosticsFor = (doc: Text) => {
    const error = getError();
    return error ? [toDiagnostic(error, doc)] : [];
  };
  // The linter covers the first render and later edits; each assemble
  // pushes its result right away.
  const source = linter((view) => diagnosticsFor(view.state.doc), {
    delay: 0,
  });
  const refresh = ViewPlugin.define((view) => {
    const unsubscribe = subscribe(() =>
      view.dispatch(setDiagnostics(view.state, diagnosticsFor(view.state.doc))),
    );
    return { destroy: unsubscribe };
  });
  return [source, refresh];
}

/** The 1-based line of the main cursor. */
export function cursorLine(state: EditorState): number {
  return state.doc.lineAt(state.selection.main.head).number;
}
