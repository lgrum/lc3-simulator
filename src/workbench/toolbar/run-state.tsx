import type { CpuException } from "@/lib/simulator/isa/types";
import type { MachineSnapshot } from "@/lib/simulator/controller";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { hex } from "../lib/format";
import { useSnapshot, useWorkbench } from "../workbench-provider";

export type RunTone = "idle" | "running" | "paused" | "waiting" | "fault";

const EXCEPTIONS: Record<CpuException, () => string> = {
  privilege: m.exception_privilege,
  "illegal-opcode": m.exception_illegal_opcode,
  "access-violation": m.exception_access_violation,
};

/** A short description of what the machine is doing, and its LED colour. */
export function describeRunState(
  snapshot: MachineSnapshot,
  exception: CpuException | undefined,
): { text: string; tone: RunTone } {
  const pc = hex(snapshot.pc);
  if (snapshot.status === "running")
    return { text: m.state_running(), tone: "running" };
  if (snapshot.status === "halted")
    return { text: m.state_halted(), tone: "idle" };
  switch (snapshot.pauseReason) {
    case "breakpoint":
      return { text: m.state_breakpoint({ pc }), tone: "paused" };
    case "watchpoint":
      return { text: m.state_watchpoint({ pc }), tone: "paused" };
    case "waiting-for-input":
      return { text: m.state_waiting(), tone: "waiting" };
    case "exception":
      return {
        text: m.state_exception({
          pc,
          kind: exception ? EXCEPTIONS[exception]() : "",
        }),
        tone: "fault",
      };
    case null:
      return { text: m.state_ready({ pc }), tone: "idle" };
    default:
      return { text: m.state_paused({ pc }), tone: "paused" };
  }
}

const LED: Record<RunTone, string> = {
  idle: "bg-silk-3",
  running: "bg-[#a6e3a1] shadow-[0_0_8px_#a6e3a1]",
  paused: "bg-phosphor shadow-[0_0_8px_var(--phosphor)]",
  waiting:
    "bg-phosphor shadow-[0_0_8px_var(--phosphor)] motion-safe:animate-pulse",
  fault: "bg-lamp shadow-[0_0_8px_var(--lamp)]",
};

export function RunState() {
  const { machine } = useWorkbench();
  const snapshot = useSnapshot();
  const exception =
    snapshot.pauseReason === "exception"
      ? machine.getTrace(1)[0]?.exception
      : undefined;
  const { text, tone } = describeRunState(snapshot, exception);
  return (
    <output
      aria-live="polite"
      className={cn(
        "ml-auto flex h-8 flex-none items-center gap-2.5 rounded-[5px] bg-screen px-3 font-mono text-xs font-medium shadow-[inset_0_1px_3px_rgba(0,0,0,0.7)]",
        tone === "fault" ? "text-[#ff9a80]" : "text-phosphor",
      )}
    >
      <span
        aria-hidden
        className={cn("size-2.5 flex-none rounded-full", LED[tone])}
      />
      <span className="truncate">{text}</span>
    </output>
  );
}
