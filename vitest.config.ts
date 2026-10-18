import { configDefaults, defineConfig } from "vite-plus";

// Pure simulator/assembler tests do not need the app's SSR or devtools servers.
// Component tests (*.browser.test.tsx) run in vitest.browser.config.ts.
export default defineConfig({
  resolve: { tsconfigPaths: true },
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
