import { useState } from "react";

import { m } from "@/paraglide/messages";

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
import { CodeView } from "./code-view";
import type { SourceKind } from "./machine-markers";

/** The file the PC is in while paused; undefined while running. */
function usePcSource(): SourceKind | undefined {
  return useMachineRead((machine) => {
    const { status, pc } = machine.getSnapshot();
    return status === "running" ? undefined : machine.disassemble(pc).source;
  });
}

function AssemblyError() {
  const { error } = useAssembly();
  if (!error) return null;
  const line = error.position?.line;
  return (
    <p
      role="alert"
      className="flex-none border-t border-screen-line px-4 py-2 font-mono text-[12.5px] text-[#ff9a80]"
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
    <Screen className="focus-within:shadow-[inset_0_2px_8px_rgba(0,0,0,0.7),0_0_0_3px_#3a3324]">
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
        <ScreenTabPanel value="program" keepMounted>
          <CodeView kind="program" label={m.editor_program_label()} />
        </ScreenTabPanel>
        <ScreenTabPanel value="os" keepMounted>
          <CodeView kind="os" label={m.editor_os_label()} />
        </ScreenTabPanel>
      </ScreenTabs>
      <AssemblyError />
    </Screen>
  );
}
