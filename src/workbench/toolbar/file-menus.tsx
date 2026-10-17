import { ChevronDownIcon } from "lucide-react";
import { useRef } from "react";

import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { m } from "@/paraglide/messages";

import { openProject, writeFile } from "../actions";
import { EXAMPLES, isExampleText } from "../examples";
import { NEW_FILE_TEXT, downloadFile, nameProblemText } from "../files/shared";
import {
  baseName,
  fileNameProblem,
  toFileName,
  unusedName,
} from "../lib/file-names";
import type { SavedProject } from "../lib/project-store";
import { Key } from "../ui/key";
import { useWorkbench } from "../workbench-provider";
import type { Workbench } from "../workbench-provider";

/** Whether replacing the project would lose work that only exists here. */
function hasOwnWork({ project }: Workbench): boolean {
  return [...project.getProject().files.values()].some(
    (text) =>
      text.trim() !== "" && text !== NEW_FILE_TEXT && !isExampleText(text),
  );
}

function useOpenProject() {
  const workbench = useWorkbench();
  return (project: SavedProject) => {
    if (hasOwnWork(workbench) && !window.confirm(m.project_replace_confirm()))
      return;
    openProject(workbench, project);
  };
}

/** The file of the tab the editor shows, or the entry file. */
function activeFile({ project, tabs }: Workbench): string {
  const chosen = tabs.getState().chosen?.file;
  return chosen !== undefined && project.getText(chosen) !== undefined
    ? chosen
    : project.getProject().entry;
}

/** Adds a file from disk to the project root, asking before replacing one. */
function addUpload(workbench: Workbench, name: string, text: string) {
  const files = workbench.project.getProject().files;
  const problem = fileNameProblem(name, "", files);
  if (problem === "exists") {
    if (!window.confirm(m.file_replace_one_confirm({ file: name }))) return;
  } else if (problem) {
    window.alert(nameProblemText(problem, toFileName(name)));
    return;
  }
  writeFile(workbench, name, text);
}

function MenuKey({ children }: { children: React.ReactNode }) {
  return (
    <MenuTrigger render={<Key tone="flat" />}>
      {children}
      <ChevronDownIcon aria-hidden />
    </MenuTrigger>
  );
}

export function FileMenu() {
  const workbench = useWorkbench();
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Menu>
        <MenuKey>{m.menu_file()}</MenuKey>
        <MenuPopup align="start">
          <MenuItem
            onClick={() =>
              writeFile(
                workbench,
                unusedName(
                  "untitled",
                  "",
                  workbench.project.getProject().files,
                ),
                NEW_FILE_TEXT,
              )
            }
          >
            {m.file_new()}
          </MenuItem>
          <MenuItem onClick={() => input.current?.click()}>
            {m.file_open()}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              const path = activeFile(workbench);
              downloadFile(
                baseName(path),
                workbench.project.getText(path) ?? "",
              );
            }}
          >
            {m.file_save()}
          </MenuItem>
        </MenuPopup>
      </Menu>
      <input
        ref={input}
        type="file"
        accept=".asm,.txt,text/plain"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) addUpload(workbench, file.name, await file.text());
        }}
      />
    </>
  );
}

export function ExamplesMenu() {
  const open = useOpenProject();
  return (
    <Menu>
      <MenuKey>{m.menu_examples()}</MenuKey>
      <MenuPopup align="start">
        {EXAMPLES.map((example) => (
          <MenuItem key={example.id} onClick={() => open(example.project)}>
            {example.title()}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
