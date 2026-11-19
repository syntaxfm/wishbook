# Syntax WishBook

The Syntax Holiday Gift Guide as an interactive 90s Christmas catalog: a "wish book" you can flip through, circle gifts in, and share. It lives at **wishbook.syntax.fm**.

- The Syntax crew's gift picks, laid out like a vintage department store catalog: lettered photo callouts, dot-leader prices, catalog numbers, section tabs, and a centerfold.
- A flippable book on desktop, single pages on tablets, and a scrolling feed on phones.
- A new WishBook every year. Each edition lives under its year (`/2026/…`), so every shared link is permanent.
- Every page has its own URL and its own share card.
- Every catalog number is a timestamp into the gift guide episode.
- Circle items to build a wish list. Share it as a link or print it as an order form (⌘P).
- Press ⌘K (Ctrl+K) to search every gift by name, brand, or shopper.
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
| `pnpm assets`   | List expected assets (present or missing), then missing links      |
| `pnpm links`    | List items still missing a buy or maker link                       |
| `pnpm textures` | Re-bake the paper, print, and wood texture tiles                   |

## URLs and editions

Every real URL includes the edition year:

| URL                       | What it is                                                           |
| ------------------------- | -------------------------------------------------------------------- |
| `/2026/`                  | Cover                                                                |
| `/2026/<section>/`        | Section divider                                                      |
| `/2026/<section>/<slug>/` | Any other page                                                       |
| `/2026/wishlist/?w=…`     | A shared wish list (`w`: the circled item ids as a base64url bitset) |
| `/2026/catalog.txt`       | Plain-text catalog                                                   |
| `/2026/og/<slug>.png`     | Share card for a page                                                |
| `/2026/og/wishlist.png`   | Share card for a wish list                                           |
| `/2026/og/default.png`    | Fallback share card                                                  |

`/` and `/catalog.txt` are build-time copies of the current edition's cover and catalog. Their canonical URL points at `/2026/`. Year-less section links (`/favorites/…`) and `/wishlist/` redirect (302) to the current edition via `_redirects`, generated at build from the current edition's sections.

Every page file contains the whole book, opened at that page. After the first load, turning pages and jumping (tabs, cross-references, hotspots) happen in the browser with no reloads; the address bar always shows the open page's year-scoped URL, so whatever a visitor copies is permanent. Opening `/` and turning a page moves the address to `/2026/…`. Filler pages (inserted to keep spreads on the right sides) get real URLs too, in the section before them.

All URLs are built with the helper in `src/lib/urls.ts`. Never hard-code a path, and don't use Astro's `base` option.

## Updating content

Everything editable lives in `content/` as YAML. Edit it in the browser with Keystatic: run `pnpm dev` and open `/keystatic`. Keystatic is dev-only; the production build has no admin. You never edit page markup to change content.

- `content/editions.yaml`: the list of editions and the `current` one.
- `content/global.yaml`: settings shared across years.
- `content/<year>/`: everything for one edition.
- `assets/<year>/`: that edition's images. Images aren't uploaded through Keystatic: drop the file into its folder and it shows up. Until then, a placeholder shows. Any of `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.svg` works.
  - Item photos: `assets/<year>/items/<id>-<name>.<ext>`, with the id zero-padded to three digits (`001-silicone-usb-c-cables.png`). Only the id prefix and the suffix matter; the name is for people.
  - Extra photos of the same item: `<id>-<name>-2.<ext>`, `-3`, …
  - Generated item art (full-page features): `assets/<year>/items/<id>-<name>-hero.<ext>`.
  - Other generated art (section backgrounds, the centerfold, the grouse): `assets/<year>/generated/`, under the file name listed in `assets.yaml`.
  - Host photos: `assets/<year>/hosts/<host-id>.<ext>`. Cover art: `assets/<year>/cover/`.
  - Shared brand assets: `assets/brand/`.

In each edition (`content/<year>/`):

