import { Suspense, lazy, useState } from "react";

import { m } from "@/paraglide/messages";

import { tracksPc } from "../actions";
import { Screen } from "../ui/surfaces";
import {
  ScreenTab,
  ScreenTabList,
  ScreenTabPanel,
  ScreenTabs,
} from "../ui/screen-tabs";
import {
  useAssembly,
  useIsStale,
  useMachineRead,
  useSnapshot,
  useSourceFile,
  useWorkbench,
} from "../workbench-provider";
import type { SourceKind } from "./machine-markers";

// CodeMirror is the largest dependency; loading it separately lets the rest
// of the workbench appear while it downloads.
const CodeView = lazy(() =>
  import("./code-view").then((module) => ({ default: module.CodeView })),
);

/** The file the PC is in; undefined while running too fast to follow. */
function usePcSource(): SourceKind | undefined {
  return useMachineRead((machine) => {
    const snapshot = machine.getSnapshot();
    return tracksPc(snapshot)
      ? machine.disassemble(snapshot.pc).source
      : undefined;
  });
}

function AssemblyError() {
  const { error } = useAssembly();
  if (!error) return null;
  const line = error.position?.line;
  return (
    <p
      role="alert"
      className="flex-none border-t border-screen-line px-4 py-2 font-mono text-[12.5px] text-error"
    >
      {line === undefined
        ? error.text
        : m.assembly_error_at_line({ line, message: error.text })}
    </p>
  );
}

export function EditorPanel() {
  const { os } = useWorkbench();
  const file = useSourceFile();
  const stale = useIsStale();
  const { pc } = useSnapshot();
  const pcSource = usePcSource();
  // A tab the user picked stays open until the PC moves; then the editor
  // follows the PC, e.g. into the OS during a TRAP.
  const [choice, setChoice] = useState<{ tab: SourceKind; pc: number }>();
  const tab =
    choice && (choice.pc === pc || pcSource === undefined)
      ? choice.tab
      : (pcSource ?? choice?.tab ?? "program");

  return (
    <Screen className="focus-within:shadow-[inset_0_2px_8px_var(--screen-inset),0_0_0_3px_var(--bezel-focus)]">
      <ScreenTabs
        value={tab}
        onValueChange={(value: SourceKind) => setChoice({ tab: value, pc })}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ScreenTabList>
          <ScreenTab value="program">
            {file.name}
            {stale && (
              <span
                className="size-1.5 rounded-full bg-phosphor"
                title={m.editor_modified()}
              >
                <span className="sr-only">{m.editor_modified()}</span>
              </span>
            )}
          </ScreenTab>
          <ScreenTab value="os">
            {os.fileName}
            <span className="font-mono text-[10.5px] text-silk-2">
              {m.editor_read_only()}
            </span>
          </ScreenTab>
        </ScreenTabList>
        <Suspense
          fallback={
            <p className="p-4 text-xs text-silk-2">{m.editor_loading()}</p>
          }
        >
          <ScreenTabPanel value="program" keepMounted>
            <CodeView kind="program" label={m.editor_program_label()} />
          </ScreenTabPanel>
          <ScreenTabPanel value="os" keepMounted>
            <CodeView kind="os" label={m.editor_os_label()} />
          </ScreenTabPanel>
        </Suspense>
      </ScreenTabs>
      <AssemblyError />
    </Screen>
  );
}
