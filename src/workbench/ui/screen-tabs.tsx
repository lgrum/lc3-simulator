import { Tabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** Tabs along the top edge of a screen, underlined in phosphor. */
export const ScreenTabs = Tabs.Root;

/**
 * Scrolls sideways when the tabs don't fit. The list sits inside the scroll
 * area, so the tabs overlapping its bottom border don't count as overflow.
 */
export function ScreenTabList({
  className,
  ...props
}: ComponentProps<typeof Tabs.List>) {
  return (
    <ScrollArea
      scrollFade
      clampContentMinWidth={false}
      className="h-9 flex-none"
    >
      <Tabs.List
        className={cn(
          "flex h-9 w-max min-w-full items-end gap-0.5 border-b border-screen-line px-2",
          className,
        )}
        {...props}
      />
    </ScrollArea>
  );
}

export function ScreenTab({
  className,
  ...props
}: ComponentProps<typeof Tabs.Tab>) {
  return (
    <Tabs.Tab
      className={cn(
        "-mb-px inline-flex flex-none items-center gap-1.5 border-b-2 border-transparent px-3 py-1.5 text-[13px] whitespace-nowrap text-silk-2 outline-none hover:text-silk focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-phosphor/70 data-active:border-phosphor data-active:text-silk-hi",
        className,
      )}
      {...props}
    />
  );
}

export function ScreenTabPanel({
  className,
  ...props
}: ComponentProps<typeof Tabs.Panel>) {
  return (
    <Tabs.Panel
      className={cn(
        "min-h-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-phosphor/70 focus-visible:ring-inset",
        className,
      )}
      {...props}
    />
  );
}
