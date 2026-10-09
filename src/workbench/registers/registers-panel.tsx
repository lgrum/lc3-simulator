import type { ReactNode } from "react";

import type { RegisterName } from "@/lib/simulator/controller";
import { LC3 } from "@/lib/simulator/isa/lc3";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import {
  asciiOf,
  formatFixed,
  mnemonicOf,
  parseFixed,
  parseWord,
  signed,
} from "../lib/format";
import { EditableWord } from "../ui/editable-word";
import { Lamps } from "../ui/lamps";
import { Panel, PanelHeader } from "../ui/surfaces";
import {
  useChanges,
  useMachineRead,
  useSnapshot,
  useWorkbench,
} from "../workbench-provider";
import { NumberFormatMenu, useFractionBits } from "./number-format";

type RowProps = {
  name: RegisterName;
  value: number;
  /**
   * Show the value as a number: signed and unsigned integers in Q0, or the
   * signed fixed-point value with this many fraction bits.
   */
  fractionBits?: number;
  note?: ReactNode;
};

function NumberCells({
  value,
  fractionBits,
}: {
  value: number;
  fractionBits: number;
}) {
  const cell = "pr-3 text-right font-mono text-xs tabular-nums";
  if (fractionBits === 0)
    return (
      <>
        <td className={cn(cell, "text-silk-2")}>{signed(value)}</td>
        <td className={cn(cell, "text-silk-3")}>
          {value !== signed(value) ? value : ""}
        </td>
      </>
    );
  const { text, exact } = formatFixed(value, fractionBits);
  return (
    <>
      <td
        className={cn(cell, "text-silk-2")}
        title={text === exact ? undefined : exact}
      >
        {text}
      </td>
      <td className={cell} />
    </>
  );
}

function RegisterRow({ name, value, fractionBits, note }: RowProps) {
  const { machine } = useWorkbench();
  const snapshot = useSnapshot();
  const changed = useChanges().registers.has(name);
  return (
    <tr className="h-6">
      <th
        scope="row"
        className={cn(
          "w-10 pr-2 text-left font-medium",
          changed ? "text-phosphor" : "text-silk",
        )}
      >
        {name}
        {changed && <span className="sr-only"> {m.changed()}</span>}
      </th>
      <td className="pr-3">
        <Lamps value={value} />
      </td>
      <td className="pr-3">
        <EditableWord
          value={value}
          name={name}
          disabled={snapshot.status === "running"}
          onCommit={(next) => machine.writeRegister(name, next)}
          parse={
            fractionBits
              ? (text) => parseFixed(text, fractionBits) ?? parseWord(text)
              : undefined
          }
          className={
            changed
              ? "text-phosphor [text-shadow:0_0_5px_var(--phosphor-glow)]"
              : "text-silk-hi"
          }
        />
      </td>
      {fractionBits !== undefined ? (
        <>
          <NumberCells value={value} fractionBits={fractionBits} />
          <td className="w-full max-w-0 truncate font-mono text-xs text-silk-2">
            {note}
          </td>
        </>
      ) : (
        <td colSpan={3} className="w-full max-w-0 truncate text-xs text-silk-2">
          {note}
        </td>
      )}
    </tr>
  );
}

function Flags({ n, z, p }: { n: boolean; z: boolean; p: boolean }) {
  const flags: Array<[string, boolean]> = [
    ["n", n],
    ["z", z],
    ["p", p],
  ];
  const set = flags.filter(([, on]) => on).map(([flag]) => flag.toUpperCase());
  return (
    <span className="mr-0.5 inline-flex gap-1 font-mono">
      {flags.map(([flag, on]) => (
        <span
          key={flag}
          aria-hidden
          className={on ? "font-semibold text-lamp" : "text-silk-3"}
        >
          {on ? flag.toUpperCase() : flag}
        </span>
      ))}
      <span className="sr-only">
        {m.flags_set({ flags: set.join(" ") || "-" })}
      </span>
    </span>
  );
}

export function RegistersPanel() {
  const snapshot = useSnapshot();
  const supervisor = snapshot.privilege === "supervisor";
  const pcLabel = useMachineRead((machine) =>
    machine.lookupSymbol(machine.getSnapshot().pc),
  );
  const [fractionBits, setFractionBits] = useFractionBits();

  return (
    <Panel aria-labelledby="registers-title">
      <PanelHeader title={m.registers()} titleId="registers-title">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs text-silk-2">
            {fractionBits === 0 ? m.registers_hint() : m.registers_hint_fixed()}
          </span>
          <NumberFormatMenu
            fractionBits={fractionBits}
            onChange={setFractionBits}
          />
        </div>
      </PanelHeader>
      <div className="overflow-x-auto px-3 py-2">
        <table
          translate="no"
          className="w-full border-separate border-spacing-y-[3px] text-[13px]"
        >
          <caption className="sr-only">{m.registers_caption()}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{m.column_register()}</th>
              <th scope="col">{m.column_bits()}</th>
              <th scope="col">{m.column_hex()}</th>
              <th scope="col">
                {fractionBits === 0
                  ? m.column_signed()
                  : m.column_fixed({ q: `Q${fractionBits}` })}
              </th>
              <th scope="col">
                {fractionBits === 0 ? m.column_unsigned() : undefined}
              </th>
              <th scope="col">{m.column_note()}</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.regs.map((value, i) => (
              <RegisterRow
                key={`R${i}`}
                name={`R${i}` as RegisterName}
                value={value}
                fractionBits={fractionBits}
                note={
                  i === 6 && supervisor
                    ? m.supervisor_stack()
                    : value === 0
                      ? undefined
                      : asciiOf(value)
                }
              />
            ))}
            <tr aria-hidden className="h-2">
              <td colSpan={6} className="border-b border-edge" />
            </tr>
            <RegisterRow
              name="PC"
              value={snapshot.pc}
              note={typeof pcLabel === "string" ? pcLabel : undefined}
            />
            <RegisterRow
              name="IR"
              value={snapshot.ir}
              note={mnemonicOf(LC3, snapshot.ir)}
            />
            <RegisterRow
              name="PSR"
              value={snapshot.psr}
              note={
                <>
                  <Flags n={snapshot.n} z={snapshot.z} p={snapshot.p} /> ·{" "}
                  {supervisor ? m.mode_supervisor() : m.mode_user()} ·{" "}
                  {m.priority({ level: snapshot.priority })}
                </>
              }
            />
            <RegisterRow
              name="MCR"
              value={snapshot.mcr}
              note={
                snapshot.mcr & 0x8000 ? m.clock_running() : m.clock_stopped()
              }
            />
            {supervisor ? (
              <RegisterRow
                name="USP"
                value={snapshot.savedUSP}
                note={m.saved_usp()}
              />
            ) : (
              <RegisterRow
                name="SSP"
                value={snapshot.savedSSP}
                note={m.saved_ssp()}
              />
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
