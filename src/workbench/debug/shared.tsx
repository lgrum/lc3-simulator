import { XIcon } from "lucide-react";
import { useId } from "react";
import type { ComponentProps, ReactNode } from "react";

import type { MachineController } from "@/lib/simulator/controller";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { hex } from "../lib/format";

export const inputClass =
  "h-7 rounded-[4px] border border-edge-2 bg-field px-2 font-mono text-xs text-silk outline-none placeholder:text-silk-3 focus-visible:ring-2 focus-visible:ring-phosphor/70 aria-invalid:border-lamp";

/** A labelled input with an optional error below it. */
export function Field({
  label,
  error,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string }) {
  const id = useId();
  return (
    <label className={cn("flex flex-col gap-1 text-xs text-silk-2", className)}>
      {label}
      <input
        aria-invalid={error !== undefined}
        aria-describedby={error ? id : undefined}
        spellCheck={false}
        autoComplete="off"
        className={inputClass}
        {...props}
      />
      {error && (
        <span id={id} role="alert" className="text-error">
          {error}
        </span>
      )}
    </label>
  );
}

export function AddButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="h-7 self-end rounded-[4px] border border-key-border bg-linear-to-b from-key-top to-key-bottom px-3 text-xs font-medium text-key-text outline-none hover:from-key-hover-top hover:to-key-hover-bottom focus-visible:ring-2 focus-visible:ring-phosphor/70"
    >
      {children}
    </button>
  );
}

export function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-[4px] text-silk-2 outline-none hover:bg-tint/6 hover:text-error focus-visible:ring-2 focus-visible:ring-phosphor/70"
    >
      <XIcon aria-hidden className="size-3.5" />
    </button>
  );
}

/** "x3004 · LOOP · line 7": where an address is, in terms students know. */
export function describeAddress(machine: MachineController, addr: number) {
  const { label, source, sourceLine } = machine.disassemble(addr);
  const line =
    sourceLine === undefined
      ? undefined
      : source === "os"
        ? m.location_os_line({ line: sourceLine })
        : m.location_line({ line: sourceLine });
  return { address: hex(addr), label, line };
}

export function Location({
  address,
  label,
  line,
}: ReturnType<typeof describeAddress>) {
  return (
    <span className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="font-mono text-silk-hi">{address}</span>
      {label && <span className="text-code-label">{label}</span>}
      {line && <span className="text-silk-2">{line}</span>}
    </span>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-xs text-silk-2">{children}</p>;
}
