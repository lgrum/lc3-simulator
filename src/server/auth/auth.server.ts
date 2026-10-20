import { env, waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { db } from "../db/client.server";
import { account } from "../db/schema";
import { createAuth } from "./options";

const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  hashing: {
    pepper: env.PASSWORD_PEPPER,
    iterations: Number(env.PBKDF2_ITERATIONS),
  },
  replaceHash: async (oldHash, newHash) => {
    await db
      .update(account)
      .set({ password: newHash, updatedAt: new Date() })
      .where(eq(account.password, oldHash));
  },
});

/**
 * Better Auth, for this request. Better Auth sets itself up on first use; if
 * the first request in a new isolate is aborted, that setup can be left
 * hanging and every later auth call in the isolate hangs too. Anchoring it
 * with waitUntil lets it finish whatever happens to the request.
 */
export function getAuth(): typeof auth {
  waitUntil(auth.$context);
  return auth;
}
