import { ChevronRightIcon, FileIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { groupModuleName } from "@/server/modules";
import type { ModuleSummary, PublishedGroup } from "@/server/modules";

import { previewId } from "../lib/editor-tabs";
import { useAccount, useEditorTabs, useWorkbench } from "../workbench-provider";

type Load =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; groups: Array<PublishedGroup> };

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-phosphor/70";

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRightIcon
      aria-hidden
      className={cn("size-3.5 transition-transform", open && "rotate-90")}
    />
  );
}

/**
 * Other groups' published modules, under the project's files. Each opens
 * read-only in the editor at its latest version; a build reaches it by its
 * `g<n>_` name, e.g. `.EXTERNAL G7_TRIG-SIN`. Loads when first expanded.
 */
export function OtherGroups({ onOpenFile }: { onOpenFile?: () => void }) {
  const workbench = useWorkbench();
  const { viewer } = useAccount();
  const { chosen } = useEditorTabs();
  const [expanded, setExpanded] = useState(false);
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const [openGroups, setOpenGroups] = useState<ReadonlySet<number>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  if (!viewer) return null;

  const refresh = () => {
    setLoad({ state: "loading" });
    workbench.modules.listGroups().then(
      (groups) => setLoad({ state: "ready", groups }),
      () => setLoad({ state: "failed" }),
    );
  };

  const toggle = () => {
    if (!expanded && load.state === "idle") refresh();
    setExpanded(!expanded);
  };

  const toggleGroup = (number: number) => {
    const next = new Set(openGroups);
    if (!next.delete(number)) next.add(number);
    setOpenGroups(next);
  };

  const openModule = async (group: number, module: ModuleSummary) => {
    setProblem(null);
    try {
      const [latest] = await workbench.modules.listVersions(module.id);
      const { number, source } = await workbench.modules.getSource(latest.id);
      workbench.tabs.preview({
        name: `${groupModuleName(group, module.name)}.asm`,
        version: number,
        source,
      });
      onOpenFile?.();
    } catch {
      setProblem(m.other_groups_open_failed({ module: module.name }));
    }
  };

  let body: React.ReactNode;
  if (load.state === "loading" || load.state === "idle")
    body = <Note>{m.modules_loading()}</Note>;
  else if (load.state === "failed")
    body = <Note>{m.other_groups_failed()}</Note>;
  else if (load.groups.length === 0)
    body = <Note>{m.other_groups_empty()}</Note>;
  else
    body = (
      <SidebarMenu className="gap-0.5">
        {load.groups.map((group) => {
          const open = openGroups.has(group.number);
          return (
            <SidebarMenuItem key={group.number}>
              <SidebarMenuButton
                size="sm"
                aria-expanded={open}
                onClick={() => toggleGroup(group.number)}
                className="text-xs text-silk-2"
              >
                <Chevron open={open} />
                <span className="truncate">
                  {m.other_groups_group({
                    number: group.number,
                    name: group.name,
                  })}
                </span>
              </SidebarMenuButton>
              {open && (
                <SidebarMenu className="gap-0.5">
                  {group.modules.map((module) => {
                    const name = groupModuleName(group.number, module.name);
                    const id = previewId(`${name}.asm`);
                    return (
                      <SidebarMenuItem key={module.id}>
                        <SidebarMenuButton
                          size="sm"
                          isActive={chosen?.file === id}
                          title={m.other_groups_module_hint({
                            module: name,
                            version: module.latest,
                          })}
                          onClick={() => void openModule(group.number, module)}
                          className="pr-10 pl-8 font-mono text-[12.5px]"
                        >
                          <FileIcon aria-hidden className="size-3.5" />
                          <span className="truncate">{name}</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge className="right-2 font-mono text-[10.5px] text-silk-2">
                          v{module.latest}
                        </SidebarMenuBadge>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    );

  return (
    <SidebarGroup className="flex-none border-t border-edge px-1.5 py-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={toggle}
          className={cn(
            "flex h-7 flex-1 items-center gap-1.5 rounded-[4px] px-1.5 text-left text-[12px] font-semibold text-silk-hi hover:bg-tint/4",
            focusRing,
          )}
        >
          <Chevron open={expanded} />
          {m.other_groups_title()}
        </button>
        {expanded && (
          <button
            type="button"
            aria-label={m.other_groups_refresh()}
            title={m.other_groups_refresh()}
            onClick={refresh}
            className={cn(
              "grid size-6 place-items-center rounded-[4px] text-silk-2 hover:bg-tint/6 hover:text-silk",
              focusRing,
            )}
          >
            <RefreshCwIcon aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
      {expanded && (
        <>
          {problem && (
            <p role="alert" className="px-2 py-1 text-xs text-error">
              {problem}
            </p>
          )}
          {body}
        </>
      )}
    </SidebarGroup>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-1 text-xs text-silk-2">{children}</p>;
}
