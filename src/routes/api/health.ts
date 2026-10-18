import { createFileRoute } from "@tanstack/react-router";

import { readHealth } from "@/server/health.server";

// `curl https://lc3.lgrum.xyz/api/health` checks the Worker and D1.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => Response.json(await readHealth()),
    },
  },
});
