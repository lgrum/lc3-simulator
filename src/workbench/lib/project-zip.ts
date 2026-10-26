import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Zippable } from "fflate";

import { fileNameProblem, folderNameProblem } from "./file-names";
import type { Project, SavedProject } from "./project-store";

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

export type UnzippedProject =
  | {
      ok: true;
      project: SavedProject;
      /** Entries left out: not .asm files, or names a project can't hold. */
      skipped: Array<string>;
    }
  | { ok: false; reason: "unreadable" | "no-files" };

/** The file the program starts in, when a .zip has it. */
const ENTRY = "main.asm";

const NONE = new Set<string>();

/** Hidden files and the folders some zip tools add, left out silently. */
function isJunk(path: string): boolean {
  return path
    .split("/")
    .some((part) => part.startsWith(".") || part === "__MACOSX");
}

/** Whether every folder in `parts` is a name a project folder can have. */
function validFolders(parts: Array<string>): boolean {
  return parts.every((part) => folderNameProblem(part, "", NONE) === null);
}

/**
 * Reads a project from a .zip, the inverse of zipProject. A .zip of a
 * folder opens that folder's contents. The .zip doesn't say which file is
 * the entry, so it is main.asm when there is one, else the first .asm file
 * nearest the top.
 */
export function unzipProject(zip: Uint8Array): UnzippedProject {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const paths = Object.keys(entries)
    .map((name) => ({
      name,
      path: name.replaceAll("\\", "/").replace(/^(\.?\/)+/, ""),
    }))
    .filter(({ path }) => path !== "" && !isJunk(path));
  // A .zip of one folder: open what is inside it.
  const wrapper = paths.length > 0 ? paths[0].path.split("/")[0] + "/" : "";
  const prefix = paths.every(({ path }) => path.startsWith(wrapper))
    ? wrapper
    : "";

  const files: Record<string, string> = {};
  const folders: Array<string> = [];
  const skipped: Array<string> = [];
  for (const { name, path: full } of paths) {
    const path = full.slice(prefix.length);
    if (path === "") continue;
    const parts = path.replace(/\/$/, "").split("/");
    if (path.endsWith("/")) {
      if (validFolders(parts)) folders.push(parts.join("/"));
      else skipped.push(name);
      continue;
    }
    const file = parts.pop() ?? "";
    if (
      /\.asm$/i.test(file) &&
      fileNameProblem(file, "", NONE) === null &&
      validFolders(parts)
    )
      files[path] = strFromU8(entries[name]);
    else skipped.push(name);
  }

  const sources = Object.keys(files).sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
  if (sources.length === 0) return { ok: false, reason: "no-files" };
  const entry =
    sources.find((path) => path.toLowerCase() === ENTRY) ?? sources[0];
  return { ok: true, project: { files, folders, entry }, skipped };
}
