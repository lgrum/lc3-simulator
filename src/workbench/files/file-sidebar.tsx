import {
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PackageIcon,
  UploadIcon,
} from "lucide-react";
import { Fragment, useId, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubPopup,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import { Sheet, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";

import { deleteFile, deleteFolder, movePath, writeFile } from "../actions";
import { inputClass } from "../debug/shared";
import {
  baseName,
  fileNameProblem,
  folderNameProblem,
  folderOf,
  joinPath,
  toFileName,
} from "../lib/file-names";
import type { Project } from "../lib/project-store";
import { zipProject } from "../lib/project-zip";
import { useEditorTabs, useProject, useWorkbench } from "../workbench-provider";
import type { Workbench } from "../workbench-provider";
import { NEW_FILE_TEXT, downloadFile, nameProblemText } from "./shared";

const DRAG_TYPE = "application/x-lc3-path";
const ZIP_NAME = "lc3-project.zip";

type Row = { kind: "folder" | "file"; path: string; depth: number };

/** Folders and files in tree order: each folder, then what is inside it. */
export function treeRows(
  files: Iterable<string>,
  folders: Iterable<string>,
): Array<Row> {
  const rows: Array<Row> = [];
  const allFolders = [...folders];
  const allFiles = [...files];
  const inside = (parent: string) => (path: string) =>
    parent === ""
      ? !path.includes("/")
      : path.startsWith(parent + "/") &&
        !path.slice(parent.length + 1).includes("/");
  const visit = (parent: string, depth: number) => {
    for (const folder of allFolders.filter(inside(parent)).sort()) {
      rows.push({ kind: "folder", path: folder, depth });
      visit(folder, depth + 1);
    }
    for (const file of allFiles.filter(inside(parent)).sort())
      rows.push({ kind: "file", path: file, depth });
  };
  visit("", 0);
  return rows;
}

/** What is being named inline: a new file or folder, or a rename. */
type Editing =
  | { kind: "new-file" | "new-folder"; folder: string }
  | { kind: "rename"; path: string; isFolder: boolean };

type Action =
  | {
      label: string;
      run: () => void;
      disabled?: boolean;
      destructive?: boolean;
    }
  | { label: string; choices: Array<{ label: string; run: () => void }> }
  | "separator";

function MenuActions({ actions }: { actions: ReadonlyArray<Action> }) {
  return actions.map((action, i) => {
    if (action === "separator") return <MenuSeparator key={i} />;
    if ("choices" in action)
      return (
        <MenuSub key={i}>
          <MenuSubTrigger>{action.label}</MenuSubTrigger>
          <MenuSubPopup>
            {action.choices.map((choice) => (
              <MenuItem key={choice.label} onClick={choice.run}>
                {choice.label}
              </MenuItem>
            ))}
          </MenuSubPopup>
        </MenuSub>
      );
    return (
      <MenuItem
        key={i}
        onClick={action.run}
        disabled={action.disabled}
        variant={action.destructive ? "destructive" : "default"}
      >
        {action.label}
      </MenuItem>
    );
  });
}

function ContextActions({ actions }: { actions: ReadonlyArray<Action> }) {
  return actions.map((action, i) => {
    if (action === "separator") return <ContextMenuSeparator key={i} />;
    if ("choices" in action)
      return (
        <ContextMenuSub key={i}>
          <ContextMenuSubTrigger>{action.label}</ContextMenuSubTrigger>
          <ContextMenuSubPopup>
            {action.choices.map((choice) => (
              <ContextMenuItem key={choice.label} onClick={choice.run}>
                {choice.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubPopup>
        </ContextMenuSub>
      );
    return (
      <ContextMenuItem
        key={i}
        onClick={action.run}
        disabled={action.disabled}
        variant={action.destructive ? "destructive" : "default"}
      >
        {action.label}
      </ContextMenuItem>
    );
  });
}

/** Moves a file or folder into `folder`, keeping its name. */
function moveInto(workbench: Workbench, path: string, folder: string) {
  const to = joinPath(folder, baseName(path));
  if (to === path || folder === path || folder.startsWith(path + "/")) return;
  const { files, folders } = workbench.project.getProject();
  if (files.has(to) || folders.has(to)) {
    window.alert(m.name_error_exists({ file: baseName(path) }));
    return;
  }
  movePath(workbench, path, to);
}

/** Where `path` can move to: the root and every folder outside it. */
function moveChoices(
  workbench: Workbench,
  project: Project,
  path: string,
): Array<{ label: string; run: () => void }> {
  return ["", ...[...project.folders].sort()]
    .filter(
      (folder) =>
        folder !== folderOf(path) &&
        folder !== path &&
        !folder.startsWith(path + "/"),
    )
    .map((folder) => ({
      label: folder === "" ? m.folder_root() : folder,
      run: () => moveInto(workbench, path, folder),
    }));
}

/** An inline name field: Enter saves, Escape cancels. */
function NameInput({
  label,
  initial,
  depth,
  onSubmit,
  onCancel,
}: {
  label: string;
  initial: string;
  depth: number;
  /** Returns why the name was refused, or null once it is used. */
  onSubmit: (name: string) => string | null;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const errorId = useId();
  const submit = () => {
    if (name.trim() === "" || name === initial) return onCancel();
    setProblem(onSubmit(name));
  };
  return (
    <form
      className="flex flex-col gap-1 py-0.5 pr-2"
      style={{ paddingLeft: 8 + depth * 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        aria-label={label}
        value={name}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={problem !== null}
        aria-describedby={problem ? errorId : undefined}
        onFocus={(event) => {
          // Select the name without .asm, as file managers do.
          const end = event.currentTarget.value.search(/\.asm$/i);
          event.currentTarget.setSelectionRange(0, end < 0 ? null : end);
        }}
        onChange={(event) => {
          setName(event.currentTarget.value);
          setProblem(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (name.trim() === "" || name === initial) onCancel();
        }}
        className={inputClass}
      />
      {problem && (
        <span id={errorId} role="alert" className="text-xs text-error">
          {problem}
        </span>
      )}
    </form>
  );
}

function RowMenu({
  label,
  actions,
}: {
  label: string;
  actions: Array<Action>;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <SidebarMenuAction
            showOnHover
            aria-label={label}
            title={label}
            className="top-1!"
          />
        }
      >
        <MoreHorizontalIcon aria-hidden className="size-3.5" />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuActions actions={actions} />
      </MenuPopup>
    </Menu>
  );
}

function FilesContent({ onOpenFile }: { onOpenFile?: () => void }) {
  const workbench = useWorkbench();
  const project = useProject();
  const { files, folders, entry } = project;
  const { chosen } = useEditorTabs();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const uploadFolder = useRef("");

  const open = (path: string) => {
    workbench.tabs.show(path);
    onOpenFile?.();
  };

  const startUpload = (folder: string) => {
    uploadFolder.current = folder;
    upload.current?.click();
  };

  const addUploads = async (list: FileList) => {
    const folder = uploadFolder.current;
    for (const file of Array.from(list)) {
      const current = workbench.project.getProject().files;
      const problem = fileNameProblem(file.name, folder, current);
      const path = joinPath(folder, toFileName(file.name));
      if (problem === "exists") {
        if (!window.confirm(m.file_replace_one_confirm({ file: path })))
          continue;
      } else if (problem) {
        window.alert(
          m.upload_skipped({
            file: file.name,
            reason: nameProblemText(problem, toFileName(file.name)),
          }),
        );
        continue;
      }
      writeFile(workbench, path, await file.text());
    }
  };

  const fileActions = (path: string): Array<Action> => [
    { label: m.file_open_tab(), run: () => open(path) },
    {
      label: m.file_rename(),
      run: () => setEditing({ kind: "rename", path, isFolder: false }),
    },
    { label: m.file_move_to(), choices: moveChoices(workbench, project, path) },
    {
      label: m.file_set_entry(),
      run: () => workbench.project.setEntry(path),
      disabled: path === entry,
    },
    {
      label: m.file_download(),
      run: () => downloadFile(baseName(path), files.get(path) ?? ""),
    },
    "separator",
    {
      label: m.file_delete({ file: baseName(path) }),
      disabled: path === entry,
      destructive: true,
      run: () => {
        if (window.confirm(m.file_delete_confirm({ file: path })))
          deleteFile(workbench, path);
      },
    },
  ];

  const folderActions = (path: string): Array<Action> => [
    {
      label: m.file_new_here(),
      run: () => setEditing({ kind: "new-file", folder: path }),
    },
    {
      label: m.folder_new_here(),
      run: () => setEditing({ kind: "new-folder", folder: path }),
    },
    { label: m.file_upload_here(), run: () => startUpload(path) },
    {
      label: m.file_rename(),
      run: () => setEditing({ kind: "rename", path, isFolder: true }),
    },
    { label: m.file_move_to(), choices: moveChoices(workbench, project, path) },
    "separator",
    {
      label: m.file_delete({ file: path }),
      destructive: true,
      run: () => {
        if (entry.startsWith(path + "/")) {
          window.alert(m.folder_delete_entry({ folder: path, entry }));
          return;
        }
        const count = [...files.keys()].filter((file) =>
          file.startsWith(path + "/"),
        ).length;
        const question =
          count === 0
            ? m.folder_delete_empty_confirm({ folder: path })
            : m.folder_delete_confirm({ folder: path, count });
        if (window.confirm(question)) deleteFolder(workbench, path);
      },
    },
  ];

  const create = (kind: "new-file" | "new-folder", folder: string) =>
    function submit(name: string): string | null {
      const { files: current, folders: currentFolders } =
        workbench.project.getProject();
      if (kind === "new-file") {
        const problem = fileNameProblem(name, folder, current);
        if (problem) return nameProblemText(problem, toFileName(name));
        writeFile(workbench, joinPath(folder, toFileName(name)), NEW_FILE_TEXT);
        onOpenFile?.();
      } else {
        const taken = {
          has: (path: string) => current.has(path) || currentFolders.has(path),
        };
        const problem = folderNameProblem(name, folder, taken);
        if (problem) return nameProblemText(problem, name.trim());
        workbench.project.createFolder(joinPath(folder, name.trim()));
      }
      setEditing(null);
      return null;
    };

  const rename = (path: string, isFolder: boolean) =>
    function submit(name: string): string | null {
      const { files: current, folders: currentFolders } =
        workbench.project.getProject();
      const folder = folderOf(path);
      const taken = {
        has: (other: string) =>
          other !== path && (current.has(other) || currentFolders.has(other)),
      };
      const problem = isFolder
        ? folderNameProblem(name, folder, taken)
        : fileNameProblem(name, folder, taken);
      if (problem)
        return nameProblemText(
          problem,
          isFolder ? name.trim() : toFileName(name),
        );
      movePath(
        workbench,
        path,
        joinPath(folder, isFolder ? name.trim() : toFileName(name)),
      );
      setEditing(null);
      return null;
    };

  const dragProps = (path: string) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(DRAG_TYPE, path);
      event.dataTransfer.effectAllowed = "move";
    },
  });

  /** Makes a folder, or the root for "", a place to drop files on. */
  const dropProps = (folder: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(folder);
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (event: DragEvent) => {
      const path = event.dataTransfer.getData(DRAG_TYPE);
      setDropTarget(null);
      if (!path) return;
      event.preventDefault();
      event.stopPropagation();
      moveInto(workbench, path, folder);
    },
  });

  const newItemInput = (folder: string, depth: number): ReactNode =>
    editing && editing.kind !== "rename" && editing.folder === folder ? (
      <li>
        <NameInput
          label={
            editing.kind === "new-file"
              ? m.file_name_label()
              : m.folder_name_label()
          }
          initial=""
          depth={depth}
          onSubmit={create(editing.kind, folder)}
          onCancel={() => setEditing(null)}
        />
      </li>
    ) : null;

  const headerButton = (label: string, icon: ReactNode, run: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={run}
      className="grid size-6 place-items-center rounded-[4px] text-silk-2 outline-none hover:bg-tint/6 hover:text-silk focus-visible:ring-2 focus-visible:ring-phosphor/70"
    >
      {icon}
    </button>
  );

  return (
    <>
      <SidebarHeader className="flex-row items-center gap-1 border-b border-edge py-1.5 pr-2 pl-3">
        <h2 className="mr-auto text-[13.5px] font-semibold text-silk-hi">
          {m.files_title()}
        </h2>
        {headerButton(
          m.file_new(),
          <FilePlusIcon aria-hidden className="size-3.5" />,
          () => setEditing({ kind: "new-file", folder: "" }),
        )}
        {headerButton(
          m.file_new_folder(),
          <FolderPlusIcon aria-hidden className="size-3.5" />,
          () => setEditing({ kind: "new-folder", folder: "" }),
        )}
        {headerButton(
          m.file_upload(),
          <UploadIcon aria-hidden className="size-3.5" />,
          () => startUpload(""),
        )}
        {headerButton(
          m.file_download_zip(),
          <PackageIcon aria-hidden className="size-3.5" />,
          () =>
            downloadFile(
              ZIP_NAME,
              zipProject(workbench.project.getProject()),
              "application/zip",
            ),
        )}
        <input
          ref={upload}
          type="file"
          multiple
          accept=".asm,.txt,text/plain"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={async (event) => {
            const input = event.currentTarget;
            if (input.files) await addUploads(input.files);
            input.value = "";
          }}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup
          className="min-h-full px-1.5 py-1.5 data-[drop=true]:bg-tint/5"
          data-drop={dropTarget === ""}
          {...dropProps("")}
        >
          <SidebarMenu className="gap-0.5">
            {newItemInput("", 0)}
            {treeRows(files.keys(), folders).map((row) => {
              const isFolder = row.kind === "folder";
              if (editing?.kind === "rename" && editing.path === row.path)
                return (
                  <li key={row.path}>
                    <NameInput
                      label={m.new_name_label({ path: row.path })}
                      initial={baseName(row.path)}
                      depth={row.depth}
                      onSubmit={rename(row.path, isFolder)}
                      onCancel={() => setEditing(null)}
                    />
                  </li>
                );
              const actions = isFolder
                ? folderActions(row.path)
                : fileActions(row.path);
              return (
                <Fragment key={row.path}>
                  <SidebarMenuItem
                    className="data-[drop=true]:rounded-lg data-[drop=true]:bg-tint/8"
                    data-drop={isFolder && dropTarget === row.path}
                    {...(isFolder ? dropProps(row.path) : {})}
                  >
                    <ContextMenu>
                      <ContextMenuTrigger
                        render={
                          <SidebarMenuButton
                            size="sm"
                            isActive={!isFolder && chosen?.file === row.path}
                            title={row.path}
                            style={{ paddingLeft: 8 + row.depth * 12 }}
                            className={
                              isFolder
                                ? "pr-8 text-xs text-silk-2"
                                : "pr-16 font-mono text-[12.5px]"
                            }
                            onClick={() => {
                              if (!isFolder) open(row.path);
                            }}
                            {...dragProps(row.path)}
                          />
                        }
                      >
                        {isFolder ? (
                          <FolderIcon aria-hidden className="size-3.5" />
                        ) : (
                          <FileIcon aria-hidden className="size-3.5" />
                        )}
                        <span>{baseName(row.path)}</span>
                      </ContextMenuTrigger>
                      <ContextMenuPopup align="start">
                        <ContextActions actions={actions} />
                      </ContextMenuPopup>
                    </ContextMenu>
                    {row.path === entry && (
                      <SidebarMenuBadge
                        title={m.file_entry_hint()}
                        className="right-7 rounded-full bg-phosphor/15 px-1.5 text-[10.5px] text-phosphor"
                      >
                        {m.file_entry_badge()}
                      </SidebarMenuBadge>
                    )}
                    <RowMenu
                      label={m.file_actions({ path: row.path })}
                      actions={actions}
                    />
                  </SidebarMenuItem>
                  {isFolder && newItemInput(row.path, row.depth + 1)}
                </Fragment>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}

/** The project's files: a column on wide screens, a sheet on phones. */
export function FileSidebar() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  if (isMobile)
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetPopup
          side="left"
          closeProps={{ "aria-label": m.files_close() }}
          className="w-72 max-w-[85vw] bg-sidebar text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">{m.files_title()}</SheetTitle>
          <FilesContent onOpenFile={() => setOpenMobile(false)} />
        </SheetPopup>
      </Sheet>
    );
  return (
    <Sidebar
      collapsible="none"
      aria-label={m.files_title()}
      className="w-full rounded-[7px] border border-edge"
    >
      <FilesContent />
    </Sidebar>
  );
}
