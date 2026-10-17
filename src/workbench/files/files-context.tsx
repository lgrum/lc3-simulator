import { FolderTreeIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { SidebarContext, useSidebar } from "@/components/ui/sidebar";
import type { SidebarContextProps } from "@/components/ui/sidebar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { m } from "@/paraglide/messages";

/**
 * Sidebar state without the stock provider, whose Ctrl+B shortcut would
 * clash with Assemble. On phone widths the file sidebar is a sheet.
 */
export function FilesProvider({ children }: { children: ReactNode }) {
  const isMobile = useMediaQuery("max-md");
  const [openMobile, setOpenMobile] = useState(false);
  const value: SidebarContextProps = {
    state: "expanded",
    open: true,
    setOpen: () => {},
    openMobile,
    setOpenMobile,
    isMobile,
    toggleSidebar: () => setOpenMobile((open) => !open),
  };
  return <SidebarContext value={value}>{children}</SidebarContext>;
}

/** Opens the file sheet; only shown when the sidebar is a sheet. */
export function FilesTrigger() {
  const { isMobile, setOpenMobile } = useSidebar();
  if (!isMobile) return null;
  return (
    <button
      type="button"
      onClick={() => setOpenMobile(true)}
      className="-mb-px mr-1 inline-flex flex-none items-center gap-1.5 self-center rounded-[4px] px-2 py-1 text-[13px] text-silk-2 outline-none hover:bg-tint/5 hover:text-silk focus-visible:ring-2 focus-visible:ring-phosphor/70"
    >
      <FolderTreeIcon aria-hidden className="size-3.5" />
      {m.files_title()}
    </button>
  );
}
