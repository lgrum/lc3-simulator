import { defineConfig } from "drizzle-kit";

// Only generates SQL; `wrangler d1 migrations apply` applies it (see README).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
