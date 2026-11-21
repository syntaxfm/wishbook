# How it works

## What a visitor gets

- The Syntax crew's gift picks, laid out like a vintage department store catalog: lettered photo callouts, dot-leader prices, catalog numbers, and section tabs (an edition can also have a seek-and-find centerfold; 2026 doesn't).
- A flippable book when two readable pages fit side by side, a single page when one does, and a scrolling feed below that (always on phones). Pages are one fixed size that fits the window but never gets smaller than readable (body text at least 11px); in a short window the spread scrolls and each turn starts back at the top. The outer page edges turn the page.
- The feed scrolls freely (no snapping), with a running head naming the section and page. Page Down / Page Up, Space / Shift+Space, and ← / → step one page at a time.
- Every page has its own URL and its own share card.
- Every catalog number is a timestamp into the gift guide episode.
- Circle items to build a wish list ("Circle it" sits in each item's purchase row, beside its Buy link). Share it as a link or print it as an order form (⌘P).
- Press ⌘K (Ctrl+K) to search every gift by name, brand, or shopper.
- A grouse mascot turns up on every section's first page, the welcome page, the index, the order form, the back cover, search, and the 404 page.
- Fully static, with no analytics.

## Stack

| Area            | Tool                                             |
| --------------- | ------------------------------------------------ |
| Framework       | [Astro](https://astro.build), static output      |
| Language        | TypeScript (strict)                              |
| Content         | YAML files, edited with Keystatic (dev only)     |
| Styling         | Plain CSS: custom properties, container queries  |
| Client JS       | Vanilla TypeScript modules, no UI framework      |
| Images          | `astro:assets` + sharp (AVIF with WebP fallback) |
| Share cards     | Satori + resvg, rendered at build time           |
| Lint / format   | oxlint / oxfmt                                   |
| Tests           | Vitest (logic), Playwright (browser)             |
| Package manager | pnpm                                             |
| Hosting         | Cloudflare Pages                                 |

## URLs and editions

There's a new WishBook every year, and every real URL includes its year, so a shared link never changes:

| URL                       | What it is                                                           |
| ------------------------- | -------------------------------------------------------------------- |
| `/2026/`                  | Cover                                                                |
| `/2026/<section>/`        | A section's first page (its divider page, if it has one)             |
| `/2026/<section>/<slug>/` | Any other page                                                       |
| `/2026/wishlist/?w=…`     | A shared wish list (`w`: the circled item ids as a base64url bitset) |
| `/2026/catalog.txt`       | Plain-text catalog                                                   |
| `/2026/og/<slug>.png`     | Share card for a page                                                |
| `/2026/og/wishlist.png`   | Share card for a wish list                                           |
| `/2026/og/default.png`    | Fallback share card                                                  |

`/` and `/catalog.txt` are build-time copies of the current edition's cover and catalog. Their canonical URL points at `/2026/`. Year-less section links (`/favorites/…`) and `/wishlist/` redirect (302) to the current edition via `_redirects`, generated at build from the current edition's sections. Site-wide files without a year: the icons and `/site.webmanifest`, `/robots.txt`, `/sitemap.xml`, and `/404.html`.

## The whole book in every file

Every page file contains the whole book, opened at that page. After the first load, turning pages and jumping (tabs, cross-references, search, hotspots) happen in the browser with no reloads; the address bar always shows the open page's year-scoped URL, so whatever a visitor copies is permanent. Opening `/` and turning a page moves the address to `/2026/…`. A page turn replaces the URL; a jump pushes it, so Back returns to where you were.

The 2026 book has no section divider pages, so each section's own path (`/2026/tech/`) is a copy of its first page (`/2026/tech/olight/`, which it names as canonical), and the section tabs link to that first page. Filler pages (inserted to keep spreads on the right sides) get real URLs too, in the section before them.

Without JavaScript, each file still renders its own page, and every tab, folio, and cross-reference is a real link.

All URLs are built with the helper in `src/lib/urls.ts`. Never hard-code a path, and don't use Astro's `base` option.

The full engineering detail (reading modes, the book engine, page fit, the wish list, search, print) is in [Architecture](04-architecture.md); the look is in [Design system](05-design-system.md).
