import { useState } from "react";

import type { WatchKind } from "@/lib/simulator/controller";
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
  inputClass,
} from "./shared";

const KINDS: Record<WatchKind, () => string> = {
  write: m.watch_write,
  read: m.watch_read,
  rw: m.watch_rw,
};

function AddWatchpoint() {
  const { machine } = useWorkbench();
  const [where, setWhere] = useState("");
  const [kind, setKind] = useState<WatchKind>("write");
  const [error, setError] = useState<string>();

  return (
    <form
      aria-label={m.watchpoint_add_form()}
      className="flex flex-wrap items-start gap-3 border-b border-screen-line px-4 py-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        const addr = resolveAddress(where, (name) =>
          machine.lookupSymbol(name),
        );
        if (addr === undefined) return setError(m.error_no_address());
        machine.watchpoints.add(addr, kind);
        setError(undefined);
        setWhere("");
      }}
    >
      <Field
        label={m.field_where()}
        placeholder="x3007 / COUNT"
        value={where}
        error={error}
        onChange={(event) => setWhere(event.currentTarget.value)}
        required
        className="w-36"
      />
      <label className="flex flex-col gap-1 text-xs text-silk-2">
        {m.field_watch_kind()}
        <select
          value={kind}
          onChange={(event) => setKind(event.currentTarget.value as WatchKind)}
          className={inputClass}
        >
          {Object.entries(KINDS).map(([value, label]) => (
            <option key={value} value={value}>
              {label()}
            </option>
          ))}
        </select>
      </label>
      <span className="flex flex-col gap-1 self-stretch">
        <span aria-hidden className="text-xs">
          &nbsp;
        </span>
        <AddButton>{m.watchpoint_add_button()}</AddButton>
      </span>
    </form>
  );
}

export function WatchpointsView() {
  const { machine } = useWorkbench();
  const watchpoints = useMachineRead((reader) =>
    reader.watchpoints.list().map((watch) => ({
      ...watch,
      where: describeAddress(reader, watch.addr),
    })),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AddWatchpoint />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {watchpoints.length === 0 ? (
          <EmptyHint>{m.watchpoints_empty()}</EmptyHint>
        ) : (
          <ul aria-label={m.watchpoints()}>
            {watchpoints.map((watch) => (
              <li
                key={watch.id}
                className="flex items-center gap-4 border-t border-screen-line px-4 py-1 text-xs text-silk"
              >
                <Location {...watch.where} />
                <span className="text-silk-2">{KINDS[watch.kind]()}</span>
                <span className="ml-auto">
                  <RemoveButton
                    label={m.watchpoint_remove({ addr: watch.where.address })}
                    onClick={() => machine.watchpoints.remove(watch.id)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
