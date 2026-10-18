# LC-3 Simulator

An LC-3 assembler and simulator that runs in the browser. It is a TanStack
Start app in SPA mode: no route renders on a server, and the page is a set of
static files. A small Cloudflare Worker with a D1 database serves `/api/*` and
the server functions (`/_serverFn/*`), for accounts and published modules.

- Assembler: `src/lib/assembler/`
- Simulator engine: `src/lib/simulator/` (see its [README](src/lib/simulator/README.md))
- Server code: `src/server/` (Drizzle schema in `src/server/db/schema.ts`)

## Development

```bash
vp install
vp run db:migrate:local   # once, and after each new migration
vp dev          # http://localhost:3000
vp check        # format, lint, type check
vp test run
```

UI strings live in `messages/{en,es}.json` (Paraglide, English and Spanish).

## Build

```bash
vp build
pnpm exec wrangler dev    # serve the build locally, with the Worker and local D1
```

`vp build` emits the static site in `dist/client/` (the SPA shell is
`dist/client/index.html`) and the Worker in `dist/server/`. Every route renders
on the client, so unknown paths are answered with `index.html` (the assets'
`single-page-application` fallback). Only `/api/*` and `/_serverFn/*` run the
Worker first.

## Database

D1 is bound as `DB` and managed with Drizzle. Change `src/server/db/schema.ts`,
then generate a migration and apply it:

```bash
vp run db:generate          # drizzle-kit generate: writes drizzle/NNNN_*.sql
vp run db:migrate:local     # wrangler d1 migrations apply --local
vp run db:migrate:remote    # wrangler d1 migrations apply --remote (production)
```

After changing bindings in `wrangler.jsonc`, regenerate
`worker-configuration.d.ts` with `vp run cf-typegen`.

`curl https://lc3.lgrum.xyz/api/health` checks that the Worker reaches D1.

The Better Auth tables in `src/server/db/auth-schema.ts` are generated from
`src/server/auth/options.ts`; after changing Better Auth plugins, run
`vp run auth:schema`, then `vp run db:generate`.

## Accounts

Everything works without an account. Student groups log in with their group
number and password; admins (professors) with a username and password. Nobody
can sign up: admins manage groups on the `/admin` page, and admin accounts
exist only through these scripts:

```bash
vp run admin:create <username> --name "Full name"   # prints a generated password once
vp run admin:reset <username>                        # new password; ends its sessions
vp run admin:delete <username>
```

They write to the production database. Add `--local` to use the local one, and
`--password` to type a password (at least 10 characters) instead of generating
one. They hash the password with the Worker's pepper, so set `PASSWORD_PEPPER`
in the shell first (with `--local` it is read from `.dev.vars`).

### Secrets

| Name                 | What                                    | Set with                               |
| -------------------- | --------------------------------------- | -------------------------------------- |
| `BETTER_AUTH_SECRET` | Signs session cookies (32+ characters)  | `pnpm exec wrangler secret put <NAME>` |
| `PASSWORD_PEPPER`    | Mixed into every password hash          | `pnpm exec wrangler secret put <NAME>` |
| `PBKDF2_ITERATIONS`  | PBKDF2 cost for new hashes (not secret) | `vars` in `wrangler.jsonc`             |

Locally they come from `.dev.vars` (copy `.dev.vars.example`). Changing the
pepper invalidates every password; keep a copy somewhere safe.

### Password hashing

The free plan allows 10 ms of CPU per request, far less than Better Auth's
default scrypt needs. Passwords are hashed with PBKDF2-SHA256 (WebCrypto) over
HMAC-SHA256(pepper, password), stored as
`pbkdf2-sha256$<iterations>$<salt>$<hash>`. When `PBKDF2_ITERATIONS` changes,
each password is rehashed with the new count on its next successful login, so
the count can be raised at any time.

Benchmark, to choose the count on the deployed Worker:

1. Run `pnpm exec wrangler tail --format json` and log in to the site as an admin.
2. Open `/api/admin/pbkdf2-bench?iterations=10000` (then 15000, 20000...).
3. Read each request's `cpuTime` in the tail output. Pick the largest count
   whose bench stays under about 6 ms, leaving room for the rest of a login,
   then confirm a real login (`/api/auth/sign-in/username`) stays under 10 ms.

Workers don't advance timers while computing, so the Worker can't time itself.
On a development machine (Node 22, x86-64) one hash took 3.4 ms at 10,000
iterations, 6.7 ms at 20,000 and 34 ms at 100,000 (the Workers maximum), so
the configured count starts at 10,000.

Sign-ins are rate-limited per client IP (`cf-connecting-ip`), stored in D1:
30 username sign-ins per minute, so a whole lab behind one IP can log in at
the start of class.

## Cloudflare deployment

The app deploys to Cloudflare Workers (free plan) at <https://lc3.lgrum.xyz>.
`wrangler.jsonc` configures the SPA fallback, the D1 binding and the custom
domain; Cloudflare provisions the DNS record and HTTPS certificate.

First deploy only: create the database, put its id in `wrangler.jsonc`
(`d1_databases[0].database_id`) and set the secrets (see [Secrets](#secrets)):

```bash
pnpm exec wrangler d1 create lc3-simulator
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put PASSWORD_PEPPER
```

Then, for every deploy:

```bash
pnpm exec wrangler login   # once, or when the login expires
vp run db:migrate:remote   # when there are new migrations
vp run deploy              # build and deploy the Worker and dist/client/
```

Deployment uses the Cloudflare account that owns `lgrum.xyz`. If the login has
access to multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` to select that account.
