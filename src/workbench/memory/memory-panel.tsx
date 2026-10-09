import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { tracksPc } from "../actions";
import { toggleBreakpoint } from "../lib/breakpoints";
import {
  asciiOf,
  hex,
  opcodeBits,
  resolveAddress,
  signed,
} from "../lib/format";
import { EditableWord } from "../ui/editable-word";
import { Panel, PanelHeader } from "../ui/surfaces";
import { useChanges, useSnapshot, useWorkbench } from "../workbench-provider";

const ROW_HEIGHT = 22;
const WORDS = 0x10000;
const COLUMNS =
  "grid grid-cols-[20px_48px_minmax(0,0.9fr)_62px_34px_46px_minmax(0,2fr)_28px] items-center gap-x-2 pr-2";

function GoTo({ onGo }: { onGo: (addr: number) => void }) {
  const { machine } = useWorkbench();
  const [text, setText] = useState("");
  const [notFound, setNotFound] = useState(false);
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const addr = resolveAddress(text, (name) => machine.lookupSymbol(name));
        setNotFound(addr === undefined);
        if (addr !== undefined) onGo(addr);
      }}
    >
      <input
        name="go-to"
        autoComplete="off"
        aria-label={m.memory_go_to_label()}
        aria-invalid={notFound}
        title={notFound ? m.memory_go_to_not_found() : undefined}
        placeholder={m.memory_go_to_placeholder()}
        value={text}
        spellCheck={false}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setNotFound(false);
        }}
        translate="no"
        className="h-6 w-48 rounded-[4px] bg-screen px-2 font-mono text-[11.5px] text-silk shadow-[inset_0_1px_3px_var(--well-inset)] outline-none placeholder:text-silk-3 focus-visible:ring-2 focus-visible:ring-phosphor/70 aria-invalid:ring-2 aria-invalid:ring-lamp"
      />
      <span role="status" className="sr-only">
        {notFound ? m.memory_go_to_not_found() : ""}
      </span>
    </form>
  );
}

function FollowPc({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="flex h-6 items-center gap-1.5 rounded-[4px] border border-edge-2 px-2 text-xs text-silk outline-none hover:bg-tint/5 focus-visible:ring-2 focus-visible:ring-phosphor/70"
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          on ? "bg-phosphor shadow-[0_0_6px_var(--phosphor)]" : "bg-silk-3",
        )}
      />
      {m.memory_follow_pc()}
    </button>
  );
}

type RowData = {
  addr: number;
  word: number;
  label: string | undefined;
  text: string;
  start: number;
  breakpoint: boolean | undefined;
  isPc: boolean;
  isTarget: boolean;
};

/** One word. Takes plain values, so React Compiler can memoize it safely. */
function MemoryRow({
  addr,
  word,
  label,
  text,
  start,
  breakpoint,
  isPc,
  isTarget,
}: RowData) {
  const { machine } = useWorkbench();
  const { status } = useSnapshot();
  const changed = useChanges().memory.has(addr);
  const name = hex(addr);
  return (
    <div
      role="row"
      aria-rowindex={addr + 2}
      className={cn(
        COLUMNS,
        "absolute inset-x-0 font-mono text-xs text-code-muted",
        isPc && "bg-phosphor/12 text-phosphor",
        isTarget && !isPc && "bg-tint/6",
      )}
      style={{ height: ROW_HEIGHT, transform: `translateY(${start}px)` }}
    >
      <span role="cell" className="flex justify-center">
        <button
          type="button"
          aria-label={
            breakpoint === undefined
              ? m.breakpoint_add({ addr: name })
              : m.breakpoint_remove({ addr: name })
          }
          aria-pressed={breakpoint !== undefined}
          onClick={() => toggleBreakpoint(machine, addr)}
          className="group grid size-4 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-phosphor/70"
        >
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              breakpoint === true && "bg-lamp shadow-[0_0_5px_var(--lamp)]",
              breakpoint === false && "border-[1.5px] border-lamp",
              breakpoint === undefined &&
                "opacity-0 group-hover:bg-lamp-off group-hover:opacity-100 group-focus-visible:bg-lamp-off group-focus-visible:opacity-100",
            )}
          />
        </button>
      </span>
      <span role="rowheader" className={isPc ? "" : "text-code-dim"}>
        {name}
        {isPc && <span className="sr-only"> {m.memory_pc_here()}</span>}
      </span>
      <span
        role="cell"
        className="truncate font-sans text-[12.5px] text-code-label"
      >
        {label}
      </span>
      <span role="cell">
        <EditableWord
          value={word}
          name={name}
          disabled={status === "running"}
          onCommit={(value) => machine.writeMemory(addr, value)}
          className={cn(
            "h-5 w-16 bg-transparent shadow-none",
            changed &&
              "text-phosphor [text-shadow:0_0_5px_var(--phosphor-glow)]",
          )}
        />
        {changed && <span className="sr-only">{m.changed()}</span>}
      </span>
      <span role="cell" className="text-code-dim">
        {opcodeBits(word)}
      </span>
      <span role="cell" className="text-right tabular-nums">
        {signed(word)}
      </span>
      <span role="cell" className="truncate">
        {text}
      </span>
      <span role="cell" className="truncate text-silk-2">
        {word === 0 ? undefined : asciiOf(word)}
      </span>
    </div>
  );
}

