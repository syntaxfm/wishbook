# Contributing

How to work on the WishBook. For what the project is and how to update content, see the [README](README.md); for the project rules, see [AGENTS.md](AGENTS.md).

## Setup

Requires Node 24+ and **pnpm** (don't add npm or yarn lockfiles).

```sh
pnpm install
pnpm dev          # http://localhost:4321/2026/ (content admin at /keystatic)
```

## Scripts

| Command                | What it does                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `pnpm dev`             | Start the dev server (Keystatic admin at `/keystatic`)             |
| `pnpm build`           | Build the static site, share cards, and `catalog.txt` into `dist/` |
| `pnpm preview`         | Serve `dist/` locally                                              |
| `pnpm check`           | Type-check (`astro check`, including `.astro` templates)           |
| `pnpm lint`            | Lint with oxlint                                                   |
| `pnpm format`          | Format with oxfmt (`pnpm format:check` to verify only)             |
| `pnpm test`            | Unit tests (Vitest)                                                |
| `pnpm test:e2e`        | Browser tests (Playwright; builds and previews the site itself)    |
| `pnpm assets`          | List expected assets (present or missing), then missing links      |
| `pnpm links`           | List items still missing a buy link                                |
| `pnpm optimize:assets` | Re-encode new source images under `assets/` as WebP (≤ 2000px)     |
| `pnpm icons`           | Remake the grouse favicons and home-screen icons in `public/`      |
| `pnpm textures`        | Re-bake the paper, print, and wood texture tiles                   |

## Before you commit

Run `pnpm check`, `pnpm lint`, `pnpm format:check`, and `pnpm test`. Also run `pnpm test:e2e` when you touch layout, navigation, the book engine, URLs, or anything in the build output. Every page must still fit its page box: the page-fit test names any page that doesn't. See [Testing](docs/06-testing.md).

## Commits

- Small, focused commits with conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Commit each completed unit of work with the checks passing.
- Commit `pnpm-lock.yaml` with every dependency change (Cloudflare installs from it).

## Ground rules

- **Everything is local.** No CDNs, remote images, embeds, analytics, or requests to other origins; the only external URLs are outbound links (buy links and the episode).
- **Content lives in YAML**, never in markup. Never type a page number: page numbers and cross-references are computed.
- **Item ids are permanent** and never reused within an edition.
- **Build every URL with `src/lib/urls.ts`**; every real URL includes the edition year.
- **Keystatic is dev-only.** The production build is always plain static files.
- **No UI framework:** client code is vanilla TypeScript.

## Docs

- [How it works](docs/01-how-it-works.md)
- [Content reference](docs/02-content-reference.md)
- [Images](docs/03-images.md)
- [Architecture](docs/04-architecture.md)
- [Design system](docs/05-design-system.md)
- [Testing](docs/06-testing.md)
- [Deploying](docs/07-deploying.md)
- [Starting next year's WishBook](docs/08-new-edition.md)
