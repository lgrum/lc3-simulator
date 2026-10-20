import { sql } from "drizzle-orm";

import { db } from "./db/client.server";
import { rateLimit } from "./db/schema";

export type RateLimitRule = {
  /** The window's length in seconds. */
  window: number;
  /** How many requests a window allows. */
  max: number;
};

/**
 * Counts one request against `key` in fixed windows, stored in D1 (in-memory
 * counts don't work across Workers isolates). Returns whether the request is
 * allowed. One statement reads and updates the count, so concurrent requests
 * can't both take the last place.
 */
export async function consumeRateLimit(
  key: string,
  { window, max }: RateLimitRule,
): Promise<boolean> {
  const now = Date.now();
  const windowMs = window * 1000;
  // last_request holds when the current window started.
  const row = await db.get<{ count: number }>(sql`
    INSERT INTO ${rateLimit} (id, key, count, last_request)
    VALUES (${crypto.randomUUID()}, ${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN ${now} - last_request >= ${windowMs}
        THEN 1 ELSE count + 1 END,
      last_request = CASE WHEN ${now} - last_request >= ${windowMs}
        THEN ${now} ELSE last_request END
    RETURNING count`);
  return row.count <= max;
}
