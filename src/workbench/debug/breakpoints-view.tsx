import { useState } from "react";

import { m } from "@/paraglide/messages";

import { resolveAddress } from "../lib/format";
import { useMachineRead, useWorkbench } from "../workbench-provider";
import {
  AddButton,
  EmptyHint,
  Field,
  Location,
  RemoveButton,
  describeAddress,
} from "./shared";

type Errors = { where?: string; condition?: string; hitCount?: string };

function AddBreakpoint() {
  const { machine } = useWorkbench();
  const [where, setWhere] = useState("");
  const [condition, setCondition] = useState("");
  const [hitCount, setHitCount] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const add = () => {
    const addr = resolveAddress(where, (name) => machine.lookupSymbol(name));
    if (addr === undefined) return setErrors({ where: m.error_no_address() });
    const hits = hitCount.trim() === "" ? undefined : Number(hitCount);
    try {
      machine.breakpoints.add(addr, {
        condition: condition.trim() || undefined,
        hitCount: hits,
      });
    } catch (error) {
      if (error instanceof SyntaxError)
        return setErrors({ condition: m.error_condition() });
      if (error instanceof RangeError)
        return setErrors({ hitCount: m.error_hit_count() });
      throw error;
    }
    setErrors({});
    setWhere("");
    setCondition("");
    setHitCount("");
  };

  return (
    <form
      aria-label={m.breakpoint_add_form()}
      className="flex flex-wrap items-start gap-3 border-b border-screen-line px-4 py-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <Field
        label={m.field_where()}
        placeholder="x3000 / LOOP"
        value={where}
        error={errors.where}
        onChange={(event) => setWhere(event.currentTarget.value)}
        required
        className="w-36"
      />
      <Field
        label={m.field_condition()}
        placeholder="R0 == x41 && P"
        value={condition}
        error={errors.condition}
        onChange={(event) => setCondition(event.currentTarget.value)}
        className="min-w-48 flex-1"
      />
      <Field
        label={m.field_hit_count()}
        placeholder="1"
        inputMode="numeric"
        value={hitCount}
        error={errors.hitCount}
        onChange={(event) => setHitCount(event.currentTarget.value)}
        className="w-28"
      />
      <span className="flex flex-col gap-1 self-stretch">
        <span aria-hidden className="text-xs">
          &nbsp;
        </span>
        <AddButton>{m.breakpoint_add_button()}</AddButton>
      </span>
    </form>
  );
}

export function BreakpointsView() {
  const { machine } = useWorkbench();
  const breakpoints = useMachineRead((reader) =>
    reader.breakpoints.list().map((point) => ({
      ...point,
      where: describeAddress(reader, point.addr),
    })),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AddBreakpoint />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {breakpoints.length === 0 ? (
          <EmptyHint>{m.breakpoints_empty()}</EmptyHint>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-silk-2">
              <tr>
                <th scope="col" className="w-10 px-4 py-1.5 font-medium">
                  <span className="sr-only">{m.column_enabled()}</span>
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  {m.column_location()}
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  {m.field_condition()}
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  {m.column_stops()}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {m.column_hits()}
                </th>
                <th scope="col" className="w-12">
                  <span className="sr-only">{m.column_remove()}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {breakpoints.map((point) => (
                <tr
                  key={point.id}
                  className="border-t border-screen-line text-silk aria-disabled:text-silk-3"
                  aria-disabled={!point.enabled}
                >
                  <td className="px-4 py-1">
                    <input
                      type="checkbox"
                      aria-label={m.breakpoint_enable({
                        addr: point.where.address,
                      })}
                      checked={point.enabled}
                      onChange={(event) =>
                        machine.breakpoints.setEnabled(
                          point.id,
                          event.currentTarget.checked,
                        )
                      }
                      className="size-3.5 accent-[var(--lamp)]"
                    />
                  </td>
                  <td className="py-1">
                    <Location {...point.where} />
                  </td>
                  <td className="py-1 font-mono">
                    {point.condition ?? (
                      <span className="text-silk-3">
                        {m.condition_always()}
                      </span>
                    )}
                  </td>
                  <td className="py-1">
                    {point.hitCount === undefined
                      ? m.stops_every_hit()
                      : m.stops_from_hit({ count: point.hitCount })}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums">
                    {point.hits}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <RemoveButton
                      label={m.breakpoint_remove({ addr: point.where.address })}
                      onClick={() => machine.breakpoints.remove(point.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
