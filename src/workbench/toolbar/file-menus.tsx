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
import { useAskDialog } from "../ui/ask-dialog";
import type { Question } from "../ui/ask-dialog";
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
  const { ask, dialog } = useAskDialog();
  const open = async (project: SavedProject) => {
    if (
      hasOwnWork(workbench) &&
      !(await ask({
        title: m.project_replace_confirm(),
        confirm: m.dialog_replace(),
        destructive: true,
      }))
    )
      return;
    openProject(workbench, project);
  };
  return { open, dialog };
}

/** The file of the tab the editor shows, or the entry file. */
function activeFile({ project, tabs }: Workbench): string {
  const chosen = tabs.getState().chosen?.file;
  return chosen !== undefined && project.getText(chosen) !== undefined
    ? chosen
    : project.getProject().entry;
}

/** Adds a file from disk to the project root, asking before replacing one. */
async function addUpload(
  workbench: Workbench,
  ask: (question: Question) => Promise<boolean>,
  name: string,
  text: string,
) {
  const files = workbench.project.getProject().files;
  const problem = fileNameProblem(name, "", files);
  if (problem === "exists") {
    const replace = await ask({
      title: m.file_replace_one_confirm({ file: name }),
      confirm: m.dialog_replace(),
      destructive: true,
    });
    if (!replace) return;
  } else if (problem) {
    await ask({
      title: m.upload_skipped_title(),
      description: m.upload_skipped({
        file: name,
        reason: nameProblemText(problem, toFileName(name)),
      }),
    });
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
  const { ask, dialog } = useAskDialog();

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
          if (file)
            await addUpload(workbench, ask, file.name, await file.text());
        }}
      />
      {dialog}
    </>
  );
}

export function ExamplesMenu() {
  const { open, dialog } = useOpenProject();
  return (
    <>
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
      {dialog}
    </>
  );
}
