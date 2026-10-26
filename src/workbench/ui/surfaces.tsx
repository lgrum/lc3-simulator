import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A recessed screen: the editor, console and readouts. */
export function Screen({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-screen shadow-[inset_0_2px_8px_var(--screen-inset)]",
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
      className={cn("flex min-h-0 min-w-0 flex-col bg-case-2", className)}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  titleId,
  className,
  children,
}: {
  title: ReactNode;
  titleId?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex h-9 flex-none items-center justify-between gap-3 border-b border-edge px-3",
        className,
      )}
    >
      <h2 id={titleId} className="text-[13.5px] font-semibold text-silk-hi">
        {title}
      </h2>
      {children}
    </header>
  );
}
