import { BinaryIcon } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";

import { AccountMenu } from "../account/account-menu";
import { PublishButton } from "../account/publish-button";
import { StubToggle } from "../account/stub-toggle";
import { HintedKey, Shortcut } from "../ui/key";
import { buildShare, buildStatusText } from "../build/build-status";
import { useAssembly, useIsStale, useWorkbench } from "../workbench-provider";
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

/**
 * Assembles and links the project. A signed-in build fetches published
 * modules first, which takes a while: meanwhile the key spins, ignores
 * clicks and fills a bar along its bottom edge, and the status bar says
 * what the build is doing.
 */
function AssembleKey() {
  const { assembly } = useWorkbench();
  const { building } = useAssembly();
  const share = building ? buildShare(building) : 0;
  return (
    <HintedKey
      hint={
        <>
          {m.assemble_hint()} <Shortcut>Ctrl+B</Shortcut>
        </>
      }
      aria-disabled={building !== null}
      aria-busy={building !== null}
      onClick={() => {
        if (!building) void assembly.build();
      }}
      className="relative overflow-hidden aria-disabled:cursor-progress"
    >
      {building ? <Spinner aria-hidden /> : <BinaryIcon aria-hidden />}
      {m.assemble()}
      <StaleDot />
      {building && (
        <span
          role="progressbar"
          aria-label={buildStatusText(building)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-phosphor/20"
        >
          <span
            className="block h-full bg-phosphor transition-[width] duration-200"
            style={{ width: `${share * 100}%` }}
          />
        </span>
      )}
    </HintedKey>
  );
}

function ToolbarKeys() {
  return (
    <>
      <h1 className="mr-1 text-lg font-semibold text-silk-hi">LC-3</h1>
      <FileMenu />
      <ExamplesMenu />
      <Separator />
      <AssembleKey />
      <StubToggle />
      <PublishButton />
      <Separator />
      <RunControls />
      <RunState />
      <AccountMenu />
    </>
  );
}
