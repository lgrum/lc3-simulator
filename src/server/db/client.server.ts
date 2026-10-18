import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

/** The D1 database bound as `DB` in wrangler.jsonc. */
export const db = drizzle(env.DB, { schema });
