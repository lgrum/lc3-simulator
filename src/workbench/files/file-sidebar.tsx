import {
  AssistiveDndState,
  dragAndDropFeature,
  hotkeysCoreFeature,
  keyboardDragAndDropFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import type { DndState, ItemInstance, TreeInstance } from "@headless-tree/core";
import { AssistiveTreeDescription, useTree } from "@headless-tree/react";
import {
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PackageIcon,
  UploadIcon,
} from "lucide-react";
import {
  Fragment,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

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
import { zipProject } from "../lib/project-zip";
import { useAskDialog } from "../ui/ask-dialog";
import { useEditorTabs, useProject, useWorkbench } from "../workbench-provider";
import { NEW_FILE_TEXT, downloadFile, nameProblemText } from "./shared";

const ZIP_NAME = "lc3-project.zip";

/** The tree's id for the project root; paths never start with "/". */
const ROOT = "/";

/** The folder an item id stands for: "" for the root. */
const folderPath = (id: string) => (id === ROOT ? "" : id);

/** What sits directly in `parent` ("" for the root): folders, then files. */
export function childPaths(
  files: Iterable<string>,
  folders: Iterable<string>,
  parent: string,
): Array<string> {
  const inside = (path: string) =>
    parent === ""
      ? !path.includes("/")
      : path.startsWith(parent + "/") &&
        !path.slice(parent.length + 1).includes("/");
  return [
    ...[...folders].filter(inside).sort(),
    ...[...files].filter(inside).sort(),
  ];
}

/** What screen readers hear while a file or folder is moved by keyboard. */
function moveAnnouncement<T>(
  dnd: DndState<T> | null | undefined,
  state: AssistiveDndState,
): string {
  const items =
    dnd?.draggedItems?.map((item) => item.getItemName()).join(", ") ?? "";
  const id = dnd?.dragTarget?.item.getId() ?? ROOT;
  const target = id === ROOT ? m.folder_root() : id;
  switch (state) {
    case AssistiveDndState.Started:
      return m.tree_move_started({ items, target });
    case AssistiveDndState.Dragging:
      return m.tree_move_target({ target });
    case AssistiveDndState.Completed:
      return m.tree_move_done();
    case AssistiveDndState.Aborted:
      return m.tree_move_cancelled();
    default:
      return m.tree_move_hint();
  }
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
  tabIndex,
}: {
  label: string;
  actions: Array<Action>;
  tabIndex: number;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <SidebarMenuAction
            showOnHover
            aria-label={label}
            title={label}
            tabIndex={tabIndex}
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

/** Whether a key went to a tree row, not to a button or field inside it. */
const isTreeItem = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.getAttribute("role") === "treeitem";

/** Focuses a row once it is drawn, e.g. after a move gave it a new path. */
function focusRow(tree: TreeInstance<string>, path: string) {
  tree.getItemInstance(path).setFocused();
  tree.updateDomFocus();
}

function FilesContent({ onOpenFile }: { onOpenFile?: () => void }) {
  // headless-tree keeps its state behind a stable tree object, which React
  // Compiler would memoize as if it never changed.
  "use no memo";
  const workbench = useWorkbench();
  const project = useProject();
  const { files, folders, entry } = project;
  const { chosen } = useEditorTabs();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const { ask, dialog } = useAskDialog();
  const upload = useRef<HTMLInputElement>(null);
  const uploadFolder = useRef("");
  const hintId = useId();

  const open = (path: string) => {
    workbench.tabs.show(path);
    onOpenFile?.();
  };

  /** Moves a file or folder into `folder`, keeping its name. */
  const moveInto = async (path: string, folder: string) => {
    const to = joinPath(folder, baseName(path));
    if (to === path || folder === path || folder.startsWith(path + "/")) return;
    const current = workbench.project.getProject();
    if (current.files.has(to) || current.folders.has(to)) {
      await ask({
        title: m.move_blocked_title({ file: baseName(path) }),
        description: m.name_error_exists({ file: baseName(path) }),
      });
      return;
    }
    movePath(workbench, path, to);
    // After the tree's own focus handling for the drop or the closing menu.
    setTimeout(() => focusRow(tree, to));
  };

  // A new array only when the folders or the collapsed ones change: the tree
  // rebuilds its rows each time it gets a new one.
  const expandedItems = useMemo(
    () => [...folders].filter((folder) => !collapsed.has(folder)),
    [folders, collapsed],
  );

  const tree = useTree<string>({
    rootItemId: ROOT,
    state: { expandedItems },
    setExpandedItems: (update) => {
      const expanded =
        typeof update === "function" ? update(expandedItems) : update;
      setCollapsed(
        new Set([...folders].filter((folder) => !expanded.includes(folder))),
      );
    },
    getItemName: (item) => baseName(item.getId()),
    isItemFolder: (item) => folders.has(item.getId()),
    dataLoader: {
      getItem: (id) => id,
      getChildren: (id) => childPaths(files.keys(), folders, folderPath(id)),
    },
    indent: 12,
    // Rows are sorted by name, so a drop only picks the folder.
    canReorder: false,
    canDrop: (items, target) =>
      target.item.isFolder() &&
      items.every(
        (item) => folderOf(item.getId()) !== folderPath(target.item.getId()),
      ),
    onDrop: async (items, target) => {
      for (const item of items)
        await moveInto(item.getId(), folderPath(target.item.getId()));
      // A drop on the root leaves the drag state behind, and the moved row's
      // element, which would get dragend, is gone.
      tree.applySubStateUpdate("dnd", null);
    },
    onPrimaryAction: (item) => {
      if (!item.isFolder()) open(item.getId());
    },
    hotkeys: {
      // Rows are not buttons, so Enter needs a binding of its own.
      customOpen: {
        hotkey: "Enter",
        isEnabled: (t) => !t.getState().dnd,
        handler: (event, t) => {
          if (!isTreeItem(event.target)) return;
          event.preventDefault();
          const item = t.getFocusedItem();
          if (!item.isFolder()) item.primaryAction();
          else if (item.isExpanded()) item.collapse();
          else item.expand();
        },
      },
      // Replaces the library's binding, so it repeats its key and checks.
      startDrag: {
        hotkey: "Control+Shift+KeyD",
        preventDefault: true,
        isEnabled: (t) => !t.getState().dnd,
        handler: (_, t) => {
          const item = t.getFocusedItem();
          t.startKeyboardDrag([item]);
          if (t.getState().dnd?.dragTarget) return;
          // The first target is only looked for below the row, so the last
          // rows would start a move with nowhere to go; look above instead.
          const target = t
            .getItems()
            .slice(0, item.getItemMeta().index)
            .reverse()
            .find(
              (other) =>
                other.isFolder() &&
                !other.isDescendentOf(item.getId()) &&
                other.getId() !== folderOf(item.getId()),
            );
          if (!target) return t.stopKeyboardDrag();
          t.applySubStateUpdate("dnd", {
            draggedItems: [item],
            dragTarget: { item: target },
          });
          t.applySubStateUpdate("assistiveDndState", AssistiveDndState.Started);
        },
      },
      customRename: {
        hotkey: "F2",
        handler: (event, t) => {
          if (!isTreeItem(event.target)) return;
          const item = t.getFocusedItem();
          setEditing({
            kind: "rename",
            path: item.getId(),
            isFolder: item.isFolder(),
          });
        },
      },
    },
    features: [
      syncDataLoaderFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
    ],
  });

  // The tree caches its rows; rebuild them when files come or go.
  const paths = [...files.keys()].join("\n");
  useLayoutEffect(() => {
    tree.rebuildTree();
  }, [tree, paths, folders]);

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
        const replace = await ask({
          title: m.file_replace_one_confirm({ file: path }),
          confirm: m.dialog_replace(),
          destructive: true,
        });
        if (!replace) continue;
      } else if (problem) {
        await ask({
          title: m.upload_skipped_title(),
          description: m.upload_skipped({
            file: file.name,
            reason: nameProblemText(problem, toFileName(file.name)),
          }),
        });
        continue;
      }
      writeFile(workbench, path, await file.text());
    }
  };

  const confirmDeleteFile = async (path: string) => {
    const yes = await ask({
      title: m.file_delete_confirm({ file: path }),
      confirm: m.dialog_delete(),
      destructive: true,
    });
    if (yes) deleteFile(workbench, path);
  };

  const confirmDeleteFolder = async (path: string) => {
    if (entry.startsWith(path + "/")) {
      await ask({
        title: m.folder_delete_blocked_title({ folder: path }),
        description: m.folder_delete_entry({ folder: path, entry }),
      });
      return;
    }
    const count = [...files.keys()].filter((file) =>
      file.startsWith(path + "/"),
    ).length;
    const yes = await ask({
      title:
        count === 0
          ? m.folder_delete_empty_confirm({ folder: path })
          : m.folder_delete_confirm({ folder: path, count }),
      confirm: m.dialog_delete(),
      destructive: true,
    });
    if (yes) deleteFolder(workbench, path);
  };

  /** Where `path` can move to: the root and every folder outside it. */
  const moveChoices = (path: string) =>
    ["", ...[...folders].sort()]
      .filter(
        (folder) =>
          folder !== folderOf(path) &&
          folder !== path &&
          !folder.startsWith(path + "/"),
      )
      .map((folder) => ({
        label: folder === "" ? m.folder_root() : folder,
        run: () => void moveInto(path, folder),
      }));

  /** Starts naming something new in `folder`, opening it first. */
  const startNew = (kind: "new-file" | "new-folder", folder: string) => {
    if (folder !== "") tree.getItemInstance(folder).expand();
    setEditing({ kind, folder });
  };

  const fileActions = (path: string): Array<Action> => [
    { label: m.file_open_tab(), run: () => open(path) },
    {
      label: m.file_rename(),
      run: () => setEditing({ kind: "rename", path, isFolder: false }),
    },
    { label: m.file_move_to(), choices: moveChoices(path) },
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
      run: () => void confirmDeleteFile(path),
    },
  ];

  const folderActions = (path: string): Array<Action> => [
    { label: m.file_new_here(), run: () => startNew("new-file", path) },
    { label: m.folder_new_here(), run: () => startNew("new-folder", path) },
    { label: m.file_upload_here(), run: () => startUpload(path) },
    {
      label: m.file_rename(),
      run: () => setEditing({ kind: "rename", path, isFolder: true }),
    },
    { label: m.file_move_to(), choices: moveChoices(path) },
    "separator",
    {
      label: m.file_delete({ file: path }),
      destructive: true,
      run: () => void confirmDeleteFolder(path),
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
        const path = joinPath(folder, name.trim());
        workbench.project.createFolder(path);
        focusRow(tree, path);
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
      const to = joinPath(folder, isFolder ? name.trim() : toFileName(name));
      movePath(workbench, path, to);
      setEditing(null);
      focusRow(tree, to);
      return null;
    };

  const cancelEditing = () => {
    setEditing(null);
    tree.updateDomFocus();
  };

  const newItemInput = (folder: string, depth: number): ReactNode =>
    editing && editing.kind !== "rename" && editing.folder === folder ? (
      <li role="none">
        <NameInput
          label={
            editing.kind === "new-file"
              ? m.file_name_label()
              : m.folder_name_label()
          }
          initial=""
          depth={depth}
          onSubmit={create(editing.kind, folder)}
          onCancel={cancelEditing}
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

  const items = tree.getItems();
  // A deleted or moved row may have held the focus; then the first row
  // takes the tree's place in the tab order.
  const focusLost = !items.some((item) => item.isFocused());
  const tabbable = (item: ItemInstance<string>, index: number) =>
    item.isFocused() || (focusLost && index === 0);
  const rootIsTarget = tree.getDragTarget()?.item.getId() === ROOT;
  const container = tree.getContainerProps(m.files_title());

  return (
    <>
      <SidebarHeader className="flex-row items-center gap-1 border-b border-edge py-1.5 pr-2 pl-3">
        <h2 className="mr-auto text-[13.5px] font-semibold text-silk-hi">
          {m.files_title()}
        </h2>
        {headerButton(
          m.file_new(),
          <FilePlusIcon aria-hidden className="size-3.5" />,
          () => startNew("new-file", ""),
        )}
        {headerButton(
          m.file_new_folder(),
          <FolderPlusIcon aria-hidden className="size-3.5" />,
          () => startNew("new-folder", ""),
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
          data-drop={rootIsTarget}
        >
          <SidebarMenu
            {...container}
            onDragOver={(event) => {
              container.onDragOver(event);
              // Rows set the target themselves; the space below is the root.
              const dragged = tree.getState().dnd?.draggedItems;
              if (
                event.target === event.currentTarget &&
                !rootIsTarget &&
                dragged?.some((item) => item.getId().includes("/"))
              )
                tree.applySubStateUpdate("dnd", (dnd) => ({
                  ...dnd,
                  dragTarget: { item: tree.getRootItem() },
                }));
            }}
            aria-describedby={hintId}
            className="flex-1 gap-0.5"
          >
            {newItemInput("", 0)}
            {items.map((item, index) => {
              const path = item.getId();
              const isFolder = item.isFolder();
              const level = item.getItemMeta().level;
              if (editing?.kind === "rename" && editing.path === path)
                return (
                  <li key={path} role="none">
                    <NameInput
                      label={m.new_name_label({ path })}
                      initial={baseName(path)}
                      depth={level}
                      onSubmit={rename(path, isFolder)}
                      onCancel={cancelEditing}
                    />
                  </li>
                );
              const actions = isFolder
                ? folderActions(path)
                : fileActions(path);
              const tabIndex = tabbable(item, index) ? 0 : -1;
              return (
                <Fragment key={path}>
                  <SidebarMenuItem
                    role="none"
                    className="data-[drop=true]:rounded-lg data-[drop=true]:bg-tint/8"
                    data-drop={isFolder && item.isUnorderedDragTarget()}
                  >
                    <ContextMenu>
                      <ContextMenuTrigger
                        {...item.getProps()}
                        tabIndex={tabIndex}
                        aria-selected={!isFolder && chosen?.file === path}
                        title={path}
                        render={
                          <SidebarMenuButton
                            render={<div />}
                            size="sm"
                            isActive={!isFolder && chosen?.file === path}
                            style={{ paddingLeft: 8 + level * 12 }}
                            className={
                              isFolder
                                ? "cursor-default pr-8 text-xs text-silk-2"
                                : "cursor-default pr-16 font-mono text-[12.5px]"
                            }
                          />
                        }
                      >
                        {!isFolder ? (
                          <FileIcon aria-hidden className="size-3.5" />
                        ) : item.isExpanded() ? (
                          <FolderOpenIcon aria-hidden className="size-3.5" />
                        ) : (
                          <FolderIcon aria-hidden className="size-3.5" />
                        )}
                        <span>{baseName(path)}</span>
                      </ContextMenuTrigger>
                      <ContextMenuPopup align="start">
                        <ContextActions actions={actions} />
                      </ContextMenuPopup>
                    </ContextMenu>
                    {path === entry && (
                      <SidebarMenuBadge
                        title={m.file_entry_hint()}
                        className="right-7 rounded-full bg-phosphor/15 px-1.5 text-[10.5px] text-phosphor"
                      >
                        {m.file_entry_badge()}
                      </SidebarMenuBadge>
                    )}
                    <RowMenu
                      label={m.file_actions({ path })}
                      actions={actions}
                      tabIndex={tabIndex}
                    />
                  </SidebarMenuItem>
                  {isFolder && newItemInput(path, level + 1)}
                </Fragment>
              );
            })}
          </SidebarMenu>
          <AssistiveTreeDescription
            tree={tree}
            id={hintId}
            getLabel={moveAnnouncement}
          />
        </SidebarGroup>
      </SidebarContent>
      {dialog}
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
