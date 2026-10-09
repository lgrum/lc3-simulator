import type { StepEvent } from "@/lib/simulator/controller";
import { m } from "@/paraglide/messages";

import { hex } from "../lib/format";
import { useMachineRead, useSnapshot } from "../workbench-provider";
import { EmptyHint } from "./shared";

const TRACE_LIMIT = 200;

const FLAGS = ["n", "z", "p"] as const;

function flagsOf(psr: number): string {
  return FLAGS.map((flag, i) =>
    psr & (4 >> i) ? flag.toUpperCase() : flag,
  ).join("");
}

/** Plain-text changes of one step, e.g. "R0 x0034 → x0033". */
export function describeStep(event: StepEvent): Array<string> {
  const changes = [
    ...event.regWrites
      .filter((write) => write.before !== write.after)
      .map(
        (write) => `R${write.reg} ${hex(write.before)} → ${hex(write.after)}`,
      ),
    ...event.memWrites.map(
      (write) =>
        `[${hex(write.addr)}] ${hex(write.before)} → ${hex(write.after)}`,
    ),
  ];
  if ((event.psrBefore & 7) !== (event.psrAfter & 7))
    changes.push(`${flagsOf(event.psrBefore)} → ${flagsOf(event.psrAfter)}`);
  if (event.output)
    changes.push(m.trace_printed({ text: JSON.stringify(event.output) }));
  if (event.interrupt !== undefined)
    changes.push(m.trace_interrupt({ vector: hex(event.interrupt) }));
  if (event.exception)
    changes.push(m.trace_exception({ kind: event.exception }));
  if (event.halted) changes.push(m.trace_halted());
  return changes;
}

export function TraceView() {
  const { status } = useSnapshot();
  const steps = useMachineRead((machine) =>
    machine.getSnapshot().status === "running"
      ? []
      : [...machine.getTrace(TRACE_LIMIT)].reverse().map((event) => ({
          event,
          text:
            event.word === null
              ? event.mnemonic
              : machine.disassemble(event.pc).text,
        })),
  );

  if (status === "running") return <EmptyHint>{m.trace_running()}</EmptyHint>;
  if (steps.length === 0) return <EmptyHint>{m.trace_empty()}</EmptyHint>;

  return (
    <div className="h-full overflow-y-auto">
      <table translate="no" className="w-full font-mono text-xs">
        <caption className="sr-only">{m.trace_caption()}</caption>
        <thead className="sticky top-0 bg-screen text-left font-sans text-silk-2">
          <tr>
            <th scope="col" className="w-20 px-4 py-1.5 font-medium">
              {m.column_address()}
            </th>
            <th scope="col" className="w-56 py-1.5 font-medium">
              {m.column_instruction()}
            </th>
            <th scope="col" className="py-1.5 font-medium">
              {m.trace_changes()}
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map(({ event, text }, i) => (
            <tr
              // The trace is a ring buffer: position from the newest step is
              // the only stable identity it has.
              key={i}
              className="border-t border-screen-line align-top first:text-phosphor"
            >
              <td className="px-4 py-1 text-code-dim">{hex(event.pc)}</td>
              <td className="py-1 pr-4 text-code-text">{text}</td>
              <td className="py-1 pr-4 text-silk-2">
                {describeStep(event).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
