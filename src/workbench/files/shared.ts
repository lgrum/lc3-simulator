import { m } from "@/paraglide/messages";

import type { FileNameProblem, FolderNameProblem } from "../lib/file-names";

/** The text of a new file. */
export const NEW_FILE_TEXT = "        .END\n";

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
