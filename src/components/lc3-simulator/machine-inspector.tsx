import {
  Activity,
  Cpu,
  Flag,
  Gauge,
  MemoryStick,
  PencilLine,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

import { instructions, registers } from "./data";

function RegisterGrid() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-(--sim-border)">
      {registers.map((register) => (
        <Button
          className="sim-register group h-auto min-w-0 flex-col items-start gap-1 rounded-none border-0 bg-(--sim-panel) px-3 py-2 text-left shadow-none before:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--sim-amber) sm:h-auto"
          key={register.name}
          variant="ghost"
        >
          <span className="flex w-full items-center justify-between">
            <span className="sim-dim font-mono text-[10px]">
              {register.name}
            </span>
            <PencilLine className="size-3 opacity-0 transition-opacity group-hover:opacity-50" />
          </span>
          <span
            className={`font-mono text-sm font-semibold ${register.changed ? "text-(--sim-amber)" : ""}`}
          >
            {register.hex}
          </span>
          <span className="sim-dim font-mono text-[10px]">
            {register.signed}
          </span>
        </Button>
      ))}
    </div>
  );
}

export function MachineInspector({ mobile = false }: { mobile?: boolean }) {
  return (
    <aside
      className={`sim-panel min-h-0 shrink-0 flex-col ${
        mobile ? "flex h-full w-full border-0" : "hidden w-72 border-l xl:flex"
      }`}
    >
      <Tabs className="min-h-0 flex-1 gap-0" defaultValue="cpu">
        <div className="flex h-11 items-center border-b px-2">
          <TabsList className="w-full" size="sm">
            <TabsTab value="cpu">
              <Cpu /> CPU
            </TabsTab>
            <TabsTab value="memory">
              <MemoryStick /> Memory
            </TabsTab>
          </TabsList>
        </div>

        <TabsPanel className="min-h-0" value="cpu">
          <ScrollArea className="min-h-0" scrollFade>
            <div className="space-y-4 p-3">
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="sim-label">Machine state</h2>
                  <Badge className="gap-1" variant="warning">
                    <span className="size-1.5 rounded-full bg-current" /> Paused
                  </Badge>
                </div>
                <div className="space-y-2 rounded-lg border bg-(--sim-surface) p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="sim-dim flex items-center gap-2">
                      <Gauge className="size-3.5" /> Program counter
                    </span>
                    <span className="font-mono font-semibold text-(--sim-amber)">
                      x3002
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="sim-dim flex items-center gap-2">
                      <Activity className="size-3.5" /> Instruction
                    </span>
                    <span className="font-mono">GETC</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="sim-dim flex items-center gap-2">
                      <Flag className="size-3.5" /> Condition
                    </span>
                    <div className="flex gap-1 font-mono">
                      <Badge variant="outline">N</Badge>
                      <Badge
                        className="border-(--sim-amber) bg-[color-mix(in_srgb,var(--sim-amber)_12%,transparent)] text-(--sim-amber)"
                        variant="outline"
                      >
                        Z
                      </Badge>
                      <Badge variant="outline">P</Badge>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="sim-label">Registers</h2>
                  <Button size="xs" variant="ghost">
                    Reset values
                  </Button>
                </div>
                <RegisterGrid />
              </section>

              <section>
                <h2 className="sim-label mb-2">Current instruction</h2>
                <div className="rounded-lg border bg-(--sim-surface) p-3 font-mono text-xs">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="sim-address">x3002</span>
                    <span className="font-semibold text-(--sim-cyan)">
                      GETC
                    </span>
                  </div>
                  <p className="sim-dim leading-5">
                    Read one character from the keyboard into R0.
                  </p>
                </div>
              </section>
            </div>
          </ScrollArea>
        </TabsPanel>

        <TabsPanel className="min-h-0" value="memory">
          <ScrollArea className="min-h-0">
            <div className="p-3 font-mono text-xs">
              {Array.from({ length: 18 }, (_, index) => (
                <div
                  className="flex items-center justify-between border-b px-2 py-2"
                  key={index}
                >
                  <span className="sim-address">
                    x{(0x3000 + index).toString(16).toUpperCase()}
                  </span>
                  <span>{instructions[index]?.hex ?? "0000"}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsPanel>
      </Tabs>
    </aside>
  );
}
