import { Cpu, FileCode2, SquareTerminal } from "lucide-react";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

import { ConsolePanel } from "./console-panel";
import { EditorWorkspace } from "./editor-workspace";
import { MachineInspector } from "./machine-inspector";

export function MobileWorkbench() {
  return (
    <Tabs className="min-h-0 flex-1 gap-0 md:hidden" defaultValue="editor">
      <TabsPanel className="min-h-0" value="editor">
        <EditorWorkspace />
      </TabsPanel>
      <TabsPanel className="min-h-0" value="console">
        <ConsolePanel mobile />
      </TabsPanel>
      <TabsPanel className="min-h-0" value="cpu">
        <MachineInspector mobile />
      </TabsPanel>

      <div className="sim-mobile-tabs flex h-12 shrink-0 items-center justify-center border-t px-2">
        <TabsList className="w-full bg-transparent p-0" size="sm">
          <TabsTab className="flex-1 gap-1.5" value="editor">
            <FileCode2 /> Source
          </TabsTab>
          <TabsTab className="flex-1 gap-1.5" value="console">
            <SquareTerminal /> Console
          </TabsTab>
          <TabsTab className="flex-1 gap-1.5" value="cpu">
            <Cpu /> CPU
          </TabsTab>
        </TabsList>
      </div>
    </Tabs>
  );
}
