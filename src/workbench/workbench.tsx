import { TooltipProvider } from "@/components/ui/tooltip";

import { BottomPanel } from "./bottom-panel";
import { EditorPanel } from "./editor/editor-panel";
import { MemoryPanel } from "./memory/memory-panel";
import { RegistersPanel } from "./registers/registers-panel";
import { Toolbar } from "./toolbar/toolbar";
import { WorkbenchProvider } from "./workbench-provider";

export function Workbench() {
  return (
    <WorkbenchProvider>
      <TooltipProvider delay={400}>
        <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[48px_minmax(0,1fr)_26px] bg-linear-to-b from-[#2e3033] to-[#26282a] text-[13px] text-silk">
          <Toolbar />
          <main className="grid min-h-0 grid-cols-[minmax(0,1fr)_540px] gap-2.5 p-2.5">
            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_220px] gap-2.5">
              <EditorPanel />
              <BottomPanel />
            </div>
            <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-2.5">
              <RegistersPanel />
              <MemoryPanel />
            </div>
          </main>
          <footer className="border-t border-[#1c1d1f] bg-[#222426]" />
        </div>
      </TooltipProvider>
    </WorkbenchProvider>
  );
}
