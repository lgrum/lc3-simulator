import { FileIcon, FilePlusIcon, FolderIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarContext,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { SidebarContextProps } from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";

import { deleteFile, writeFile } from "../actions";
import {
  baseName,
  fileNameProblem,
  joinPath,
  toFileName,
} from "../lib/file-names";
import type { FileNameProblem } from "../lib/file-names";
import { NEW_FILE_TEXT, nameProblemText } from "./shared";
import { inputClass } from "../debug/shared";
import { useEditorTabs, useProject, useWorkbench } from "../workbench-provider";

/** Always expanded: the workbench places the sidebar itself. */
const STATIC_SIDEBAR: SidebarContextProps = {
  state: "expanded",
  open: true,
  setOpen: () => {},
  openMobile: false,
  setOpenMobile: () => {},
  isMobile: false,
  toggleSidebar: () => {},
};

type Row =
  | { kind: "folder"; path: string; depth: number }
  | { kind: "file"; path: string; depth: number };

/** Folders and files in tree order: each folder, then what is inside it. */
function treeRows(
  files: Iterable<string>,
  folders: Iterable<string>,
): Array<Row> {
  const rows: Array<Row> = [];
  const allFolders = [...folders];
  const allFiles = [...files];
  const childrenOf = (parent: string) => {
    const inside = (path: string) =>
      parent === ""
        ? !path.includes("/")
        : path.startsWith(parent + "/") &&
          !path.slice(parent.length + 1).includes("/");
    return {
      folders: allFolders.filter(inside).sort(),
      files: allFiles.filter(inside).sort(),
    };
  };
  const visit = (parent: string, depth: number) => {
    const children = childrenOf(parent);
    for (const folder of children.folders) {
      rows.push({ kind: "folder", path: folder, depth });
      visit(folder, depth + 1);
    }
    for (const file of children.files)
      rows.push({ kind: "file", path: file, depth });
  };
  visit("", 0);
  return rows;
}

function NewFileForm({ onDone }: { onDone: () => void }) {
  const workbench = useWorkbench();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<FileNameProblem | null>(null);
  const errorId = useId();

  const create = () => {
    const files = workbench.project.getProject().files;
    const found = fileNameProblem(name, "", files);
    if (found) return setProblem(found);
    writeFile(workbench, joinPath("", toFileName(name)), NEW_FILE_TEXT);
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-1 px-2 pb-2"
      onSubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-silk-2">
        {m.file_name_label()}
        <input
          autoFocus
          value={name}
          placeholder="trig.asm"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={problem !== null}
          aria-describedby={problem ? errorId : undefined}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onDone();
          }}
          className={inputClass}
        />
      </label>
      {problem && (
        <span id={errorId} role="alert" className="text-xs text-error">
          {nameProblemText(problem, name)}
        </span>
      )}
    </form>
  );
}

export function FileSidebar() {
  const workbench = useWorkbench();
  const { files, folders, entry } = useProject();
  const { chosen } = useEditorTabs();
  const [creating, setCreating] = useState(false);

  return (
    <SidebarContext value={STATIC_SIDEBAR}>
      <Sidebar
        collapsible="none"
        aria-label={m.files_title()}
        className="w-full rounded-[7px] border border-edge"
      >
        <SidebarHeader className="flex-row items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
          <h2 className="text-[13.5px] font-semibold text-silk-hi">
            {m.files_title()}
          </h2>
          <button
            type="button"
            aria-label={m.file_new()}
            title={m.file_new()}
            aria-expanded={creating}
            onClick={() => setCreating((open) => !open)}
            className="grid size-6 place-items-center rounded-[4px] text-silk-2 outline-none hover:bg-tint/6 hover:text-silk focus-visible:ring-2 focus-visible:ring-phosphor/70"
          >
            <FilePlusIcon aria-hidden className="size-3.5" />
          </button>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-1.5 py-1.5">
            {creating && <NewFileForm onDone={() => setCreating(false)} />}
            <SidebarMenu className="gap-0.5">
              {treeRows(files.keys(), folders).map((row) => (
                <SidebarMenuItem key={`${row.kind}:${row.path}`}>
                  {row.kind === "folder" ? (
                    <div
                      className="flex h-7 items-center gap-2 px-2 text-xs text-silk-2"
                      style={{ paddingLeft: 8 + row.depth * 12 }}
                    >
                      <FolderIcon aria-hidden className="size-3.5" />
                      {baseName(row.path)}
                    </div>
                  ) : (
                    <>
                      <SidebarMenuButton
                        size="sm"
                        isActive={chosen?.file === row.path}
                        title={row.path}
                        onClick={() => workbench.tabs.show(row.path)}
                        style={{ paddingLeft: 8 + row.depth * 12 }}
                        className="pr-14 font-mono text-[12.5px]"
                      >
                        <FileIcon aria-hidden className="size-3.5" />
                        <span>{baseName(row.path)}</span>
                      </SidebarMenuButton>
                      {row.path === entry ? (
                        <SidebarMenuBadge
                          title={m.file_entry_hint()}
                          className="right-1.5 rounded-full bg-phosphor/15 px-1.5 text-[10.5px] text-phosphor"
                        >
                          {m.file_entry_badge()}
                        </SidebarMenuBadge>
                      ) : (
                        <SidebarMenuAction
                          showOnHover
                          aria-label={m.file_delete({ file: row.path })}
                          title={m.file_delete({ file: row.path })}
                          onClick={() => {
                            if (
                              window.confirm(
                                m.file_delete_confirm({ file: row.path }),
                              )
                            )
                              deleteFile(workbench, row.path);
                          }}
                          className="top-1! hover:text-error"
                        >
                          <Trash2Icon aria-hidden className="size-3.5" />
                        </SidebarMenuAction>
                      )}
                    </>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarContext>
  );
}
