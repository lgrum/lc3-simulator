# LC-3 Simulator

An LC-3 assembler and simulator that runs entirely in the browser. It is a
TanStack Start app in SPA mode: no route renders on a server, there are no
server functions, and the build is a set of static files.

- Assembler: `src/lib/assembler/`
- Simulator engine: `src/lib/simulator/` (see its [README](src/lib/simulator/README.md))

## Development

```bash
vp install
vp dev          # http://localhost:3000
vp check        # format, lint, type check
vp test run
```

UI strings live in `messages/en.json` and `messages/es.json` (Paraglide).
The interface follows the browser's preferred language when Spanish is available
and otherwise defaults to English.

## Build

```bash
vp build
vp preview      # serve the build locally
```

Deploy the contents of `dist/client/`. `dist/server/` is only used at build time
to prerender the HTML shell and is not deployed.

The shell is emitted as `dist/client/index.html`. Every route renders on the
client, so a host must answer unknown paths with `index.html` (an SPA fallback),
otherwise a reload on a deep link returns 404:

| Host                             | Fallback                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Netlify / Cloudflare Pages       | `dist/client/_redirects` with `/* /index.html 200`                                         |
| Vercel                           | `vercel.json` with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }` |
| GitHub Pages                     | copy `index.html` to `404.html`                                                            |
| nginx                            | `try_files $uri /index.html;`                                                              |
| Any static server (e.g. `serve`) | `serve -s dist/client`                                                                     |

`vp preview` does not apply this fallback.

## Cloudflare deployment

The app deploys to Cloudflare Workers as static assets at
<https://lc3.lgrum.xyz>. `wrangler.jsonc` configures the SPA fallback and custom
domain; Cloudflare provisions the DNS record and HTTPS certificate.

```bash
pnpm exec wrangler login   # once, or when the login expires
vp run deploy             # build and deploy dist/client/
```

Deployment uses the Cloudflare account that owns `lgrum.xyz`. If the login has
access to multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` to select that account.

### Group submissions

The `/entregas` page authenticates groups
`1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 18, 19, 20, 21, 22, 23, 24, 27, 30`.
The Worker stores password hashes, account state, login limits, and expiring
sessions in D1. Submitted `.asm` files remain in the `lc3-group-submissions`
R2 bucket as `grupo<number>.asm`; a later upload by the same group replaces
its previous file. Files must be no larger than 1 MiB. Signed-in groups can
download only their own submission; the Worker derives the storage key from
the authenticated session and does not accept a group ID for this operation.
Groups can also change their password after signing in by confirming the
current password and entering a new password of 12–128 characters. A password
change revokes all sessions for that group, so the group must sign in again.

The `/admin` panel requires the administrator password and allows teachers to
inspect all group accounts, generate or regenerate individual group passwords,
disable accounts without deleting their files, and download submitted work.
Generated group passwords are shown only in the response that creates them.
They are salted PBKDF2-SHA256 hashes (600,000 iterations) in D1 and cannot be
retrieved later.

Create the R2 bucket and D1 database once. Replace the `database_id` placeholder
in `wrangler.jsonc` with the ID returned by Wrangler, then apply the schema and
store the initial administrator credential as a Worker secret:

```bash
pnpm exec wrangler r2 bucket create lc3-group-submissions
pnpm exec wrangler d1 create lc3-group-accounts
pnpm exec wrangler d1 migrations apply lc3-group-accounts --remote
pnpm exec wrangler secret put ADMIN_PASSWORD
```

Use a unique, high-entropy administrator password and keep it in a password
manager. Never put it, group passwords, or other credentials in frontend code,
`.env` files committed to the repository, or `wrangler.jsonc`. The database
migration pre-creates all 21 active group accounts with no password; sign in
at `/admin`, select each group, and generate its initial password. Copy and
deliver each password to that group at generation time. Regenerating a
password immediately invalidates the previous password and active sessions
for that group. Sessions expire after eight hours; failed sign-ins are limited
per client address.

Deploy with `vp run deploy` after configuring the bucket, database, migration,
and secret. For local Worker testing, build the app, run
`pnpm exec wrangler d1 migrations apply lc3-group-accounts --local`, create a
local-only `.dev.vars` file containing `ADMIN_PASSWORD` with a strong test
password, and run `pnpm exec wrangler dev`. The `.dev.vars` file is ignored by
Git. `vp dev` alone serves the SPA without the Worker API, D1, or R2.
