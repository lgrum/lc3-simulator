// Loaded only by the Better Auth CLI to generate the Drizzle schema:
//   vp run auth:schema
// It never runs queries, so the database is a stand-in.
import { drizzle } from "drizzle-orm/d1";

import { createAuth } from "../src/server/auth/options";
import * as schema from "../src/server/db/schema";

export const auth = createAuth({
  db: drizzle({} as D1Database, { schema }),
  secret: "schema-generation-only-secret-0000",
  hashing: { pepper: "unused", iterations: 1 },
  replaceHash: () => Promise.resolve(),
});
