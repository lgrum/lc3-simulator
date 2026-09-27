import { useState } from "react";
import {
  ChevronDown,
  CircleX,
  PanelBottomClose,
  Send,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

export function ConsolePanel({ mobile = false }: { mobile?: boolean }) {
  const [command, setCommand] = useState("");

  return (
    <section
      className={`sim-console shrink-0 flex-col ${
        mobile ? "flex h-full border-0" : "hidden h-48 border-t md:flex"
      }`}
    >
      <Tabs className="min-h-0 flex-1 gap-0" defaultValue="console">
        <div className="flex h-10 items-center justify-between border-b px-2">
          <TabsList className="h-full bg-transparent p-0" variant="underline">
            <TabsTab className="h-full rounded-none px-3" value="console">
              Console
            </TabsTab>
            <TabsTab className="h-full rounded-none px-3" value="problems">
              Problems{" "}
              <Badge size="sm" variant="success">
                0
              </Badge>
            </TabsTab>
            <TabsTab className="h-full rounded-none px-3" value="trace">
              Trace
            </TabsTab>
          </TabsList>
          <div className="flex items-center gap-0.5">
            <Button aria-label="Clear console" size="icon-xs" variant="ghost">
              <Trash2 />
            </Button>
            <Button
              aria-label="Close console panel"
              size="icon-xs"
              variant="ghost"
            >
              <PanelBottomClose />
            </Button>
          </div>
        </div>

        <TabsPanel className="min-h-0" value="console">
          <div className="grid h-full min-h-0 grid-rows-[1fr_auto]">
            <ScrollArea className="min-h-0 px-3 py-2 font-mono text-xs leading-5">
              <div className="sim-dim">
                LC-3 virtual console · keyboard input enabled
              </div>
              <div className="text-(--sim-console-green)">hello</div>
              <div className="text-(--sim-console-green)">hello</div>
              <div className="mt-1 flex items-center gap-2 text-(--sim-amber)">
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" />
                Waiting for input at x3002 (GETC)
              </div>
            </ScrollArea>
            <form
              className="border-t px-2 py-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                setCommand("");
              }}
            >
              <InputGroup className="sim-input font-mono">
                <InputGroupAddon>
                  <span className="text-(--sim-console-green)">›</span>
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Console input"
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="Type input for the running program"
                  value={command}
                />
                <InputGroupAddon align="inline-end">
                  <Button
                    aria-label="Send console input"
                    size="icon-xs"
                    type="submit"
                    variant="ghost"
                  >
                    <Send />
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </div>
        </TabsPanel>

        <TabsPanel className="min-h-0" value="problems">
          <div className="sim-dim flex h-full items-center justify-center gap-2 text-sm">
            <CircleX className="size-4" /> No assembly problems detected
          </div>
        </TabsPanel>

        <TabsPanel className="min-h-0" value="trace">
          <div className="grid h-full grid-cols-[auto_1fr_auto] content-start gap-x-4 gap-y-1 p-3 font-mono text-xs">
            <span className="sim-dim">0007</span>
            <span>x3001 AND R2, R2, #0</span>
            <span className="sim-dim">Z</span>
            <span className="sim-dim">0008</span>
            <span>x3002 GETC</span>
            <span className="text-(--sim-amber)">WAIT</span>
          </div>
        </TabsPanel>
      </Tabs>
      <Button
        aria-label="Resize console panel"
        className="absolute left-0 top-0 h-1 w-full cursor-row-resize rounded-none border-0 p-0 opacity-0"
        variant="ghost"
      >
        <ChevronDown className="sr-only" />
      </Button>
    </section>
  );
}
