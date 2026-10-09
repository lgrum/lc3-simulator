import { useState } from "react";

import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { hex, parseWord } from "../lib/format";

type EditableWordProps = {
  value: number;
  /** What the value is, e.g. "R0" or "x3000", for its accessible name. */
  name: string;
  onCommit: (value: number) => void;
  /** Reads what the user typed; parseWord by default. */
  parse?: (text: string) => number | undefined;
  disabled?: boolean;
  className?: string;
};

/**
 * A hex readout that turns into an input on click. Accepts any notation that
 * parseWord understands. Enter or leaving the field saves, Escape cancels.
 */
export function EditableWord({
  value,
  name,
  onCommit,
  parse = parseWord,
  disabled,
  className,
}: EditableWordProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = draft === null ? undefined : parse(draft);
  const invalid = draft !== null && draft.trim() !== "" && parsed === undefined;

  const finish = (save: boolean) => {
    if (save && parsed !== undefined && parsed !== value) onCommit(parsed);
    setDraft(null);
  };

  const box =
    "h-6 w-[4.75rem] rounded-[3px] px-1.5 text-center font-mono text-[12.5px] font-medium";

  if (draft === null)
    return (
      <button
        type="button"
        aria-label={m.edit_value({ name, value: hex(value) })}
        disabled={disabled}
        onClick={() => setDraft(hex(value))}
        translate="no"
        className={cn(
          box,
          "bg-screen shadow-[inset_0_1px_2px_var(--well-inset)] outline-none hover:ring-1 hover:ring-edge-2 focus-visible:ring-2 focus-visible:ring-phosphor/70 disabled:hover:ring-0",
          className,
        )}
      >
        {hex(value)}
      </button>
    );

  return (
    <>
      <input
        // Opened by a click on the value, so moving focus here is expected.
        autoFocus
        aria-label={m.edit_value_input({ name })}
        aria-invalid={invalid}
        title={invalid ? m.edit_value_invalid() : undefined}
        value={draft}
        autoComplete="off"
        translate="no"
        spellCheck={false}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finish(true);
          if (event.key === "Escape") finish(false);
        }}
        className={cn(
          box,
          "bg-field text-silk-hi outline-none ring-2 ring-phosphor/70 aria-invalid:ring-lamp",
        )}
      />
      {invalid && (
        <span role="alert" className="sr-only">
          {m.edit_value_invalid()}
        </span>
      )}
    </>
  );
}
