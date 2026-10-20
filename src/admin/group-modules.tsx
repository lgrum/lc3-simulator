import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import type { Group } from "@/server/groups";
import type {
  ModuleSummary,
  VersionSource,
  VersionSummary,
} from "@/server/modules";
import {
  getVersionSourceFn,
  listGroupModulesFn,
  listVersionsFn,
} from "@/server/modules.functions";
import { Panel, PanelHeader } from "@/workbench/ui/surfaces";
import { ScrollArea } from "@/components/ui/scroll-area";

type Load<T> =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; value: T };

/** Runs `load` whenever `key` changes; stale answers are dropped. */
function useLoad<T>(key: unknown, load: () => Promise<T>): Load<T> {
  const [result, setResult] = useState<{ key: unknown; load: Load<T> }>({
    key,
    load: { state: "loading" },
  });
  useEffect(() => {
    let current = true;
    load().then(
      (value) => current && setResult({ key, load: { state: "ready", value } }),
      () => current && setResult({ key, load: { state: "failed" } }),
    );
    return () => {
      current = false;
    };
    // `load` is a new function every render; `key` says when to run it.
  }, [key]);
  return result.key === key ? result.load : { state: "loading" };
}

function date(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Status({ load }: { load: Load<unknown> }) {
  if (load.state === "loading")
    return <p className="px-3 py-2 text-silk-2">{m.modules_loading()}</p>;
  if (load.state === "failed")
    return <p className="px-3 py-2 text-error">{m.modules_failed()}</p>;
  return null;
}

/** One module's versions; picking one shows its source. */
function ModuleVersions({
  module,
  selected,
  onSelect,
}: {
  module: ModuleSummary;
  selected: number | null;
  onSelect: (versionId: number) => void;
}) {
  const versions = useLoad(module.id, () =>
    listVersionsFn({ data: { moduleId: module.id } }),
  );
  if (versions.state !== "ready") return <Status load={versions} />;
  return (
    <ul className="pb-1">
      {versions.value.map((version: VersionSummary) => (
        <li key={version.id}>
          <button
            type="button"
            aria-pressed={selected === version.id}
            onClick={() => onSelect(version.id)}
            className={cn(
              "flex w-full items-center gap-3 py-0.5 pr-3 pl-8 text-left outline-none hover:bg-tint/5 focus-visible:ring-2 focus-visible:ring-phosphor/70",
              selected === version.id && "bg-phosphor/10 text-silk-hi",
            )}
          >
            <span className="w-10 font-mono">v{version.number}</span>
            <span className="text-silk-2">{date(version.createdAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A version's source, read-only, with line numbers. */
function SourceView({ versionId }: { versionId: number }) {
  const source = useLoad<VersionSource>(versionId, () =>
    getVersionSourceFn({ data: { versionId } }),
  );
  if (source.state !== "ready") return <Status load={source} />;
  const lines = source.value.source.replace(/\n$/, "").split("\n");
  return (
    <figure className="flex min-h-0 flex-col">
      <figcaption className="border-b border-edge px-3 py-1.5 font-mono text-silk-hi">
        {m.admin_source_caption({
          module: source.value.module,
          version: source.value.number,
        })}
        <span className="ml-2 text-silk-2">{m.editor_read_only()}</span>
      </figcaption>
      <ScrollArea clampContentMinWidth={false} className="flex-1 bg-screen">
        <pre className="w-max min-w-full py-2 font-mono text-[12.5px] leading-5 text-silk">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="w-10 flex-none pr-3 text-right text-silk-2 select-none">
                {i + 1}
              </span>
              <code className="whitespace-pre">{line}</code>
            </div>
          ))}
        </pre>
      </ScrollArea>
    </figure>
  );
}

/** A group's published modules, their versions and sources. Admins only. */
export function GroupModules({ group }: { group: Group }) {
  const modules = useLoad(group.userId, () =>
    listGroupModulesFn({ data: { userId: group.userId } }),
  );
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);

  const toggle = (id: number) => {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    setExpanded(next);
  };

  return (
    <Panel>
      <PanelHeader
        title={m.admin_group_modules({
          number: group.number,
          name: group.name,
        })}
      />
      <div className="grid min-h-0 grid-cols-[minmax(0,16rem)_minmax(0,1fr)] max-md:grid-cols-1">
        <div className="border-r border-edge py-1 max-md:border-r-0 max-md:border-b">
          {modules.state !== "ready" ? (
            <Status load={modules} />
          ) : modules.value.length === 0 ? (
            <p className="px-3 py-2 text-silk-2">
              {m.admin_group_no_modules()}
            </p>
          ) : (
            <ul>
              {modules.value.map((module) => (
                <li key={module.id}>
                  <button
                    type="button"
                    aria-expanded={expanded.has(module.id)}
                    onClick={() => toggle(module.id)}
                    className="flex w-full items-center gap-2 px-3 py-1 text-left outline-none hover:bg-tint/5 focus-visible:ring-2 focus-visible:ring-phosphor/70"
                  >
                    <ChevronRightIcon
                      aria-hidden
                      className={cn(
                        "size-3.5 transition-transform",
                        expanded.has(module.id) && "rotate-90",
                      )}
                    />
                    <span className="font-mono text-silk-hi">
                      {module.name}
                    </span>
                    <span className="text-silk-2">
                      {m.modules_latest({ version: module.latest })}
                    </span>
                  </button>
                  {expanded.has(module.id) && (
                    <ModuleVersions
                      module={module}
                      selected={selected}
                      onSelect={setSelected}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-h-64">
          {selected === null ? (
            <p className="px-3 py-2 text-silk-2">{m.admin_pick_version()}</p>
          ) : (
            <SourceView versionId={selected} />
          )}
        </div>
      </div>
    </Panel>
  );
}
