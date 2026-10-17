import { moduleName } from "@/lib/assembler/linker";

/** A module name: label characters, starting with a letter or `_`. */
const MODULE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The OS file's module name; programs reach the OS through TRAP. */
const RESERVED = "lc3os";

export type FileNameProblem = "empty" | "invalid" | "reserved" | "exists";

/** The file name for what the user typed: `trig` becomes `trig.asm`. */
export function toFileName(typed: string): string {
  const name = typed.trim();
  return /\.asm$/i.test(name) ? name : `${name}.asm`;
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

export function joinPath(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

/**
 * Why `name` can't be a file in `folder`, or null if it can. Every base name
 * must be a valid module name, because other files import it by that name.
 */
export function fileNameProblem(
  typed: string,
  folder: string,
  existing: { has: (path: string) => boolean },
): FileNameProblem | null {
  if (typed.trim() === "" || typed.trim() === ".asm") return "empty";
  const name = toFileName(typed);
  const module = moduleName(name);
  if (!MODULE_NAME.test(module)) return "invalid";
  if (module.toLowerCase() === RESERVED) return "reserved";
  if (existing.has(joinPath(folder, name))) return "exists";
  return null;
}

/** A name like `untitled.asm`, `untitled2.asm`... not used in `folder`. */
export function unusedName(
  stem: string,
  folder: string,
  existing: { has: (path: string) => boolean },
): string {
  for (let i = 1; ; i++) {
    const name = `${stem}${i === 1 ? "" : i}.asm`;
    if (!existing.has(joinPath(folder, name))) return name;
  }
}
