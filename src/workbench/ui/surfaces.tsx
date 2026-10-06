import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A recessed dark screen: the editor, console and readouts. */
export function Screen({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-[7px] border border-black bg-screen shadow-[inset_0_2px_8px_rgba(0,0,0,0.7),0_0_0_3px_#1f2123]",
        className,
      )}
      {...props}
    />
  );
}

/** A raised panel on the case, holding controls and tables. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-[7px] border border-edge bg-case-2",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  titleId,
  children,
}: {
  title: ReactNode;
  titleId?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex h-9 flex-none items-center justify-between gap-3 border-b border-edge px-3">
      <h2 id={titleId} className="text-[13.5px] font-semibold text-[#ede8dc]">
        {title}
      </h2>
      {children}
    </header>
  );
}
