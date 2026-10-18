import { z } from "zod";

import { assembleModule } from "@/lib/assembler/assemble-source";
import { OS_MODULE } from "@/lib/assembler/linker";

import type { Viewer } from "./access";

/** Published sources are at most this many bytes of UTF-8. */
export const MAX_SOURCE_BYTES = 64 * 1024;
/** A module name: label characters, starting with a letter or `_`. */
const MODULE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
/** How admins see group modules (`g7_trig`); admins can't use it. */
const GROUP_MODULE = /^g(\d+)_(.+)$/i;

export const publishInput = z.object({
  name: z.string(),
  // The byte limit is checked after parsing, to report it clearly.
  source: z.string().max(MAX_SOURCE_BYTES * 4),
});

/** Why a publish was refused. */
export type PublishProblem =
  | { kind: "name" }
  | { kind: "reserved" }
  | { kind: "too-large" }
  | { kind: "assembly"; line: number | null; text: string }
  | { kind: "import"; module: string; line: number };

export type PublishResult =
  | { ok: true; module: string; version: number }
  | { ok: false; problem: PublishProblem };

/** Summary of a published module. */
export type ModuleSummary = {
  id: number;
  name: string;
  /** The latest version number. */
  latest: number;
  updatedAt: number;
};

export type VersionSummary = { id: number; number: number; createdAt: number };

export type VersionSource = {
  id: number;
  module: string;
  number: number;
  source: string;
};

export function isModuleName(name: string): boolean {
  return MODULE_NAME.test(name) && name.toLowerCase() !== OS_MODULE;
}

/** Group n's module `name` as admins see it: `g<n>_<name>`. */
export function groupModuleName(group: number, name: string): string {
  return `g${group}_${name}`;
}

/** `g7_trig` → group 7's `trig`; null for other names. */
export function parseGroupModuleName(
  name: string,
): { group: number; name: string } | null {
  const match = GROUP_MODULE.exec(name);
  return match ? { group: Number(match[1]), name: match[2] } : null;
}

/** Whether a name is reserved for group modules in admin builds. */
export function isReservedForGroups(name: string): boolean {
  return parseGroupModuleName(name) !== null;
}

/** An import of a published module, as the importer named it. */
export type ImportTarget =
  | { kind: "own"; name: string }
  | { kind: "group"; group: number; name: string };

/**
 * Where an import goes. A group's imports always stay in its own namespace;
 * an admin's `g<n>_<name>` means group n's module, anything else its own.
 */
export function importTarget(viewer: Viewer, name: string): ImportTarget {
  if (viewer.kind === "admin") {
    const group = parseGroupModuleName(name);
    if (group) return { kind: "group", ...group };
  }
  return { kind: "own", name };
}

/** The owner of a module, as far as access rules care. */
export type Owner = { userId: string; kind: Viewer["kind"] };

/**
 * Who may list and read a module's versions: its owner, and admins for group
 * modules. Admins never see other admins' modules.
 */
export function canRead(viewer: Viewer, owner: Owner): boolean {
  if (owner.userId === viewer.userId) return true;
  return viewer.kind === "admin" && owner.kind === "group";
}

const encoder = new TextEncoder();

/**
 * Checks a module before it is stored: its name, size and assembly, and for
 * admins whether every import exists and is visible. `exists` answers whether
 * a published module is there.
 */
export async function checkPublish(
  viewer: Viewer,
  name: string,
  source: string,
  exists: (target: ImportTarget) => Promise<boolean>,
): Promise<PublishProblem | null> {
  if (!isModuleName(name)) return { kind: "name" };
  if (viewer.kind === "admin" && isReservedForGroups(name))
    return { kind: "reserved" };
  if (encoder.encode(source).length > MAX_SOURCE_BYTES)
    return { kind: "too-large" };
  const assembled = assembleModule(source, {
    file: `${name}.asm`,
    entry: false,
  });
  if (!assembled.ok)
    return {
      kind: "assembly",
      line: assembled.error.position?.line ?? null,
      text: assembled.error.text,
    };
  // A group's imports are checked only when an admin builds.
  if (viewer.kind === "group") return null;
  for (const external of assembled.module.externals.values())
    if (!(await exists(importTarget(viewer, external.module))))
      return { kind: "import", module: external.module, line: external.line };
  return null;
}
