// Creates, resets and deletes admin accounts. Admins exist only through this
// script; the app can't create, change or remove them.
//
//   vp run admin:create <username> [--name "Full name"] [--password] [--local]
//   vp run admin:reset <username> [--password] [--local]
//   vp run admin:delete <username> [--local]
//
// Without --local the script writes to the production D1 database. The
// password is hashed here with the same function and pepper as the Worker, so
// PASSWORD_PEPPER must be set in the environment (with --local it is read
// from .dev.vars). Without --password a 4-word token is generated and shown
// once.
//
// Runs on Node with type stripping: node --experimental-strip-types.

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
} from "../src/server/auth/password.ts";
import { generateToken } from "../src/server/auth/tokens.ts";

const DATABASE = "lc3-simulator";
/** Admin usernames start with a letter, so they never look like a group. */
const ADMIN_USERNAME = /^[a-z][a-z0-9_]{0,29}$/;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** KEY=value lines, as in .dev.vars. */
function readDevVars(): Record<string, string> {
  if (!existsSync(".dev.vars")) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) vars[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  return vars;
}

/** The iteration count configured in wrangler.jsonc. */
function configuredIterations(): number {
  const config = readFileSync("wrangler.jsonc", "utf8");
  const match = /"PBKDF2_ITERATIONS"\s*:\s*"(\d+)"/.exec(config);
  if (!match) fail("PBKDF2_ITERATIONS is missing from wrangler.jsonc");
  return Number(match[1]);
}

function quote(value: string | number): string {
  return typeof value === "number"
    ? String(value)
    : `'${value.replaceAll("'", "''")}'`;
}

type Result = Array<{ results?: Array<unknown> }>;

/** Runs SQL statements on D1 with wrangler and returns its JSON results. */
function execute(sql: string, local: boolean): Result {
  const file = join(mkdtempSync(join(tmpdir(), "lc3-admin-")), "admin.sql");
  writeFileSync(file, sql);
  const run = spawnSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      DATABASE,
      local ? "--local" : "--remote",
      "--json",
      `--file=${file}`,
    ],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  if (run.status !== 0) fail(run.stderr || run.stdout || "wrangler failed");
  try {
    return JSON.parse(run.stdout) as Result;
  } catch {
    return [];
  }
}

/** Rows returned by RETURNING clauses: local D1 doesn't report changes. */
const changes = (result: Result) =>
  result.reduce((sum, statement) => sum + (statement.results?.length ?? 0), 0);

async function askPassword(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question(
    `Password (at least ${MIN_PASSWORD_LENGTH} characters): `,
  );
  rl.close();
  if (password.length < MIN_PASSWORD_LENGTH)
    fail(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  return password;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      local: { type: "boolean", default: false },
      password: { type: "boolean", default: false },
      name: { type: "string" },
    },
  });
  const [command = "", rawUsername = ""] = positionals;
  if (!["create", "reset", "delete"].includes(command))
    fail("Usage: admin.ts create|reset|delete <username> [--local]");
  const username = rawUsername.toLowerCase();
  if (!ADMIN_USERNAME.test(username))
    fail(
      "Admin usernames start with a letter and use only letters, digits and _ (at most 30).",
    );
  const local = values.local;
  const where = `${local ? "local" : "production"} database`;
  const adminId = `(SELECT id FROM user WHERE username = ${quote(username)} AND role = 'admin')`;

  if (command === "delete") {
    const result = execute(
      [
        `DELETE FROM versions WHERE module_id IN (SELECT id FROM modules WHERE owner_user_id = ${adminId});`,
        `DELETE FROM modules WHERE owner_user_id = ${adminId};`,
        `DELETE FROM session WHERE user_id = ${adminId};`,
        `DELETE FROM account WHERE user_id = ${adminId};`,
        `DELETE FROM user WHERE username = ${quote(username)} AND role = 'admin' RETURNING id;`,
      ].join("\n"),
      local,
    );
    if (changes(result) === 0) fail(`There is no admin ${username}.`);
    console.log(`Deleted admin ${username} from the ${where}.`);
    return;
  }

  const environment: Record<string, string | undefined> = process.env;
  const pepper =
    environment.PASSWORD_PEPPER ??
    (local ? readDevVars().PASSWORD_PEPPER : undefined);
  if (!pepper) fail("Set PASSWORD_PEPPER to the Worker's pepper secret.");
  const iterations = Number(
    environment.PBKDF2_ITERATIONS ?? configuredIterations(),
  );
  const password = values.password ? await askPassword() : generateToken();
  const hash = await hashPassword(password, { pepper, iterations });
  const now = Date.now();

  if (command === "create") {
    const id = randomUUID().replaceAll("-", "");
    const name = values.name ?? username;
    execute(
      [
        `INSERT INTO user (id, name, email, email_verified, username, display_username, role, banned, created_at, updated_at) VALUES (${[id, name, `${username}@admins.invalid`, 0, username, username, "admin", 0, now, now].map(quote).join(", ")});`,
        `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (${[randomUUID().replaceAll("-", ""), id, "credential", id, hash, now, now].map(quote).join(", ")});`,
      ].join("\n"),
      local,
    );
    console.log(`Created admin ${username} in the ${where}.`);
  } else {
    const result = execute(
      [
        `UPDATE account SET password = ${quote(hash)}, updated_at = ${now} WHERE provider_id = 'credential' AND user_id = ${adminId} RETURNING id;`,
        // A new password ends the admin's sessions.
        `DELETE FROM session WHERE user_id = ${adminId};`,
      ].join("\n"),
      local,
    );
    if (changes(result) === 0) fail(`There is no admin ${username}.`);
    console.log(`Reset the password of admin ${username} in the ${where}.`);
  }
  if (!values.password) console.log(`Password (shown only now): ${password}`);
}

await main();
