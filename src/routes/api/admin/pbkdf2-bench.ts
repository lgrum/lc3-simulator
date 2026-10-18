import { createFileRoute } from "@tanstack/react-router";

import { MAX_ITERATIONS, hashPassword } from "@/server/auth/password";
import { getViewer } from "@/server/session.server";

// Picks PBKDF2_ITERATIONS on the deployed Worker (README, "Password hashing"):
// while logged in as an admin, open /api/admin/pbkdf2-bench?iterations=N and
// read the request's CPU time with `wrangler tail --format json`. Workers
// don't advance timers during computation, so the Worker can't time itself.
export const Route = createFileRoute("/api/admin/pbkdf2-bench")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const viewer = await getViewer();
        if (viewer?.kind !== "admin")
          return new Response("Admins only", { status: 403 });
        const iterations = Number(
          new URL(request.url).searchParams.get("iterations") ?? "10000",
        );
        if (
          !Number.isInteger(iterations) ||
          iterations < 1 ||
          iterations > MAX_ITERATIONS
        )
          return new Response(`iterations must be 1 to ${MAX_ITERATIONS}`, {
            status: 400,
          });
        await hashPassword("benchmark-password", {
          pepper: "benchmark-pepper",
          iterations,
        });
        return Response.json({ iterations });
      },
    },
  },
});
