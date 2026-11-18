# Syntax WishBook

The Syntax Holiday Gift Guide as an interactive 90s Christmas catalog: a "wish book" you can flip through, circle gifts in, and share. It lives at **wishbook.syntax.fm**.

- The Syntax crew's gift picks, laid out like a vintage department store catalog: lettered photo callouts, dot-leader prices, catalog numbers, section tabs, and a centerfold.
- A flippable book on desktop, single pages on tablets, and a scrolling feed on phones.
- A new WishBook every year. Each edition lives under its year (`/2026/…`), so every shared link is permanent.
- Every page has its own URL and its own share card.
- Every catalog number is a timestamp into the gift guide episode.
- Circle items to build a wish list. Share it as a link or print it as an order form.
- Fully static, with no analytics. Hosted on Cloudflare Pages.

## Stack

| Area            | Tool                                            |
| --------------- | ----------------------------------------------- |
| Framework       | [Astro](https://astro.build), static output     |
| Language        | TypeScript (strict)                             |
| Content         | YAML files, edited with Keystatic (dev only)    |
| Styling         | Plain CSS: custom properties, container queries |
| Client JS       | Vanilla TypeScript modules, no UI framework     |
| Images          | `astro:assets` + sharp (AVIF/WebP, responsive)  |
| Share cards     | Satori + resvg, rendered at build time          |
| Lint / format   | oxlint / oxfmt                                  |
| Tests           | Vitest (logic), Playwright (browser)            |
| Package manager | pnpm                                            |
| Hosting         | Cloudflare Pages                                |

## Getting started

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev          # local dev server; content admin at /keystatic
pnpm build        # static site in dist/
pnpm preview      # serve the built site
```

## Scripts

| Command         | What it does                                                       |
| --------------- | ------------------------------------------------------------------ |
| `pnpm dev`      | Start the dev server                                               |
| `pnpm build`    | Build the static site, share cards, and `catalog.txt` into `dist/` |
| `pnpm preview`  | Serve `dist/` locally                                              |
| `pnpm check`    | Type-check (`astro check`)                                         |
| `pnpm lint`     | Lint with oxlint                                                   |
| `pnpm format`   | Format with oxfmt (`pnpm format:check` to verify only)             |
| `pnpm test`     | Unit tests (Vitest)                                                |
| `pnpm test:e2e` | Browser tests (Playwright)                                         |
| `pnpm assets`   | List expected assets for the current edition, present or missing   |

## URLs and editions

Every real URL includes the edition year:

| URL                       | What it is            |
| ------------------------- | --------------------- |
| `/2026/`                  | Cover                 |
| `/2026/<section>/`        | Section divider       |
| `/2026/<section>/<slug>/` | Any other page        |
| `/2026/wishlist/?w=…`     | A shared wish list    |
| `/2026/catalog.txt`       | Plain-text catalog    |
| `/2026/og/<slug>.png`     | Share card for a page |

`/` and `/catalog.txt` are build-time copies of the current edition's cover and catalog. Their canonical URL points at `/2026/`. Year-less section links (`/favorites/…`) redirect (302) to the current edition via `public/_redirects`.

All URLs are built with the helper in `src/lib/urls.ts`. Never hard-code a path, and don't use Astro's `base` option.

## Updating content

Everything editable lives in `content/` as YAML. Edit it in the browser with Keystatic: run `pnpm dev` and open `/keystatic`. Keystatic is dev-only; the production build has no admin. You never edit page markup to change content.

- `content/editions.yaml`: the list of editions and the `current` one.
- `content/global.yaml`: settings shared across years.
- `content/<year>/`: everything for one edition.
- `assets/<year>/`: that edition's images. Item photos are named `assets/<year>/items/<id>-<name>.<ext>` with the id zero-padded to three digits (`001-silicone-cables.png`; extras `-2`, `-3`, item art `-hero`). Host photos are `assets/<year>/hosts/<host-id>.<ext>`; generated art goes in `assets/<year>/generated/`. Shared brand assets live in `assets/brand/`. Images aren't uploaded through Keystatic: drop the file into its folder and it shows up. Until then, a placeholder shows.

In each edition (`content/<year>/`):

- **Items** (`items/*.yaml`): one file per gift, with id, name, picker, section, prices, buy and maker links, descriptions, variants, and quotes. Item ids are permanent and never reused.
- **Hosts** (`hosts/*.yaml`): the shoppers, with role, bio, and their picks page.
- **Book order** (`book.yaml`): which pages exist, in what order, which layout each uses, which items they show, and their copy. Page numbers, filler pages, and cross-references are all computed from this.
- **Sections** (`sections.yaml`): the thumb-index sections, in order.
- **Timestamps** (`timestamps.yaml`): the one file mapping each item to its moment in the episode. Update it when the final video is published.
- **Site settings** (`site.yaml`): episode, cover band, welcome page, symbol key, order lines, back cover.
- **Generated art** (`assets.yaml`): each generated image's key, file, placeholder title and color, and prompt.

In copy, write `{page:icemag}` for a page reference (rendered "page 6 A"), `{syn:leatherman}` for a catalog number, `{count}` for the number of gifts, `{phone}` for the phone number, and `**bold**` / `*italic*` for emphasis.

Missing or invalid content fails the build with a clear error.

## Deploying

Cloudflare Pages: build command `pnpm build`, output directory `dist`. Caching rules live in `public/_headers`, year-less redirects in `public/_redirects`.
