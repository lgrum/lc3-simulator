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

UI strings live in `messages/{en,es}.json` (Paraglide, English and Spanish).

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

The `/entregas` page accepts one `.asm` file for groups
`1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 18, 19, 20, 21, 22, 23, 24, 27, 30`.
The Cloudflare Worker checks each group's password and saves the file in the
`lc3-group-submissions` R2 bucket as `grupo<number>.asm`. A later upload by the
same group replaces its previous file. Files must be no larger than 1 MiB.

Create the bucket once, then set the `GROUP_PASSWORDS` Worker secret to a JSON
object whose keys are the group numbers above and values are their passwords.
The secret must include all 21 groups:

```bash
pnpm exec wrangler r2 bucket create lc3-group-submissions
pnpm exec wrangler secret put GROUP_PASSWORDS
```

When prompted for the secret value, paste the JSON password map. Do not put
passwords in frontend code, `.env` files committed to the repository, or
`wrangler.jsonc`. Deploy with `vp run deploy` after configuring the bucket and
secret. For local end-to-end testing, build the app and run
`pnpm exec wrangler dev`; `vp dev` alone serves the SPA without the Worker API
or R2.
