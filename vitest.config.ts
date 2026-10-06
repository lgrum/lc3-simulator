import { defineConfig } from "vite-plus";

// Pure simulator/assembler tests do not need the app's SSR or devtools servers.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
  },
});
