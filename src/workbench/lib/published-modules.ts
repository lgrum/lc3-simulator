import { moduleName } from "@/lib/assembler/linker";
import type {
  FetchedModule,
  ModuleSummary,
  PublishResult,
  VersionSource,
  VersionSummary,
} from "@/server/modules";

/** How the workbench reaches published modules; replaced in tests. */
export type ModulesBackend = {
  listMine: () => Promise<Array<ModuleSummary>>;
  listVersions: (moduleId: number) => Promise<Array<VersionSummary>>;
  getSource: (versionId: number) => Promise<VersionSource>;
  publish: (name: string, source: string) => Promise<PublishResult>;
  /** Admins: the latest version of each named module (see BuildLibrary). */
  fetchBuild: (names: Array<string>) => Promise<Array<FetchedModule>>;
};

/**
 * Where restoring a version of `module` writes: the local file with that
 * module name if there is one (in any folder), or `<module>.asm` at the root.
 */
export function restorePath(
  files: Iterable<string>,
  module: string,
): { path: string; exists: boolean } {
  for (const path of files)
    if (moduleName(path).toLowerCase() === module.toLowerCase())
      return { path, exists: true };
  return { path: `${module}.asm`, exists: false };
}
