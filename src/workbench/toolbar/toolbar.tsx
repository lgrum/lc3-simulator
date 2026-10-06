import { BinaryIcon } from "lucide-react";

import { m } from "@/paraglide/messages";

import { HintedKey, Shortcut } from "../ui/key";
import { useWorkbench } from "../workbench-provider";
import { ExamplesMenu, FileMenu } from "./file-menus";
import { RunControls } from "./run-controls";
import { RunState } from "./run-state";
import { useShortcuts } from "./use-shortcuts";

function Separator() {
  return <span aria-hidden className="mx-1 h-6 w-px bg-edge" />;
}

export function Toolbar() {
  const { assembly } = useWorkbench();
  useShortcuts();
  return (
    <header className="flex min-w-0 items-center gap-1.5 overflow-x-auto border-b border-[#1c1d1f] px-3 whitespace-nowrap shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      <h1 className="mr-1 text-lg font-semibold text-[#e8e3d6]">LC-3</h1>
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
      </HintedKey>
      <Separator />
      <RunControls />
      <RunState />
    </header>
  );
}
