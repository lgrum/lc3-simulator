import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const keyVariants = cva(
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[5px] border px-2.5 text-[13px] font-medium whitespace-nowrap outline-none select-none focus-visible:ring-2 focus-visible:ring-phosphor/70 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        default:
          "border-key-border bg-linear-to-b from-key-top to-key-bottom text-key-text shadow-[0_1px_0_var(--key-shadow)] hover:from-key-hover-top hover:to-key-hover-bottom active:translate-y-px active:shadow-none",
        run: "border-run-border bg-linear-to-b from-run-top to-run-bottom text-run-text shadow-[0_1px_0_var(--key-shadow)] hover:from-run-hover-top hover:to-run-hover-bottom active:translate-y-px active:shadow-none",
        flat: "border-transparent text-silk hover:bg-tint/6 data-popup-open:bg-tint/8",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export type KeyProps = ComponentProps<"button"> &
  VariantProps<typeof keyVariants>;

/** A toolbar button styled as a panel key. */
export function Key({ tone, className, type = "button", ...props }: KeyProps) {
  return (
    <button
      type={type}
      className={cn(keyVariants({ tone }), className)}
      {...props}
    />
  );
}

/** A key with a tooltip, e.g. for its keyboard shortcut. */
export function HintedKey({ hint, ...props }: KeyProps & { hint: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Key {...props} />} />
      <TooltipPopup>{hint}</TooltipPopup>
    </Tooltip>
  );
}

export function Shortcut({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-mono text-[10.5px] font-normal opacity-70">
      {children}
    </kbd>
  );
}
