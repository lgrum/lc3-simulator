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

## Cloudflare deployment

The app deploys to Cloudflare Workers (free plan) at <https://lc3.lgrum.xyz>.
`wrangler.jsonc` configures the SPA fallback, the D1 binding and the custom
domain; Cloudflare provisions the DNS record and HTTPS certificate.

First deploy only: create the database and put its id in `wrangler.jsonc`
(`d1_databases[0].database_id`):

```bash
pnpm exec wrangler d1 create lc3-simulator
```

Then, for every deploy:

```bash
pnpm exec wrangler login   # once, or when the login expires
vp run db:migrate:remote   # when there are new migrations
vp run deploy              # build and deploy the Worker and dist/client/
```

Deployment uses the Cloudflare account that owns `lgrum.xyz`. If the login has
access to multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` to select that account.
