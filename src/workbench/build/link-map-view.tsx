import { m } from "@/paraglide/messages";

import { EmptyHint } from "../debug/shared";
import { hex } from "../lib/format";
import { useAssembly, useWorkbench } from "../workbench-provider";

/** Where the last build put each module, in placement order. */
export function LinkMapView() {
  const { tabs } = useWorkbench();
  const { image } = useAssembly();
  if (!image) return <EmptyHint>{m.link_map_empty()}</EmptyHint>;

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-screen text-left text-silk-2">
          <tr>
            <th scope="col" className="px-4 py-1.5 font-medium">
              {m.column_file()}
            </th>
            <th scope="col" className="py-1.5 font-medium">
              {m.column_addresses()}
            </th>
            <th scope="col" className="py-1.5 pr-4 font-medium">
              {m.column_labels()}
            </th>
          </tr>
        </thead>
        <tbody>
          {image.map.map((entry, i) => (
            <tr
              key={entry.file}
              className="border-t border-screen-line align-top text-silk"
            >
              <td className="px-4 py-1.5">
                <button
                  type="button"
                  onClick={() => tabs.show(entry.file)}
                  className="rounded-[3px] font-mono text-silk-hi outline-none hover:underline focus-visible:ring-2 focus-visible:ring-phosphor/70"
                >
                  {entry.file}
                </button>
                {i === 0 && (
                  <span className="ml-2 rounded-full bg-phosphor/15 px-1.5 text-[10.5px] text-phosphor">
                    {m.file_entry_badge()}
                  </span>
                )}
              </td>
              <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                {entry.end < entry.start && entry.start - entry.end === 1
                  ? m.link_map_no_words({ start: hex(entry.start) })
                  : `${hex(entry.start)}–${hex(entry.end)}`}
              </td>
              <td className="py-1.5 pr-4">
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
                  {entry.symbols.map(({ name, addr }) => (
                    <span key={name} className="whitespace-nowrap">
                      <span className="text-code-label">{name}</span>{" "}
                      <span className="text-silk-2">{hex(addr)}</span>
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