function useFollowPc(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  follow: boolean,
) {
  const snapshot = useSnapshot();
  const { pc } = snapshot;
  const tracking = tracksPc(snapshot);
  // Scrolling is a side effect on the DOM, so it belongs in an effect.
  useEffect(() => {
    if (!follow || !tracking) return;
    // Centre the PC once it leaves the view, so the next instructions show.
    const range = virtualizer.range;
    if (!range || pc <= range.startIndex || pc >= range.endIndex)
      virtualizer.scrollToIndex(pc, { align: "center" });
  }, [virtualizer, follow, pc, tracking]);
}

type GoToRequest = { addr: number; request: number };

function MemoryTable({
  follow,
  goTo,
}: {
  follow: boolean;
  goTo?: GoToRequest;
}) {
  // TanStack Virtual mutates its instance, which React Compiler can't track.
  "use no memo";
  const { machine } = useWorkbench();
  const snapshot = useSnapshot();
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: WORDS,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    initialOffset: Math.max(0, (snapshot.pc - 4) * ROW_HEIGHT),
  });
  useFollowPc(virtualizer, follow);
  useEffect(() => {
    if (goTo) virtualizer.scrollToIndex(goTo.addr, { align: "center" });
  }, [virtualizer, goTo]);

  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const words = machine.readMemory(
    first,
    (items.at(-1)?.index ?? first) - first + 1,
  );
  const breakpoints = new Map(
    machine.breakpoints.list().map((point) => [point.addr, point.enabled]),
  );
  const showPc = tracksPc(snapshot);

  return (
    <div
      role="table"
      aria-label={m.memory()}
      translate="no"
      aria-rowcount={WORDS + 1}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        role="row"
        aria-rowindex={1}
        className={cn(
          COLUMNS,
          "h-7 flex-none border-b border-screen-line text-xs font-medium text-silk-2",
        )}
      >
        <span role="columnheader">
          <span className="sr-only">{m.column_breakpoint()}</span>
        </span>
        <span role="columnheader">{m.column_address()}</span>
        <span role="columnheader">{m.column_label()}</span>
        <span role="columnheader" className="pl-1.5">
          {m.column_hex()}
        </span>
        <span role="columnheader">{m.column_opcode()}</span>
        <span role="columnheader" className="text-right">
          {m.column_decimal()}
        </span>
        <span role="columnheader">{m.column_instruction()}</span>
        <span role="columnheader">{m.column_ascii()}</span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div
          role="rowgroup"
          className="relative"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {items.map((item) => {
            // Read here, in the component that opts out of memoization: the
            // machine changes without React knowing.
            const { label, text } = machine.disassemble(item.index);
            return (
              <MemoryRow
                key={item.index}
                addr={item.index}
                word={words[item.index - first]}
                label={label}
                text={text}
                start={item.start}
                breakpoint={breakpoints.get(item.index)}
                isPc={showPc && item.index === snapshot.pc}
                isTarget={item.index === goTo?.addr}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MemoryPanel() {
  const [follow, setFollow] = useState(true);
  const [goTo, setGoTo] = useState<GoToRequest>();
  return (
    <Panel aria-labelledby="memory-title" className="min-h-0">
      <PanelHeader title={m.memory()} titleId="memory-title">
        <div className="flex items-center gap-2">
          <GoTo
            onGo={(addr) =>
              setGoTo((last) => ({ addr, request: (last?.request ?? 0) + 1 }))
            }
          />
          <FollowPc on={follow} onChange={setFollow} />
        </div>
      </PanelHeader>
      <div className="m-2 mt-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-[5px] bg-screen">
        <MemoryTable follow={follow} goTo={goTo} />
      </div>
    </Panel>
  );
}
