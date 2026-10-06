import { useState } from "react";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages";

import { ConsoleView, useWaitingForInput } from "./console/console-view";
import { Screen } from "./ui/surfaces";
import {
  ScreenTab,
  ScreenTabList,
  ScreenTabPanel,
  ScreenTabs,
} from "./ui/screen-tabs";
import { useSnapshot } from "./workbench-provider";

type BottomTab = "console" | "trace" | "breakpoints" | "watchpoints";

function ToolButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[4px] px-2 py-1 text-xs text-silk-2 outline-none hover:bg-white/5 hover:text-silk focus-visible:ring-2 focus-visible:ring-phosphor/70"
    >
      {children}
    </button>
  );
}

export function BottomPanel() {
  const { output, version } = useSnapshot();
  const waiting = useWaitingForInput();
  // A program waiting for a key brings the console forward, unless the user
  // picked another tab since the machine last changed.
  const [choice, setChoice] = useState<{ tab: BottomTab; version: number }>({
    tab: "console",
    version: -1,
  });
  const tab: BottomTab =
    waiting && choice.version !== version ? "console" : choice.tab;
  const [clearedAt, setClearedAt] = useState(0);

  return (
    <Screen>
      <ScreenTabs
        value={tab}
        onValueChange={(value: BottomTab) => setChoice({ tab: value, version })}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ScreenTabList>
          <ScreenTab value="console">
            {m.console()}
            {waiting && (
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-phosphor shadow-[0_0_6px_var(--phosphor)] motion-safe:animate-pulse"
              />
            )}
          </ScreenTab>
          <span className="ml-auto self-center">
            {tab === "console" && (
              <ToolButton onClick={() => setClearedAt(output.length)}>
                {m.console_clear()}
              </ToolButton>
            )}
          </span>
        </ScreenTabList>
        <ScreenTabPanel value="console" keepMounted>
          <ConsoleView clearedAt={clearedAt} />
        </ScreenTabPanel>
      </ScreenTabs>
    </Screen>
  );
}
