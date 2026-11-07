import { and, desc, eq, max, sql } from "drizzle-orm";

import { namespaceOf, viewerOf } from "./access";
import type { Viewer } from "./access";
import { db } from "./db/client.server";
import { modules, user, versions } from "./db/schema";
import { canRead, checkStored, groupModuleName, importTarget } from "./modules";
import type {
  FetchedModule,
  ModuleSummary,
  Owner,
  PublishedGroup,
  PublishResult,
  VersionSource,
  VersionSummary,
} from "./modules";

/** Compares module names ignoring case, as the unique index does. */
const sameName = (name: string) =>
  sql`${modules.name} = ${name} COLLATE NOCASE`;

/** The account a module belongs to, for access checks. */
async function ownerOfModule(moduleId: number): Promise<Owner | null> {
  const row = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    })
    .from(modules)
    .innerJoin(user, eq(user.id, modules.ownerUserId))
    .where(eq(modules.id, moduleId))
    .get();
  const owner = row && viewerOf(row);
  return owner ? { userId: owner.userId, kind: owner.kind } : null;
}

/** An account's modules with their latest version, by name. */
export async function listModulesOf(
  ownerUserId: string,
): Promise<Array<ModuleSummary>> {
  const rows = await db
    .select({
      id: modules.id,
      name: modules.name,
      latest: max(versions.number),
      updatedAt: max(versions.createdAt),
    })
    .from(modules)
    .innerJoin(versions, eq(versions.moduleId, modules.id))
    .where(eq(modules.ownerUserId, ownerUserId))
    .groupBy(modules.id)
    .orderBy(sql`${modules.name} COLLATE NOCASE`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    latest: row.latest ?? 0,
    updatedAt: row.updatedAt?.getTime() ?? 0,
  }));
}

/**
 * Every group's published modules but the viewer's own, by group number,
 * for the file sidebar. Groups with nothing published are left out.
 */
export async function listPublishedGroups(
  viewer: Viewer,
): Promise<Array<PublishedGroup>> {
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      moduleId: modules.id,
      module: modules.name,
      latest: max(versions.number),
      updatedAt: max(versions.createdAt),
    })
    .from(modules)
    .innerJoin(user, eq(user.id, modules.ownerUserId))
    .innerJoin(versions, eq(versions.moduleId, modules.id))
    .groupBy(modules.id)
    .orderBy(sql`${modules.name} COLLATE NOCASE`);
  const groups = new Map<number, PublishedGroup>();
  for (const row of rows) {
    const owner = viewerOf({ id: row.userId, ...row });
    if (owner?.kind !== "group" || owner.userId === viewer.userId) continue;
    let group = groups.get(owner.group);
    if (!group) {
      group = { number: owner.group, name: owner.name, modules: [] };
      groups.set(owner.group, group);
    }
    group.modules.push({
      id: row.moduleId,
      name: row.module,
      latest: row.latest ?? 0,
      updatedAt: row.updatedAt?.getTime() ?? 0,
    });
  }
  return [...groups.values()].sort((a, b) => a.number - b.number);
}

const NOT_FOUND = "There is no such module";

/** A module's versions, newest first, if the viewer may read them. */
export async function listVersions(
  viewer: Viewer,
  moduleId: number,
): Promise<Array<VersionSummary>> {
  const owner = await ownerOfModule(moduleId);
  // Modules the viewer can't read look the same as missing ones.
  if (!owner || !canRead(viewer, owner)) throw new Error(NOT_FOUND);
  const rows = await db
    .select({
      id: versions.id,
      number: versions.number,
      createdAt: versions.createdAt,
    })
    .from(versions)
    .where(eq(versions.moduleId, moduleId))
    .orderBy(desc(versions.number));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.getTime() }));
}

/** One version's source, if the viewer may read it. */
export async function getVersionSource(
  viewer: Viewer,
  versionId: number,
): Promise<VersionSource> {
  const row = await db
    .select({
      id: versions.id,
      moduleId: versions.moduleId,
      module: modules.name,
      number: versions.number,
      source: versions.source,
    })
    .from(versions)
    .innerJoin(modules, eq(modules.id, versions.moduleId))
    .where(eq(versions.id, versionId))
    .get();
  const owner = row && (await ownerOfModule(row.moduleId));
  if (!row || !owner || !canRead(viewer, owner)) throw new Error(NOT_FOUND);
  return {
    id: row.id,
    module: row.module,
    number: row.number,
    source: row.source,
  };
}

/** The user id of group `number`, or null. Admins are never groups. */
export async function groupUserId(number: number): Promise<string | null> {
  const row = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    })
    .from(user)
    .where(eq(user.username, String(number)))
    .get();
  const viewer = row && viewerOf(row);
  return viewer?.kind === "group" ? viewer.userId : null;
}

/** The latest version of an account's module, by name ignoring case. */
export async function latestVersion(
  ownerUserId: string,
  name: string,
): Promise<{ module: string; number: number; source: string } | null> {
  const row = await db
    .select({
      module: modules.name,
      number: versions.number,
      source: versions.source,
    })
    .from(modules)
    .innerJoin(versions, eq(versions.moduleId, modules.id))
    .where(and(eq(modules.ownerUserId, ownerUserId), sameName(name)))
    .orderBy(desc(versions.number))
    .limit(1)
    .get();
  return row ?? null;
}

/**
 * The latest version of each module a build names, as `g<n>_<name>` for a
 * group's or a plain name for the viewer's own. Names nobody can see are
 * left out, so an admin's module looks like one that doesn't exist.
 */
export async function fetchBuildModules(
  viewer: Viewer,
  names: ReadonlyArray<string>,
): Promise<Array<FetchedModule>> {
  const found = new Map<string, FetchedModule>();
  for (const name of names) {
    const target = importTarget(name);
    const owner =
      target.kind === "own" ? viewer.userId : await groupUserId(target.group);
    const latest = owner && (await latestVersion(owner, target.name));
    if (!latest) continue;
    const visible =
      target.kind === "own"
        ? latest.module
        : groupModuleName(target.group, latest.module);
    found.set(visible.toLowerCase(), {
      name: visible,
      namespace:
        target.kind === "own" ? namespaceOf(viewer) : `group:${target.group}`,
      module: latest.module,
      version: latest.number,
      source: latest.source,
    });
  }
  return [...found.values()];
}

/**
 * Stores a new version of one of the viewer's modules, creating the module on
 * its first publish. Versions are numbered 1, 2, 3... and never change.
 */
export async function publishModule(
  viewer: Viewer,
  name: string,
  source: string,
): Promise<PublishResult> {
  // The browser assembled it and checked its imports before sending it.
  const problem = checkStored(name, source);
  if (problem) return { ok: false, problem };

  // The unique index ignores case, so `TRIG` and `trig` are one module.
  await db
    .insert(modules)
    .values({ ownerUserId: viewer.userId, name })
    .onConflictDoNothing();
  const module = await db
    .select({ id: modules.id, name: modules.name })
    .from(modules)
    .where(and(eq(modules.ownerUserId, viewer.userId), sameName(name)))
    .get();
  if (!module) throw new Error("The module couldn't be created");
  // One statement picks the next number, so concurrent publishes can't
  // both take it (the unique index refuses the second).
  const version = await db.get<{ number: number }>(sql`
    INSERT INTO ${versions} (module_id, number, source)
    SELECT ${module.id}, coalesce(max(number), 0) + 1, ${source}
    FROM ${versions} WHERE module_id = ${module.id}
    RETURNING number`);
  return { ok: true, module: module.name, version: version.number };
}
