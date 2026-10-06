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
