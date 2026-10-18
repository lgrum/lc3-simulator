// Replaces src/workbench/lib/server-api.ts in component tests: there is no
// Worker, so nobody is logged in.
import type { AccountBackend } from "@/workbench/lib/account-store";

export const accountBackend: AccountBackend = {
  fetchViewer: () => Promise.resolve(null),
  signIn: () => Promise.resolve("unreachable"),
  signOut: () => Promise.resolve(),
};
