import { m } from "@/paraglide/messages";

import { openProject } from "../actions";
import { isExampleText } from "../examples";
import type { FileNameProblem, FolderNameProblem } from "../lib/file-names";
import type { SavedProject } from "../lib/project-store";
import type { Question } from "../ui/ask-dialog";
import type { Workbench } from "../workbench-provider";

/** The text of a new file. */
export const NEW_FILE_TEXT = "        .END\n";

/** Whether replacing the project would lose work that only exists here. */
function hasOwnWork({ project }: Workbench): boolean {
  return [...project.getProject().files.values()].some(
    (text) =>
      text.trim() !== "" && text !== NEW_FILE_TEXT && !isExampleText(text),
  );
}

/**
 * Opens `project` in place of the current one, asking first when that would
 * lose work. Whether it was opened.
 */
export async function replaceProject(
  workbench: Workbench,
  project: SavedProject,
  ask: (question: Question) => Promise<boolean>,
): Promise<boolean> {
  if (
    hasOwnWork(workbench) &&
    !(await ask({
      title: m.project_replace_confirm(),
      confirm: m.dialog_replace(),
      destructive: true,
    }))
  )
    return false;
  openProject(workbench, project);
  return true;
}

/** Why a name was refused, as a sentence; `name` is the name as it'd be. */
export function nameProblemText(
  problem: FileNameProblem | FolderNameProblem,
  name: string,
) {
  switch (problem) {
    case "empty":
      return m.name_error_empty();
    case "invalid":
      return m.name_error_invalid();
    case "folder-invalid":
      return m.name_error_folder_invalid();
    case "reserved":
      return m.name_error_reserved();
    case "exists":
      return m.name_error_exists({ file: name.trim() });
  }
}

/** Saves text or bytes as a file in the browser's downloads. */
export function downloadFile(
  name: string,
  data: string | Uint8Array<ArrayBuffer>,
  type = "text/plain",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
