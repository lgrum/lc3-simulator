// Every call the workbench makes to the Worker goes through this module, so
// tests can replace it with an offline stub (vitest configs alias it).
import { getViewerFn, signInFn, signOutFn } from "@/server/account.functions";
import {
  fetchBuildModulesFn,
  getVersionSourceFn,
  listMyModulesFn,
  listVersionsFn,
  publishModuleFn,
} from "@/server/modules.functions";

import type { AccountBackend } from "./account-store";
import type { ModulesBackend } from "./published-modules";

/** The account server functions. */
export const accountBackend: AccountBackend = {
  fetchViewer: () => getViewerFn(),
  signIn: (username, password) => signInFn({ data: { username, password } }),
  signOut: () => signOutFn(),
};

export const modulesBackend: ModulesBackend = {
  listMine: () => listMyModulesFn(),
  listVersions: (moduleId) => listVersionsFn({ data: { moduleId } }),
  getSource: (versionId) => getVersionSourceFn({ data: { versionId } }),
  publish: (name, source) => publishModuleFn({ data: { name, source } }),
  fetchBuild: (names) => fetchBuildModulesFn({ data: { names } }),
};
