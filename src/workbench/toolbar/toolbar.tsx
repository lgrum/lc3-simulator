import { BinaryIcon } from "lucide-react";

import { m } from "@/paraglide/messages";

import { AccountMenu } from "../account/account-menu";
import { HintedKey, Shortcut } from "../ui/key";
import { useIsStale, useWorkbench } from "../workbench-provider";
import { ExamplesMenu, FileMenu } from "./file-menus";
import { RunControls } from "./run-controls";
import { RunState } from "./run-state";
import { useShortcuts } from "./use-shortcuts";

function Separator() {
  return <span aria-hidden className="mx-1 h-6 w-px bg-edge" />;
}

/** Shows that a file changed since the last assemble. */
function StaleDot() {
  if (!useIsStale()) return null;
  return (
    <span
      className="size-1.5 rounded-full bg-phosphor"
      title={m.editor_modified()}
    >
      <span className="sr-only">{m.editor_modified()}</span>
    </span>
  );
}

export function Toolbar() {
  const { assembly } = useWorkbench();
  useShortcuts();
  return (
    <header className="relative flex min-w-0 items-center gap-1.5 overflow-x-auto border-b border-seam px-3 whitespace-nowrap shadow-[0_1px_0_var(--case-highlight)]">
      <h1 className="mr-1 text-lg font-semibold text-silk-hi">LC-3</h1>
      <FileMenu />
      <ExamplesMenu />
      <Separator />
      <HintedKey
        hint={
          <>
            {m.assemble_hint()} <Shortcut>Ctrl+B</Shortcut>
          </>
        }
        onClick={() => assembly.assemble()}
      >
        <BinaryIcon aria-hidden />
        {m.assemble()}
        <StaleDot />
      </HintedKey>
      <Separator />
      <RunControls />
      <RunState />
      <AccountMenu />
    </header>
  );
}