- **Items** (`items/*.yaml`): one file per gift, with id, name, picker, section, prices, buy and maker links, descriptions, variants, and quotes. Item ids are permanent and never reused. Items "mentioned in passing" (the stocking-stuffers page) are marked as mentions and aren't counted as gifts.
- **Hosts** (`hosts/*.yaml`): the shoppers, with role, bio, and their picks page.
- **Book order** (`book.yaml`): which pages exist, in what order, which layout each uses, which items they show (optionally with page-specific copy), and their copy. Page numbers, filler pages, and cross-references are all computed from this.
- **Sections** (`sections.yaml`): the thumb-index sections, in order.
- **Timestamps** (`timestamps.yaml`): the one file mapping each item to its moment in the episode. Update it when the final video is published.
- **Site settings** (`site.yaml`): episode, share description, purchase-link labels and the affiliate disclosure, cover band, welcome page, symbol key, order lines, order form buttons, wish-list and search copy (including the printed form's mail-to box), back cover, and the copy for automatic filler pages. A page shows an order-line banner only when its `orderLine` is set.
- **Generated art** (`assets.yaml`): each generated image's key, file, placeholder title and color, aspect, prompt, and source item. `pnpm assets` lists which of them still need making.

In copy, write `{page:icemag}` for a page reference (rendered "page 6 A"), `{syn:leatherman-arc}` for a catalog number, `{count}` for the number of gifts, `{phone}` for the phone number, and `**bold**` / `*italic*` for emphasis.

Missing or invalid content fails the build with a clear error.

### What's still missing

`pnpm assets` lists every image the current edition expects (item photos and extras, host photos, generated art and the cover), each marked present or MISSING with the exact path to create, followed by the prompt for each missing piece of generated art. It then lists the items still missing a buy or maker link, with their content files. `pnpm links` prints only the links part. Pass a year (`pnpm assets 2026`) for another edition. Nothing here is fatal: a missing image renders a placeholder and a missing buy link renders the `links.missingBuy` text.

## Share cards

Every page gets a crafted 1200×630 PNG at `/<year>/og/<slug>.png`, drawn from the same content as the page (title, product photos with item letters and prices, who picked them, section tab, folio, and the WishBook masthead), plus `wishlist.png` and `default.png`. They update on their own when content or images change; missing images show as labeled placeholder blocks, like on the page.

Rendered cards are cached in `node_modules/.cache/wishbook-og/` by a hash of their content, images, and the renderer, so only changed cards are redrawn. Delete that folder to force a full re-render.

## Testing

```sh
pnpm test                   # Vitest: tests/unit/
pnpm test:e2e               # Playwright: tests/e2e/, against pnpm build && pnpm preview
E2E_PORT=4511 pnpm test:e2e # use another port (to run several checkouts at once)
```

- **Unit tests** (`tests/unit/`) run the real content reader, pagination, asset resolver, catalog numbers, copy markup, share-card models and rendering, `catalog.txt` (with a snapshot of the fixture edition), redirects, routes, the wish-list codec, search, and the purchase-link component (rendered with Astro's container API). Most run against `tests/fixtures/`, two small fixture editions (2025 and 2026); a few check the real 2026 content.
- **Browser tests** (`tests/e2e/`) build the site and serve it: deep links in all three reading modes, page turns and jumps (with no network requests, and the right history entries), focus and live-region announcements, no-JavaScript rendering, every template at 390, 820, and 1360px without overflow, purchase links and placeholders, the wish list round trip, ⌘K search, print, and checks on the built files (year-scoped URLs everywhere, no requests to other origins, the root copies, `_redirects`, `catalog.txt`).
- **A second edition side by side** (`tests/e2e/second-edition.spec.ts`): copies the project to a temporary folder, adds the fixture 2025 edition next to the real 2026 one, runs a real `astro build` there, and checks that 2025 gets its own pages, share cards, catalog, and wish list while every 2026 file, the root copies, and `_redirects` stay byte for byte the same as the main build.

## Deploying

The site deploys to **Cloudflare Pages** as plain static files: no adapter, no functions.

| Setting                | Value                                        |
| ---------------------- | -------------------------------------------- |
| Framework preset       | None (or Astro)                              |
| Build command          | `pnpm build`                                 |
| Build output directory | `dist`                                       |
| Environment variables  | `NODE_VERSION=24` (the build needs Node 24+) |
| Package manager        | pnpm, detected from `pnpm-lock.yaml`         |

Cloudflare installs with the lockfile, so commit `pnpm-lock.yaml` with every dependency change. pnpm doesn't run dependency install scripts unless they're allowed: `pnpm-workspace.yaml` allows esbuild's (`allowBuilds`), and sharp and resvg ship prebuilt binaries, so nothing else needs one. If a new dependency needs its install script, add it there.

Caching rules live in `public/_headers` (hashed `/_astro/` files cache forever; HTML revalidates after 5 minutes; `catalog.txt` is served as UTF-8 text). Year-less redirects are written to `dist/_redirects` at build.

## Starting next year's WishBook

Each year is a new edition next to the old ones; nothing from the previous year is edited or moved.

1. Create `content/<year>/` with the same files as the current edition: `site.yaml`, `sections.yaml`, `book.yaml`, `timestamps.yaml`, `assets.yaml`, `items/`, and `hosts/`. Copying the previous year and clearing it out is the quickest start. Item ids start again at 1: ids are per edition, permanent, and never reused within it.
2. Create `assets/<year>/` with `items/`, `hosts/`, `cover/`, and `generated/`, and fill it as photos arrive (`pnpm assets <year>` shows what's missing).
3. Add the year to `content/editions.yaml` and set `current` to it. The current edition is the one served at `/` and `/catalog.txt`, the target of the year-less `_redirects`, and the one Keystatic edits.
4. Optionally add `src/styles/editions/<year>.css` to override tokens or textures for that year only.
5. Decide what happens to older years:
   - **Keep them building** (the default): leave them in `editions.yaml` with their content and assets. Their URLs, share cards, and shared wish lists keep working and pick up site-wide fixes, but they also change whenever shared code changes, and every deploy builds them.
   - **Freeze them as snapshots**: copy the year's built files (`dist/<year>/` and the `dist/_astro/` files they use) into `public/`, then remove the year from `editions.yaml`. Its URLs keep working and never change again, but it no longer picks up fixes. This isn't automated; check the result with `pnpm build && pnpm preview`.
