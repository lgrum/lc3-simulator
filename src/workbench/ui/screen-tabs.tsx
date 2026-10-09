import { Tabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Tabs along the top edge of a screen, underlined in phosphor. */
export const ScreenTabs = Tabs.Root;

export function ScreenTabList({
  className,
  ...props
}: ComponentProps<typeof Tabs.List>) {
  return (
    <Tabs.List
      className={cn(
        "flex h-9 flex-none items-end gap-0.5 border-b border-screen-line px-2",
        className,
      )}
      {...props}
    />
  );
}

export function ScreenTab({
  className,
  ...props
}: ComponentProps<typeof Tabs.Tab>) {
  return (
    <Tabs.Tab
      className={cn(
        "-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-1.5 text-[13px] text-silk-2 outline-none hover:text-silk focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-phosphor/70 data-active:border-phosphor data-active:text-silk-hi",
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
