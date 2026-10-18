import { moduleName, resolveImport } from "@/lib/assembler/linker";
import type { ObjectModule } from "@/lib/assembler/types";
import type { FetchedModule } from "@/server/modules";

export type { FetchedModule };

/**
 * An admin's build: group modules and the admin's own published modules are
 * fetched from the server into a read-only `lib/` folder. Imports resolve in
 * each module's owner's namespace (see resolveImport).
 */

/** Where an admin's build gets published modules from. */
export type BuildLibrary = {
  /** The admin's own namespace, `admin:<userId>`. */
  namespace: string;
  /** The latest version of each visible module, by the admin's names. */
  fetch: (names: Array<string>) => Promise<Array<FetchedModule>>;
};

const GROUP_FILE = /^g(\d+)_(.+)$/i;

/**
 * The namespace and name of a local file in an admin's build. A local
 * `g7_trig.asm` is a copy of group 7's `trig`, so its imports resolve in
 * group 7's namespace, and it replaces the published one.
 */
export function localModuleIdentity(
  file: string,
  adminNamespace: string,
  isEntry: boolean,
): { namespace: string; name: string } {
  const name = moduleName(file);
  const group = isEntry ? null : GROUP_FILE.exec(name);
  return group
    ? { namespace: `group:${Number(group[1])}`, name: group[2] }
    : { namespace: adminNamespace, name };
}

/** The file a fetched module goes in: `lib/g7_trig.asm`. */
export function libraryPath(fetched: FetchedModule): string {
  return `lib/${fetched.name}.asm`;
}

/** The name an admin uses for a module, or null if it isn't visible. */
export function visibleName(
  namespace: string,
  name: string,
  adminNamespace: string,
): string | null {
  if (namespace === adminNamespace) return name;
  const group = /^group:(\d+)$/.exec(namespace);
  return group ? `g${group[1]}_${name}` : null;
}

/**
 * Walks the link set from the entry file. Returns the modules it reaches
 * and the imports no module provides, by the admin's names.
 */
export function walkLinkSet(
  modules: ReadonlyArray<ObjectModule>,
  entry: string,
  adminNamespace: string,
): { reached: Array<ObjectModule>; missing: Array<string> } {
  const start = modules.find((module) => module.file === entry);
  if (!start) return { reached: [], missing: [] };
  const reached = [start];
  const missing = new Set<string>();
  for (const importer of reached)
    for (const external of importer.externals.values()) {
      const target = resolveImport(importer.namespace, external.module);
      const found = modules.find(
        (module) =>
          module.namespace === target.namespace &&
          module.name.toLowerCase() === target.name.toLowerCase(),
      );
      if (found) {
        if (!reached.includes(found)) reached.push(found);
        continue;
      }
      const name = visibleName(target.namespace, target.name, adminNamespace);
      if (name) missing.add(name.toLowerCase());
    }
  return { reached, missing: [...missing] };
}

/** The info note for a local file used instead of a published module. */
export function overrideNote(
  localFile: string,
  fetched: FetchedModule,
  adminNamespace: string,
): string {
  const file = localFile.slice(localFile.lastIndexOf("/") + 1);
  if (fetched.namespace === adminNamespace)
    return `Using local ${file} instead of your published v${fetched.version}`;
  const group = fetched.namespace.slice("group:".length);
  return `Using local ${file} instead of group ${group}'s published v${fetched.version}`;
}
