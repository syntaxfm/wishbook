# Deploying

The site deploys to **Cloudflare Pages** as plain static files: no adapter, no functions. Every push to `main` redeploys; other branches get preview URLs.

## Cloudflare Pages settings

| Setting                | Value                                    |
| ---------------------- | ---------------------------------------- |
| Production branch      | `main`                                   |
| Framework preset       | None (or Astro)                          |
| Build command          | `pnpm build`                             |
| Build output directory | `dist`                                   |
| Environment variables  | `NODE_VERSION=24`, `PNPM_VERSION=12.8.1` |
| Package manager        | pnpm, detected from `pnpm-lock.yaml`     |
| Custom domain          | `wishbook.syntax.fm`                     |

Cloudflare installs with the lockfile, so commit `pnpm-lock.yaml` with every dependency change. pnpm doesn't run dependency install scripts unless they're allowed: `pnpm-workspace.yaml` allows esbuild's (`allowBuilds`), and sharp and resvg ship prebuilt binaries, so nothing else needs one. If a new dependency needs its install script, add it there.

## What the build provides

- `public/_headers`: caching rules. The general `/*` rule comes first and narrower rules clear `Cache-Control` before setting their own, because Cloudflare joins repeated headers. Hashed `/_astro/` files cache forever, HTML revalidates after 5 minutes, and `catalog.txt` is served as UTF-8 text.
- `dist/_redirects`: year-less section paths redirect (302) to the current edition, generated at build.
- `dist/404.html`: served by Cloudflare for any missing path, with a 404 status.
- `/robots.txt` and `/sitemap.xml`, generated at build.
- No server code, and the Keystatic admin is never in the build.

## HTTPS and `curl -L`

The syntax.fm zone redirects every `http://` request to `https://` ("Always Use HTTPS"). `curl` doesn't follow redirects unless it's given `-L`, so the printed command is `curl -L wishbook.syntax.fm/catalog.txt`. Don't drop the `-L` unless plain HTTP is allowed for the catalog.

## After deploying

1. Open `https://wishbook.syntax.fm/` and turn a few pages.
2. Run `curl -L wishbook.syntax.fm/catalog.txt`.
3. Visit a missing path (`/nope`) to see the 404 page.
4. Paste a page link into Slack, Discord, or iMessage to check its share card.
