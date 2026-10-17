import { strToU8, zipSync } from "fflate";
import type { Zippable } from "fflate";

import type { Project } from "./project-store";

/**
 * The project as a .zip: every file at its path, and empty folders as
 * folder entries so they survive a round trip.
 */
export function zipProject(project: Pick<Project, "files" | "folders">) {
  const entries: Zippable = {};
  for (const [path, text] of project.files) entries[path] = strToU8(text);
  for (const folder of project.folders)
    if (
      ![...project.files.keys()].some((path) => path.startsWith(folder + "/"))
    )
      entries[folder + "/"] = new Uint8Array(0);
  return zipSync(entries);
}
