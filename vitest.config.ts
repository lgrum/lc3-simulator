import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vite-plus";

// Pure simulator/assembler tests do not need the app's SSR or devtools servers.
// Component tests (*.browser.test.tsx) run in vitest.browser.config.ts.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // No Worker in unit tests: the workbench runs offline.
      "@/workbench/lib/server-api": fileURLToPath(
        new URL("./src/test/server-api-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    exclude: [
      ...configDefaults.exclude,
      "**/*.browser.test.tsx",
      // Claude Code sessions keep their worktrees here, with copies of the tests.
      ".claude/**",
    ],
  },
});
