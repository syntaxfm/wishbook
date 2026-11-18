# Syntax WishBook

The Syntax Holiday Gift Guide as an interactive 90s Christmas catalog: a "wish book" you can flip through, circle gifts in, and share. It lives at **wishbook.syntax.fm**.

- The Syntax crew's gift picks, laid out like a vintage department store catalog: lettered photo callouts, dot-leader prices, catalog numbers, section tabs, and a centerfold.
- A flippable book on desktop, single pages on tablets, and a scrolling feed on phones.
- Every page has its own URL and its own share card.
- Every catalog number is a timestamp into the gift guide episode.
- Circle items to build a wish list. Share it as a link or print it as an order form.
- Fully static, with no analytics. Hosted on Cloudflare Pages.

## Stack

| Area | Tool |
|---|---|
| Framework | [Astro](https://astro.build), static output |
| Language | TypeScript (strict) |
| Content | Astro content collections with Zod schemas |
| Styling | Plain CSS: custom properties, container queries |
| Client JS | Vanilla TypeScript modules, no UI framework |
| Images | `astro:assets` + sharp (AVIF/WebP, responsive) |
| Share cards | Satori + resvg, rendered at build time |
| Lint / format | oxlint / oxfmt |
| Tests | Vitest (logic), Playwright (browser) |
| Package manager | pnpm |
| Hosting | Cloudflare Pages |

## Getting started

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev          # local dev server
pnpm build        # static site in dist/
pnpm preview      # serve the built site
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Build the static site, share cards, and `catalog.txt` into `dist/` |
| `pnpm preview` | Serve `dist/` locally |
| `pnpm check` | Type-check (`astro check`) |
| `pnpm lint` | Lint with oxlint |
| `pnpm format` | Format with oxfmt (`pnpm format:check` to verify only) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Browser tests (Playwright) |

## Updating content

Everything editable lives in `src/content/` and `src/config/`. You never edit page markup to change content.

- **Items** (gifts): one file per item, with name, picker, section, price, link, images, descriptions, and quotes.
- **Book order**: which pages exist, in what order, which layout each uses, and which items they show. Page numbers, filler pages, and cross-references are all computed from this.
- **Timestamps**: a single file mapping each item to its moment in the episode. Update it when the final video is published.
- **Site settings**: phone number, episode URL, and other one-off values.

Missing or invalid content fails the build with a clear error.

## Deploying

Cloudflare Pages: build command `pnpm build`, output directory `dist`. Caching rules live in `public/_headers`.
