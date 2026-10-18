import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { m } from "@/paraglide/messages";
import type { ModuleSummary, VersionSummary } from "@/server/modules";

import { writeFile } from "../actions";
import { EmptyHint } from "../debug/shared";
import { downloadFile } from "../files/shared";
import { restorePath } from "../lib/published-modules";
import { useAskDialog } from "../ui/ask-dialog";
import type { Question } from "../ui/ask-dialog";
import { useAccount, useWorkbench } from "../workbench-provider";

type Load<T> =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; value: T };

function date(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[4px] px-2 py-0.5 text-xs text-silk-2 outline-none hover:bg-tint/5 hover:text-silk focus-visible:ring-2 focus-visible:ring-phosphor/70"
    >
      {children}
    </button>
  );
}

/** A module's versions, newest first, to download or restore. */
function Versions({
  module,
  ask,
}: {
  module: ModuleSummary;
  ask: (question: Question) => Promise<boolean>;
}) {
  const workbench = useWorkbench();
  const [versions, setVersions] = useState<Load<Array<VersionSummary>>>({
    state: "loading",
  });

  useEffect(() => {
    let current = true;
    workbench.modules.listVersions(module.id).then(
      (value) => current && setVersions({ state: "ready", value }),
      () => current && setVersions({ state: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [workbench, module.id, module.latest]);

  const download = async (version: VersionSummary) => {
    const { source } = await workbench.modules.getSource(version.id);
    downloadFile(`${module.name}.asm`, source);
  };

  const restore = async (version: VersionSummary) => {
    const { source } = await workbench.modules.getSource(version.id);
    // Into a local file: lib/ holds read-only copies from the server.
    const target = restorePath(
      [...workbench.project.getProject().files.keys()].filter(
        (path) => !workbench.project.isRemote(path),
      ),
      module.name,
    );
    if (
      target.exists &&
      !(await ask({
        title: m.modules_restore_confirm({
          file: target.path,
          version: version.number,
        }),
        confirm: m.dialog_replace(),
        destructive: true,
      }))
    )
      return;
    writeFile(workbench, target.path, source);
  };

  if (versions.state === "loading")
    return <p className="px-8 py-1 text-silk-2">{m.modules_loading()}</p>;
  if (versions.state === "failed")
    return <p className="px-8 py-1 text-error">{m.modules_failed()}</p>;
  return (
    <ul>
      {versions.value.map((version) => (
        <li
          key={version.id}
          className="flex items-center gap-3 py-0.5 pr-4 pl-8 hover:bg-tint/3"
        >
          <span className="w-10 font-mono text-silk-hi">v{version.number}</span>
          <span className="text-silk-2">{date(version.createdAt)}</span>
          <span className="ml-auto flex gap-1">
            <ActionButton onClick={() => void download(version)}>
              {m.modules_download()}
            </ActionButton>
            <ActionButton onClick={() => void restore(version)}>
              {m.modules_restore()}
            </ActionButton>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The viewer's published modules and their versions. */
export function MyModulesView() {
  const workbench = useWorkbench();
  const { viewer, published } = useAccount();
  const { ask, dialog } = useAskDialog();
  const [modules, setModules] = useState<Load<Array<ModuleSummary>>>({
    state: "loading",
  });
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    let current = true;
    workbench.modules.listMine().then(
      (value) => current && setModules({ state: "ready", value }),
      () => current && setModules({ state: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [workbench, viewer, published]);

  if (modules.state === "loading")
    return <EmptyHint>{m.modules_loading()}</EmptyHint>;
  if (modules.state === "failed")
    return <EmptyHint>{m.modules_failed()}</EmptyHint>;
  if (modules.value.length === 0)
    return <EmptyHint>{m.modules_empty()}</EmptyHint>;

  const toggle = (id: number) => {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    setExpanded(next);
  };

  return (
    <div className="h-full overflow-y-auto py-1 text-xs">
      <ul>
        {modules.value.map((module) => (
          <li key={module.id}>
            <button
              type="button"
              aria-expanded={expanded.has(module.id)}
              onClick={() => toggle(module.id)}
              className="flex w-full items-center gap-2 px-3 py-1 text-left outline-none hover:bg-tint/3 focus-visible:ring-2 focus-visible:ring-phosphor/70"
            >
              <ChevronRightIcon
                aria-hidden
                className={`size-3.5 transition-transform ${expanded.has(module.id) ? "rotate-90" : ""}`}
              />
              <span className="font-mono text-silk-hi">{module.name}</span>
              <span className="text-silk-2">
                {m.modules_latest({ version: module.latest })}
              </span>
              <span className="ml-auto text-silk-2">
                {date(module.updatedAt)}
              </span>
            </button>
            {expanded.has(module.id) && <Versions module={module} ask={ask} />}
          </li>
        ))}
      </ul>
      {dialog}
    </div>
  );
}
