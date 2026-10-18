import { sql } from "drizzle-orm";

import { db } from "./db/client.server";

/** Proves the Worker reaches D1 and the migrations were applied. */
export async function readHealth(): Promise<{ ok: true; modules: number }> {
  const row = await db.get<{ modules: number }>(
    sql`select count(*) as modules from modules`,
  );
  return { ok: true, modules: row.modules };
}
