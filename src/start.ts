import { createStart } from "@tanstack/react-start";

// Browser-only SPA: no route renders on a server, in dev or in the build.
export const startInstance = createStart(() => ({
  defaultSsr: false,
}));
