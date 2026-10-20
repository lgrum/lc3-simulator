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
`vp run auth:schema`, then `vp run db:generate`. Check the SQL drizzle-kit
writes for those tables: to change a column's type it rebuilds the table,
and on D1 dropping `user` cascades to every table that references it
(migrations 0001 and 0002 update values in place instead).

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
one. They hash the password with the Worker's pepper, which they read from
`production.secrets.local` in the current folder (a `KEY=value` file, never
committed), or the file given with `--secrets <file>`; with `--local`, from
`.dev.vars`. A `PASSWORD_PEPPER` environment variable overrides both.

### Secrets

| Name                 | What                                    | Set with                               |
| -------------------- | --------------------------------------- | -------------------------------------- |
| `BETTER_AUTH_SECRET` | Signs session cookies (32+ characters)  | `pnpm exec wrangler secret put <NAME>` |
| `PASSWORD_PEPPER`    | Mixed into every password hash          | `pnpm exec wrangler secret put <NAME>` |
| `PBKDF2_ITERATIONS`  | PBKDF2 cost for new hashes (not secret) | `vars` in `wrangler.jsonc`             |

Locally they come from `.dev.vars` (copy `.dev.vars.example`). The production
values are in `production.secrets.local`, which `wrangler deploy
--secrets-file production.secrets.local` uploads. Changing the pepper
invalidates every password; keep a copy somewhere safe.

### Password hashing

The free plan allows 10 ms of CPU per request, far less than Better Auth's
default scrypt needs. Passwords are hashed with PBKDF2-SHA256 (WebCrypto) over
HMAC-SHA256(pepper, password), stored as
`pbkdf2-sha256$<iterations>$<salt>$<hash>`. When `PBKDF2_ITERATIONS` changes,
each password is rehashed with the new count on its next successful login, so
the count can be raised at any time.

Signing in goes through the `signInFn` server function, which calls
`auth.api.signInUsername`. Better Auth's HTTP handler builds its router on
every request, about 5 ms of CPU on the Worker before any work, so the HTTP
sign-in route (`/api/auth/sign-in/username`) is disabled.

Benchmark, to choose the count on the deployed Worker (2026-10-19):

1. Run `pnpm exec wrangler tail --format json` and read each request's
   `cpuTime`. Workers don't advance timers while computing, so the Worker
   can't time itself.
2. Call `signInFn` for a username that doesn't exist: Better Auth still hashes
   the password once, so this times a login without an account. Stay under
   30 calls a minute, the sign-in limit.
3. Try counts with `pnpm exec wrangler deploy --var PBKDF2_ITERATIONS:<n>`, then
   set the chosen one in `wrangler.jsonc`, rebuild and deploy (`wrangler
deploy` reads the config copied into `dist/` by the build).

Sign-in CPU through `signInFn`, warm requests (the first request of an isolate
costs 25–45 ms more, for start-up):

| Iterations | Median | Range |
| ---------- | ------ | ----- |
| 10,000     | 6–7 ms | 4–11  |
| 12,000     | 6–8 ms | 4–18  |
| 13,000     | 10 ms  | 7–18  |
| 15,000     | 11 ms  | 7–15  |

For comparison, the old HTTP route took 14–16 ms at 10,000 and 8 ms failing
before any hashing; `/api/health` takes 2 ms. PBKDF2 there costs about 1 ms
per 1,000 iterations, three times a development machine (Node 22, x86-64:
3.4 ms at 10,000).

Those probes never sign anyone in. Real logins with an admin account, timed
the same way (warm requests; told apart from sign-outs by the session read
that follows each one):

| Setup                                  | Sign-in median | Sign-in range | Sign-out range |
| -------------------------------------- | -------------- | ------------- | -------------- |
| 10,000 iterations                      | 11 ms          | 9–12          | 7–8            |
| 7,000 iterations                       | 10 ms          | 7–12          | 6–8            |
| 7,000, Better Auth's own D1 (Kysely)   | 13 ms          | 11–17         | 9–13           |
| 7,000, Drizzle, hooks trimmed (as now) | 12 ms          | 10–13         | 7–13           |

A real login creates the session and its cookie on top of the hash; a
sign-out alone takes 6–13 ms. So the hash is no longer most of the cost, and
3,000 fewer iterations saved only about 1 ms. Profiling Better Auth locally
(Node, optimizing tiers off) didn't predict the Worker: its D1/Kysely path
looked about 30% cheaper there but cost more on the Worker, and trimming the
hooks (rehash inside password verify, the admin guard only on /admin/
paths) showed no difference beyond the run-to-run noise of about ±3 ms.
Cold isolates cost 15–45 ms more for either.

The configured count is 7,000. Logins sit around the free plan's 10 ms and
often pass it by a few ms; none of the 40-odd measured requests failed, but
Cloudflare doesn't promise that. The Workers Paid plan (30 s of CPU per
request) removes the question.

Sign-ins are rate-limited per client IP (`cf-connecting-ip`) in D1, by the
server function itself (auth.api calls skip Better Auth's limiter): 30 per
minute, so a whole lab behind one IP can log in at the start of class.

## Cloudflare deployment

The app deploys to Cloudflare Workers (free plan) at <https://lc3.lgrum.xyz>.
`wrangler.jsonc` configures the SPA fallback, the D1 binding and the custom
domain; Cloudflare provisions the DNS record and HTTPS certificate.

Done for lc3.lgrum.xyz on 2026-10-19. For a fresh setup only: create the
database, put its id in `wrangler.jsonc` (`d1_databases[0].database_id`) and
set the secrets (see [Secrets](#secrets)):

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
