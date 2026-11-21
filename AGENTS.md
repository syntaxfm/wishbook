# AGENTS.md

Rules for anyone (human or AI) working in this repo. This file keeps the rules; the explanations and reference live in `docs/`. Read the doc for the area you're changing before you change it.

| Working on                                                                              | Read                                                         |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Content files and fields, copy markup                                                   | [docs/02-content-reference.md](docs/02-content-reference.md) |
| Image naming, optimizing, the archive                                                   | [docs/03-images.md](docs/03-images.md)                       |
| Code layout, pagination, reading modes, the book engine, share cards, wish list, search | [docs/04-architecture.md](docs/04-architecture.md)           |
| Type, palette, paper effects, recurring components, the grouse                          | [docs/05-design-system.md](docs/05-design-system.md)         |
| Tests                                                                                   | [docs/06-testing.md](docs/06-testing.md)                     |
| Deploying, `_headers`, `_redirects`                                                     | [docs/07-deploying.md](docs/07-deploying.md)                 |
| A new year                                                                              | [docs/08-new-edition.md](docs/08-new-edition.md)             |
| Scripts and workflow                                                                    | [CONTRIBUTING.md](CONTRIBUTING.md)                           |

## Project in one paragraph

The Syntax WishBook is a static Astro site that presents a holiday gift guide as a 90s department store Christmas catalog. There is a new WishBook every year (an **edition**), and each edition lives under its year: `/2026/…`. Content (items, hosts, sections, book order, timestamps, site settings) lives in YAML under `content/<year>/`, edited with Keystatic in dev. The build turns it into one static HTML file per page URL. **Every file contains the whole book, opened at that page.** After the first load, page turns and jumps are client-side only: no network requests and no reloads.

## Checks

Before considering any change done, run `pnpm check`, `pnpm lint`, `pnpm format:check`, and `pnpm test`. Run `pnpm test:e2e` when touching layout, navigation, the book engine, URLs, or anything in the build output; it builds and previews the site itself (set `E2E_PORT` to run several checkouts at once). Every script is listed in [CONTRIBUTING.md](CONTRIBUTING.md).

## Tooling

- **pnpm** only. Don't add npm or yarn lockfiles. Commit `pnpm-lock.yaml` with every dependency change.
- **oxlint** lints only the `<script>` blocks of `.astro` files; template issues are caught by `astro check`.
- **No UI framework:** client code is vanilla TypeScript modules. Don't add React, Svelte, Vue, or similar without discussion.
- **Everything is local, always.** Every image, font, stylesheet, and script is a checked-in file served from the site's own origin: no CDNs, no remote images, no embeds, no analytics or trackers, no remote URLs ever. The only external URLs are outbound links (buy links and the episode). The "Watch the Whole Thing" screen is a plain link to the video, never an embed or a remote thumbnail. The e2e suite fails on any request to another origin and on any remote `src`, `srcset`, `<link href>`, or CSS `url()`.
- **Keystatic is dev-only**, and so is the design showcase (`/dev/design-system/`). The production build is always fully static: no adapter, no admin routes, no React.

## Content rules

- **Never hard-code content in markup.** Items, prices, quotes, timestamps, and settings come from content.
- **Never type a page number.** Page numbers, filler pages, and cross-references are computed from the book order. Reference pages and items by slug in content (`{page:<slug>}`, `{syn:<slug>}`).
- **Single sources of truth:** the episode URL and timestamps each live in exactly one place. Catalog numbers come from the timestamps file.
- **Item ids are permanent and never reused** within an edition. Image file names and shared wish-list codes are built from them. A removed item's id stays retired; a new item gets the next unused id.
- **Buy links are content** (`buyLink`): the item's link from the episode description, and the only link the site shows for it (no maker links). Never hard-code a URL. An item without one renders no link and no placeholder anywhere. Every purchase link goes through `ItemLinks.astro`.
- **Quotes** come from the episode transcript, trimmed with "…". A quote flagged as needing verification keeps that flag until reviewed.
- **Prices:** the confirmed price when set, otherwise the estimate with "est.".
- **Read content only through `src/lib/content.ts`** and resolve images only through `src/lib/assets.ts`. Templates get order lines through `ctx.orderLine(id)`, never from `site.orderLines` directly.
- **Images** are local, found by naming convention (`assets/<year>/items/<id>-<name>.<ext>`), never stored as paths or remote URLs. Run `pnpm optimize:assets` after adding them. Move replaced photos to `assets/<year>/archive/`; don't delete them.

## Copy voice

- Write as if the episode is already published ("Watch the whole thing"), never "coming soon."
- Playful, warm, 90s-catalog tone. Keep product claims accurate to what was said in the episode.

## Design rules

- Item letters are always a black square with a white letter and a red offset shadow.
- Host quotes sit with the photo, never inside the item description.
- Full-page features: no bullet lists, stars, or banner-style price labels.
- Photos are contained in their frames, never cropped (except `fill` and the house-brand hero).
- Textures are baked image tiles (`pnpm textures`); never inline SVG noise filters. Every document renders `<PrintFilters />`.
- The grouse renders through `Mascot.astro`: whole, never in a round frame, never mirrored when the pose has lettering.
- Reveals animate transform, opacity, shadow, or stroke only, never layout.

## URL and edition rules

- **Every real URL includes the edition year.** Build every URL with `src/lib/urls.ts`. Never hard-code a path, and don't use Astro's `base` option. Every same-origin URL in the build must start with `/<year>/` or `/_astro/`, except the site-wide root files listed in the architecture doc. Nothing links to the root copies.
- **Editions are independent.** Adding a year must not change a byte of another year's output. Edition-specific styling goes in `src/styles/editions/<year>.css`, never in shared styles keyed on a year.
- The client never navigates across editions.
- **History:** a page turn replaces the URL; a jump pushes it.
- `catalog.txt` lines stay within 80 columns and add no new copy.

## Page fit

Every page fits its fixed page box at full design scale with 2% to spare, at every page width from 560 to 780px, in the worst case. `tests/e2e/page-fit.spec.ts` enforces it. Respect the item caps (`ITEM_CAPS` in `src/lib/schema.ts`): split a page rather than squeeze it. Scaling is a safety net, never the fix.

## Accessibility and performance

- Announce the new page in the polite live region and move focus to its heading after every turn or jump (feed scrolling never announces).
- Respect `prefers-reduced-motion` (instant swaps).
- Every static file renders its own page without JavaScript.
- No scroll snapping anywhere; never hijack wheel, touch, or ↑/↓; never set `overflow-anchor: none`.
- Load images only for the current spread and its neighbours; use `content-visibility` for off-screen pages.

## Commits

- Small, focused commits with conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Commit after each completed unit of work, with checks passing.
- Don't reference external tracker IDs in code, comments, or commit messages.
