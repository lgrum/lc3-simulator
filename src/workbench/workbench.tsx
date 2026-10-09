import { useEffect } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { getLocale } from "@/paraglide/runtime";

import { BottomPanel } from "./bottom-panel";
import { EditorPanel } from "./editor/editor-panel";
import { MemoryPanel } from "./memory/memory-panel";
import { RegistersPanel } from "./registers/registers-panel";
import { StatusBar } from "./status-bar";
import { Toolbar } from "./toolbar/toolbar";
import { WorkbenchProvider } from "./workbench-provider";

/** The shell is prerendered in the base locale; correct its lang here. */
function useDocumentLanguage() {
  useEffect(() => {
    document.documentElement.lang = getLocale();
  }, []);
}

export function Workbench() {
  useDocumentLanguage();
  return (
    <WorkbenchProvider>
      <TooltipProvider delay={400}>
        <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[48px_minmax(0,1fr)_26px] bg-linear-to-b from-case-top to-case-bottom text-[13px] text-silk">
          <Toolbar />
          {/* Side by side on desktops; stacked and scrolling on tablets. */}
          <main className="relative grid min-h-0 grid-cols-[minmax(0,1fr)_540px] gap-2.5 p-2.5 max-[1100px]:grid-cols-[minmax(0,1fr)] max-[1100px]:grid-rows-[max-content_max-content] max-[1100px]:overflow-y-auto">
            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_220px] gap-2.5 max-[1100px]:grid-rows-[60dvh_260px]">
              <EditorPanel />
              <BottomPanel />
            </div>
            <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-2.5 max-[1100px]:grid-rows-[max-content_420px]">
              <RegistersPanel />
              <MemoryPanel />
            </div>
          </main>
          <StatusBar />
        </div>
      </TooltipProvider>
    </WorkbenchProvider>
  );
}
