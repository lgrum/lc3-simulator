import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { useSnapshot, useWorkbench } from "../workbench-provider";

/** Whether the program is paused inside a keyboard read. */
export function useWaitingForInput(): boolean {
  return useSnapshot().pauseReason === "waiting-for-input";
}

/**
 * Hides output printed before `clearedAt`. Output is machine state, so it
 * can shrink again (step back, reset); then everything shows.
 */
function visibleOutput(output: string, clearedAt: number): string {
  return output.length < clearedAt ? output : output.slice(clearedAt);
}

export function ConsoleView({ clearedAt }: { clearedAt: number }) {
  const { machine } = useWorkbench();
  const { output } = useSnapshot();
  const waiting = useWaitingForInput();
  const input = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  // Moving focus is a DOM side effect: do it when the program starts
  // waiting, so students can type right away.
  useEffect(() => {
    if (waiting) input.current?.focus();
  }, [waiting]);

  const text = visibleOutput(output, clearedAt);

  return (
    // The screen forwards clicks to the hidden input; keyboard users reach
    // the input itself with Tab.
    // oxlint-disable-next-line click-events-have-key-events, no-static-element-interactions
    <div
      className="relative flex h-full min-h-0 cursor-text flex-col bg-[radial-gradient(ellipse_at_40%_30%,#16130b,#0c0b08)]"
      onClick={() => input.current?.focus()}
    >
      <textarea
        ref={input}
        aria-label={m.console_input_label()}
        aria-describedby="console-hint"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        rows={1}
        className="absolute size-px resize-none overflow-hidden opacity-0"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const typed = event.currentTarget.value.replace(/\r\n?/g, "\n");
          event.currentTarget.value = "";
          if (typed) machine.input(typed);
        }}
        onKeyDown={(event) => {
          if (event.key === "Backspace") {
            event.preventDefault();
            machine.input("\b");
          }
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 py-2.5">
        <pre
          role="log"
          aria-label={m.console_output_label()}
          className="font-mono text-[15px] leading-6 whitespace-pre-wrap text-phosphor [text-shadow:0_0_6px_rgba(255,181,71,0.5)]"
        >
          {text}
          <span
            aria-hidden
            className={cn(
              "inline-block h-[18px] w-[9px] translate-y-[3px]",
              focused
                ? "bg-phosphor shadow-[0_0_6px_var(--phosphor)] motion-safe:animate-caret-blink"
                : "border border-phosphor/60",
            )}
          />
        </pre>
      </div>
      <p
        id="console-hint"
        className={cn(
          "flex-none px-4 pb-2 text-xs",
          waiting ? "text-phosphor" : "text-silk-3",
        )}
      >
        {waiting ? m.console_waiting() : m.console_hint()}
      </p>
    </div>
  );
}
