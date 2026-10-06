import { useEffect } from "react";

import {
  continueRun,
  pause,
  runToCursor,
  stepInto,
  stepOut,
  stepOver,
  toggleBreakpointAtLine,
} from "../actions";
import { useWorkbench } from "../workbench-provider";
import type { Workbench } from "../workbench-provider";

type Shortcut = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  run: (workbench: Workbench) => void;
};

/** Debugger shortcuts, as in most IDEs. Labels live next to each control. */
export const SHORTCUTS: ReadonlyArray<Shortcut> = [
  { key: "F5", run: continueRun },
  { key: "F6", run: pause },
  { key: "F10", run: stepOver },
  { key: "F10", ctrl: true, run: runToCursor },
  { key: "F11", run: stepInto },
  { key: "F11", shift: true, run: stepOut },
  {
    key: "F9",
    run: (workbench) =>
      toggleBreakpointAtLine(
        workbench,
        workbench.cursor.kind,
        workbench.cursor.line,
      ),
  },
  { key: "b", ctrl: true, run: ({ assembly }) => assembly.assemble() },
];

export function useShortcuts(): void {
  const workbench = useWorkbench();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const shortcut = SHORTCUTS.find(
        ({ key, ctrl: needsCtrl = false, shift = false }) =>
          event.key.toLowerCase() === key.toLowerCase() &&
          ctrl === needsCtrl &&
          event.shiftKey === shift,
      );
      if (!shortcut) return;
      event.preventDefault();
      shortcut.run(workbench);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workbench]);
}
