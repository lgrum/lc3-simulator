import { XIcon } from "lucide-react";
import { Suspense, lazy, useEffect } from "react";

import { m } from "@/paraglide/messages";

import { tracksPc } from "../actions";
import { FilesTrigger } from "../files/files-context";
import { baseName } from "../lib/file-names";
import { Screen } from "../ui/surfaces";
import {
  ScreenTab,
  ScreenTabList,
  ScreenTabPanel,
  ScreenTabs,
} from "../ui/screen-tabs";
import {
  useAssembly,
  useEditorTabs,
  useMachineRead,
  useProject,
  useSnapshot,
  useWorkbench,
} from "../workbench-provider";

// CodeMirror is the largest dependency; loading it separately lets the rest
// of the workbench appear while it downloads.
const CodeView = lazy(() =>
  import("./code-view").then((module) => ({ default: module.CodeView })),
);

/** The file the PC is in; undefined while running too fast to follow. */
function usePcFile(): string | undefined {
  return useMachineRead((machine) => {
    const snapshot = machine.getSnapshot();
    return tracksPc(snapshot)
      ? machine.disassemble(snapshot.pc).file
      : undefined;
  });
}

function AssemblyError() {
  const { diagnostics } = useAssembly();
  const error = diagnostics.find(({ severity }) => severity === "error");
  if (!error) return null;
  const { file, position, text } = error;
  const line = position?.line;
  return (
    <p
      role="alert"
      className="flex-none border-t border-screen-line px-4 py-2 font-mono text-[12.5px] text-error"
    >
      {file === null
        ? text
        : line === undefined
          ? m.assembly_error_in_file({ file, message: text })
          : m.assembly_error_at_file_line({ file, line, message: text })}
    </p>
  );
}

export function EditorPanel() {
  const { os, tabs } = useWorkbench();
  const { files, remote } = useProject();
  const { open, chosen } = useEditorTabs();
  const { pc } = useSnapshot();
  const pcFile = usePcFile();
  const pcInProject = pcFile !== undefined && files.has(pcFile);

  // The editor follows the PC into whichever file it moves to. A tab closed
  // while the PC is in its file stays closed until the PC comes back.
  useEffect(() => {
    if (pcInProject) tabs.open(pcFile);
  }, [tabs, pcFile, pcInProject]);

  const fileTabs = open;
  const allTabs = [...fileTabs, os.file];
  const pcTab =
    pcFile !== undefined && allTabs.includes(pcFile) ? pcFile : undefined;
  const picked = chosen && allTabs.includes(chosen.file) ? chosen : null;
  // A tab the user picked stays open until the PC moves; then the editor
  // follows the PC, e.g. into the OS during a TRAP.
  const tab =
    picked && (picked.pc === pc || pcTab === undefined)
      ? picked.file
      : (pcTab ?? picked?.file ?? fileTabs.at(0) ?? os.file);

  return (
    <Screen className="focus-within:shadow-[inset_0_2px_8px_var(--screen-inset),0_0_0_3px_var(--bezel-focus)]">
      <ScreenTabs
        value={tab}
        onValueChange={(value: string) => tabs.show(value)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ScreenTabList>
          <FilesTrigger />
          {fileTabs.map((file) => (
            <span key={file} className="flex flex-none items-center">
              <ScreenTab value={file} title={file}>
                {baseName(file)}
                {remote.has(file) && (
                  <span className="font-mono text-[10.5px] text-silk-2">
                    {m.editor_read_only()}
                  </span>
                )}
              </ScreenTab>
              <button
                type="button"
                aria-label={m.tab_close({ file })}
                onClick={() => tabs.close(file)}
                className="-mb-px grid size-5 place-items-center rounded-[3px] text-silk-3 outline-none hover:bg-tint/6 hover:text-silk focus-visible:ring-2 focus-visible:ring-phosphor/70"
              >
                <XIcon aria-hidden className="size-3" />
              </button>
            </span>
          ))}
          <ScreenTab value={os.file} className="flex-none">
            {os.file}
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
          {fileTabs.map((file) => (
            <ScreenTabPanel key={file} value={file} keepMounted>
              <CodeView file={file} label={m.editor_file_label({ file })} />
            </ScreenTabPanel>
          ))}
          <ScreenTabPanel value={os.file} keepMounted>
            <CodeView file={os.file} label={m.editor_os_label()} />
          </ScreenTabPanel>
        </Suspense>
      </ScreenTabs>
      <AssemblyError />
    </Screen>
  );
}
