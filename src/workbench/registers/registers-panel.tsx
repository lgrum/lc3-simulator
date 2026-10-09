import type { ReactNode } from "react";

import type { RegisterName } from "@/lib/simulator/controller";
import { LC3 } from "@/lib/simulator/isa/lc3";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { asciiOf, mnemonicOf, signed } from "../lib/format";
import { EditableWord } from "../ui/editable-word";
import { Lamps } from "../ui/lamps";
import { Panel, PanelHeader } from "../ui/surfaces";
import {
  useChanges,
  useMachineRead,
  useSnapshot,
  useWorkbench,
} from "../workbench-provider";

type RowProps = {
  name: RegisterName;
  value: number;
  /** Show signed and unsigned decimal columns. */
  numbers?: boolean;
  note?: ReactNode;
};

function RegisterRow({ name, value, numbers, note }: RowProps) {
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
          className={
            changed
              ? "text-phosphor [text-shadow:0_0_5px_var(--phosphor-glow)]"
              : "text-silk-hi"
          }
        />
      </td>
      {numbers ? (
        <>
          <td className="pr-3 text-right font-mono text-xs text-silk-2 tabular-nums">
            {signed(value)}
          </td>
          <td className="pr-3 text-right font-mono text-xs text-silk-3 tabular-nums">
            {value !== signed(value) ? value : ""}
          </td>
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

  return (
    <Panel aria-labelledby="registers-title">
      <PanelHeader title={m.registers()} titleId="registers-title">
        <span className="text-xs text-silk-2">{m.registers_hint()}</span>
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
              <th scope="col">{m.column_signed()}</th>
              <th scope="col">{m.column_unsigned()}</th>
              <th scope="col">{m.column_note()}</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.regs.map((value, i) => (
              <RegisterRow
                key={`R${i}`}
                name={`R${i}` as RegisterName}
                value={value}
                numbers
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
