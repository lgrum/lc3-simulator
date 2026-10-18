// Replaces src/workbench/lib/server-api.ts in tests: there is no Worker, so
// nobody is logged in and nothing is published.
import type { AccountBackend } from "@/workbench/lib/account-store";
import type { ModulesBackend } from "@/workbench/lib/published-modules";

const offline = () => Promise.reject(new Error("No server in tests"));

export const accountBackend: AccountBackend = {
  fetchViewer: () => Promise.resolve(null),
  signIn: () => Promise.resolve("unreachable"),
  signOut: () => Promise.resolve(),
};

export const modulesBackend: ModulesBackend = {
  listMine: () => Promise.resolve([]),
  listVersions: offline,
  getSource: offline,
  publish: offline,
  fetchBuild: offline,
};
