import { BinaryIcon } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { m } from "@/paraglide/messages";

import { AccountMenu } from "../account/account-menu";
import { PublishButton } from "../account/publish-button";
import { StubToggle } from "../account/stub-toggle";
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
  useShortcuts();
  return (
    <header className="relative min-w-0 border-b border-seam shadow-[0_1px_0_var(--case-highlight)]">
      {/* Narrow windows scroll the keys sideways with a thin overlay
          scrollbar instead of the browser's own. */}
      <ScrollArea scrollFade fill clampContentMinWidth={false}>
        <div className="flex h-full w-max min-w-full items-center gap-1.5 px-3 whitespace-nowrap">
          <ToolbarKeys />
        </div>
      </ScrollArea>
    </header>
  );
}

function ToolbarKeys() {
  const { assembly } = useWorkbench();
  return (
    <>
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
        onClick={() => void assembly.build()}
      >
        <BinaryIcon aria-hidden />
        {m.assemble()}
        <StaleDot />
      </HintedKey>
      <StubToggle />
      <PublishButton />
      <Separator />
      <RunControls />
      <RunState />
      <AccountMenu />
    </>
  );
}
