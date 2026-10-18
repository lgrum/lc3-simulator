import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// Component tests render the real workbench in Chromium. They run apart from
// the node unit tests (vitest.config.ts) so `vp test` stays fast; run them
// with `vp run test:browser` (once per machine: `pnpm exec playwright install
// chromium`).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // No Worker in component tests: the workbench runs offline.
      "@/workbench/lib/server-api": fileURLToPath(
        new URL("./src/test/server-api-stub.ts", import.meta.url),
      ),
    },
  },
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      strategy: ["localStorage", "preferredLanguage", "baseLocale"],
    }),
    tailwindcss(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  test: {
    include: ["src/**/*.browser.test.tsx"],
    setupFiles: ["./src/test/browser-setup.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      // Wide enough for the desktop layout: file sidebar beside the editor.
      viewport: { width: 1440, height: 900 },
      // Not the default 63315: Windows often reserves 63285-63384 for Hyper-V.
      api: { port: 51315 },
    },
  },
});
