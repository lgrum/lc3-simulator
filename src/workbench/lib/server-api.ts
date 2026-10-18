// Every call the workbench makes to the Worker goes through this module, so
// tests can replace it with an offline stub (vitest configs alias it).
import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";

import { getViewerFn } from "@/server/account.functions";
import {
  fetchBuildModulesFn,
  getVersionSourceFn,
  listMyModulesFn,
  listVersionsFn,
  publishModuleFn,
} from "@/server/modules.functions";

import type { AccountBackend } from "./account-store";
import type { ModulesBackend } from "./published-modules";

let client: ReturnType<typeof createClient> | undefined;

function createClient() {
  return createAuthClient({ plugins: [usernameClient()] });
}

/** Created on first use: the SPA shell is prerendered without a window. */
function authClient() {
  client ??= createClient();
  return client;
}

/** Better Auth's endpoints and the session server function. */
export const accountBackend: AccountBackend = {
  fetchViewer: () => getViewerFn(),
  async signIn(username, password) {
    const { error } = await authClient().signIn.username({
      username,
      password,
    });
    if (!error) return null;
    if (error.status === 429) return "rate-limited";
    if ([400, 401, 422].includes(error.status)) return "wrong";
    return "unreachable";
  },
  async signOut() {
    await authClient().signOut();
  },
};

export const modulesBackend: ModulesBackend = {
  listMine: () => listMyModulesFn(),
  listVersions: (moduleId) => listVersionsFn({ data: { moduleId } }),
  getSource: (versionId) => getVersionSourceFn({ data: { versionId } }),
  publish: (name, source) => publishModuleFn({ data: { name, source } }),
  fetchBuild: (names) => fetchBuildModulesFn({ data: { names } }),
};
