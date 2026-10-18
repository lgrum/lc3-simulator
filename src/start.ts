import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

// Browser-only SPA: no route renders on a server, in dev or in the build.
export const startInstance = createStart(() => ({
  defaultSsr: false,
  // Server functions act on the session cookie: refuse calls from other sites.
  requestMiddleware: [
    createCsrfMiddleware({
      filter: ({ request }) =>
        new URL(request.url).pathname.startsWith("/_serverFn/"),
    }),
  ],
}));
