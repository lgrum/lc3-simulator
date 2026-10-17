import { m } from "@/paraglide/messages";

import { toFileName } from "../lib/file-names";
import type { FileNameProblem } from "../lib/file-names";

/** The text of a new file. */
export const NEW_FILE_TEXT = "        .END\n";

export function nameProblemText(problem: FileNameProblem, name: string) {
  switch (problem) {
    case "empty":
      return m.name_error_empty();
    case "invalid":
      return m.name_error_invalid();
    case "reserved":
      return m.name_error_reserved();
    case "exists":
      return m.name_error_exists({ file: toFileName(name) });
  }
}
