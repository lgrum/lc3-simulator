import { z } from "zod";

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

/** A published module fetched for a signed-in build. */
export type FetchedModule = {
  /** The name the importer's project uses: `g7_trig`, or its own `calc`. */
  name: string;
  /** `group:7` or `admin:<id>`. */
  namespace: string;
  /** The module's name in its owner's namespace: `trig`. */
  module: string;
  version: number;
  source: string;
};

export const fetchBuildInput = z.object({
  names: z.array(z.string().max(80)).max(200),
});

/** A group's published modules, as other accounts browse them. */
export type PublishedGroup = {
  number: number;
  name: string;
  modules: Array<ModuleSummary>;
};

export type VersionSource = {
  id: number;
  module: string;
  number: number;
  source: string;
};

export function isModuleName(name: string): boolean {
  return MODULE_NAME.test(name) && name.toLowerCase() !== OS_MODULE;
}

/** Group n's module `name` as other accounts name it: `g<n>_<name>`. */
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

/** Whether a name is reserved for naming other groups' modules. */
export function isReservedForGroups(name: string): boolean {
  return parseGroupModuleName(name) !== null;
}

/** An import of a published module, as the importer named it. */
export type ImportTarget =
  | { kind: "own"; name: string }
  | { kind: "group"; group: number; name: string };

/**
 * Where an import goes: `g<n>_<name>` means group n's module, anything else
 * the importer's own. The same for admins and groups (see resolveImport).
 */
export function importTarget(name: string): ImportTarget {
  const group = parseGroupModuleName(name);
  return group ? { kind: "group", ...group } : { kind: "own", name };
}

/** The owner of a module, as far as access rules care. */
export type Owner = { userId: string; kind: Viewer["kind"] };

/**
 * Who may list and read a module's versions: its owner, and everyone signed
 * in for group modules. Admins' modules stay with their owner.
 */
export function canRead(viewer: Viewer, owner: Owner): boolean {
  return owner.userId === viewer.userId || owner.kind === "group";
}

const encoder = new TextEncoder();

/**
 * The checks the server makes before it stores a module: its name and size.
 * Assembling and import checks happen in the browser (see checkModule in
 * src/workbench/lib/publish-check.ts): the Worker has 10 ms of CPU per
 * request, and a long source takes longer than that to assemble.
 */
export function checkStored(
  name: string,
  source: string,
): PublishProblem | null {
  if (!isModuleName(name)) return { kind: "name" };
  if (isReservedForGroups(name)) return { kind: "reserved" };
  if (encoder.encode(source).length > MAX_SOURCE_BYTES)
    return { kind: "too-large" };
  return null;
}
