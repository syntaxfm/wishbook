# AGENTS.md

Guidance for anyone (human or AI) working in this repo. See `README.md` for what the project is and how to run it.

## Project in one paragraph

The Syntax WishBook is a static Astro site that presents a holiday gift guide as a 90s department store Christmas catalog. There is a new WishBook every year (an **edition**), and each edition lives under its year: `/2026/…`. Content (items, hosts, sections, book order, timestamps, site settings) lives in YAML under `content/<year>/`, edited with Keystatic in dev. The build turns it into one static HTML file per page URL. **Every file contains the whole book, opened at that page.** After the first load, page turns and jumps are client-side only: no network requests and no reloads.

## Commands

```sh
pnpm dev            # dev server (Keystatic admin at /keystatic)
pnpm build          # static build into dist/ (pages, share cards, catalog.txt)
pnpm preview        # serve dist/
pnpm check          # astro check (types, including .astro templates)
pnpm lint           # oxlint
pnpm format         # oxfmt (write); pnpm format:check to verify
pnpm test           # vitest
pnpm test:e2e       # playwright
pnpm assets         # report present / missing assets and links for the current edition
pnpm links          # only the items missing a buy or maker link
pnpm textures       # re-bake the paper, print, and wood texture tiles
```

Before considering any change done, run `pnpm check`, `pnpm lint`, `pnpm format:check`, and `pnpm test`. Run `pnpm test:e2e` when touching layout, navigation, the book engine, URLs, or anything in the build output. It builds and previews the site itself; set `E2E_PORT` to run it on another port (several checkouts at once).

## Tooling notes

- **pnpm** only. Don't add npm or yarn lockfiles.
- **oxfmt** formats `.astro` through its Prettier-backed path. It requires the `astro` option enabled in the oxfmt config and `@astrojs/compiler-rs` installed as a dev dependency.
- **oxlint** lints only the `<script>` blocks of `.astro` files, so template issues are caught by `astro check`, not the linter.
- No UI framework: client code is vanilla TypeScript modules. Don't add React, Svelte, Vue, or similar without discussion.
- No analytics, trackers, or third-party requests at runtime. Fonts are self-hosted.
- **Everything is local, always.** Every image, font, stylesheet, and script is a checked-in file served from the site's own origin: no CDNs, no remote images, no embeds, no remote URLs ever. The only external URLs are outbound links (buy, maker, the episode). The e2e suite fails on any request to another origin and on any remote `src`, `srcset`, `<link href>`, or CSS `url()` in the build.
- **Vitest uses Astro's Vite config** (`getViteConfig` in `vitest.config.ts`), so unit tests can import `.astro` components and render them with the container API (`experimental_AstroContainer`), as `tests/unit/item-links.test.ts` does.
- **Keystatic is dev-only.** Its integration (and React) is added to the Astro config only for `astro dev`. The production build is always fully static: no adapter, no `/keystatic` or `/api/keystatic` routes, no React.
- Dev accepts URLs with or without a trailing slash (Keystatic's API needs it); production URLs always end in `/`.
- **Design showcase is dev-only.** `/dev/design-system/` renders every component with sample data. Its route is injected only for `astro dev`, so it never reaches `dist/`.

## Structure

```
content/
  editions.yaml   list of editions + `current` (the year served at / and edited in Keystatic)
  global.yaml     settings shared across years (brand, phone number)
  <year>/         one edition: items/, hosts/, site, sections, book order, timestamps, assets manifest
assets/
  brand/          shared brand assets (logo)
  <year>/         one edition: items/, hosts/, cover/, generated/
src/
  lib/            urls.ts (URL helper), schema.ts (content schema), content.ts (reader),
                  assets.ts (asset resolver), copy.ts (copy markup), catalog.ts (catalog
                  numbers, prices, order lines), og.ts + og-layout.ts (share cards),
                  editions, paginate.ts (page numbers, fillers, spreads, refs), book.ts
                  (the per-edition context every template gets), redirects.ts (_redirects),
                  catalog-txt.ts (the plain-text catalog), item-index.ts (the item index
                  embedded for the client); pure modules shared with the client:
                  spreads.ts (pairing pages into spreads), modes.ts (reading-mode
                  breakpoints and the head script), routes.ts (path ↔ slug table),
                  wishlist-codec.ts (share codes), search.ts (fuzzy match), marker.ts
  layouts/        BookPage.astro (one HTML file: meta + the whole book opened at a page);
                  templates/ (one component per catalog layout, plus Filler)
  components/     catalog building blocks (Img, Placeholder, ItemLetter, PhotoQuote, Price,
                  CatalogNumber, PickedBy, NewBanner, Folio, ShopLine, Kbd, Frame…); content
                  renderers (Copy, CopyParas, ItemCopy, ItemOrder, ItemLinks, ItemQuote,
                  LineQuote); PageShell (one page's <article>), Book (all pages, tabs,
                  prev/next); DesignSystem (styles + font preloads, in <head>), PrintFilters;
                  WishTools, SearchDialog, PrintSheet, ItemIndex (wish list, search, print)
  scripts/        client modules: book.ts (the book engine: modes, turns, routing, tabs, a11y,
                  image loading, reveals), centerfold.ts (legend ↔ hotspot linking),
                  wishlist-store.ts (the stored list + item index), wishlist.ts (toggles,
                  count, order form, share, print), search.ts (⌘K), print-sheet.ts,
                  wishlist-page.ts (the shared-list page)
  styles/         global.css imports, in order: fonts, tokens (palette, type roles), textures,
                  base, components, templates (page layouts), book (shell, reading modes,
                  tabs, purchase links), effects (paper & print), motion, wishlist (toggles,
                  marker loop, chrome tools, search, wish-list page), print (the print
                  stylesheet); editions/<year>.css overrides; textures/ holds the baked tiles
  dev/            dev-only design showcase and its sample images
  pages/
    index.astro   root copy of the current edition's cover
    [edition]/    every real route, generated per edition (pages, og/, wishlist/, catalog.txt)
public/           static files (_headers); _redirects is generated at build
scripts/          node scripts (assets report, texture baking)
keystatic.config.ts   admin config: the schema for the current edition
tests/
  fixtures/       two small fixture editions (content/2025, content/2026, assets/) for unit tests
                  and the side-by-side build
  unit/           vitest: content (reader + validation), paginate, assets (resolver), catalog
                  (numbers, prices), copy, og (routes, models, rendering), catalog-txt (+ snapshot
                  in __snapshots__/), redirects, routes (paths, spreads, modes), urls, wishlist
                  (codec, search, item index), item-links (ItemLinks rendering vs placeholders)
  e2e/            playwright, against the built site: smoke, build-output (static files, meta,
                  year-scoped URLs, no foreign resources, root copies, catalog.txt, _redirects),
                  engine (deep links per mode, turns/jumps, history, focus + live region, no-JS,
                  image loading, centerfold), pages (every page at 390/820/1360 without overflow,
                  modes, no-JS links, item ids, purchase links), design-system (showcase absent,
                  fonts, no requests to other origins on any page), wishlist (round trip, order
                  form, ⌘K, print), second-edition (a fixture year built side by side),
                  layout (fixed page box, fit, edges, prototype layouts), scrolling (no snap,
                  deep links stay put, page keys, far jumps, no document scroll in the book,
                  fit settles)
```

## Content rules

- **Never hard-code content in markup.** Items, prices, quotes, timestamps, and settings come from content/config.
- **Never type a page number.** Page numbers, filler pages, and cross-references are computed from the book order. Reference other pages or items by slug in content; the build renders the label ("page 6 A") and the link.
- **Single sources of truth:** the phone number, episode URL, and timestamps each live in exactly one place.
- **Item ids are permanent and never reused** within an edition. Image file names and shared wish-list codes are built from them, so renumbering or recycling an id breaks old links. A removed item's id stays retired; a new item gets the next unused id.
- **Buy and maker links are editable content** (`buyLink`, `makerLink` in each item's YAML). A missing buy link renders the `links.missingBuy` placeholder; never hide the slot or hard-code a URL. **Link placement is pending owner review**: keep every purchase link going through `ItemLinks.astro` so it can move in one place.
- **Content and copy live in YAML**, editable through Keystatic (`pnpm dev`, then `/keystatic`). Keystatic always edits the current edition.
- **Catalog numbers are timestamps** into the episode (`SYN 036:41`). They come from the timestamps file. Clicking one opens the video at that moment.
- **Quotes** are taken from the episode transcript. Use "…" to trim. Quotes marked as needing verification must keep that flag until reviewed.
- **Prices:** show the confirmed price when set, otherwise the estimate with an "est." marker.
- **Missing images** render the placeholder component (a solid color block with a short title) until the real asset exists. All images are local; never link remote image URLs.
- **Per-edition content and assets:** each year's content lives in `content/<year>/` and its images in `assets/<year>/`. Item images are found by convention, not stored paths: `assets/<year>/items/<id>-<name>.<ext>`, extra photos `-2`, `-3`, item art `-hero`. Only the id prefix and suffix matter. Write ids zero-padded to three digits (`001-silicone-cables.png`); the resolver accepts any padding. Don't end a name in `-<digit>` (it reads as an extra-photo suffix). Keystatic has no image upload fields on purpose: its uploads are named after the field, not the id, so they can't follow the convention. Drop files into the folders instead.
- **Schema and reader:** the schema for every editable field is `src/lib/schema.ts` (Keystatic uses it through `keystatic.config.ts`). Read content only through `src/lib/content.ts` (`getItems(edition)`, `getPages(edition)`, …), which resolves references and fails the build with file-specific errors. Resolve images only through `src/lib/assets.ts` (`resolveAsset(edition, key)`), which returns the image or a placeholder.
- **Copy markup:** copy fields are plain text plus `**bold**`, `*italic*`, and tokens: `{page:<slug>}` (rendered "page 6 A", linked), `{syn:<item-slug>}` (catalog number), `{count}` (gifts in the edition: items not marked "mentioned in passing", see `pickCount`), `{phone}`, `{catalog}`. Parse with `parseCopy` in `src/lib/copy.ts`. Unknown tokens and slugs fail the build.

## Copy voice

- Write as if the episode is already published ("Watch the whole thing"), never "coming soon."
- The phone number is a regular number. Never call it "toll-free."
- Playful, warm, 90s-catalog tone. Keep product claims accurate to what was said in the episode.

## Design system

**Type roles** (self-hosted):

| Role                                      | Font                         |
| ----------------------------------------- | ---------------------------- |
| Masthead                                  | Pinyon Script                |
| Display headlines                         | Playfair Display 700 italic  |
| Item names (caps)                         | Old Standard TT 700          |
| Toy-page serif, section tabs, price boxes | Gelasio 700                  |
| Body                                      | Libre Caslon Text 400        |
| Quotes                                    | Libre Caslon Text 400 italic |
| Kickers, banners (caps)                   | Antonio 700                  |
| Accent script                             | Great Vibes                  |
| Prices                                    | Old Standard TT 700          |
| Catalog numbers                           | JetBrains Mono 400           |
| Handwriting (wish list marker)            | Permanent Marker             |

**Palette:** wish red `#C5301F`, holly green `#2A6E3B`, price yellow `#F7D838`, gold `#F3CF6A`→`#B8862B`, cream paper `#F1E2C4`, peach `#F0CFAE`, warm ink `#2b2119`, Syntax yellow `#FABF46`.

**Paper & print effects** (on every page): warm paper, warm ink, paper grain, paper fibers, warm grade, yellowed edges, gutter shadow on the binding side, photo color grade, ink misregistration on headings and prices, glossy sheen, dust and specks, a worn corner on the outer edge, foxing, and ink bleed on large type only. Not used: halftone dot screen, scan tilt, creases, coffee rings. The cover adds worn-ink masks on its type, a spine crease, and scuffs.

The effects apply to any `.page` (with `.left` / `.right` for the gutter and worn corner). Noise, fiber, dust, foxing, wood, and ink-wear textures are baked image tiles (`scripts/bake-textures.mjs` → `src/styles/textures/`), exposed as CSS variables in `textures.css`; never inline SVG noise filters. Ink bleed is the `#inkbleed` SVG filter, so every document renders `<PrintFilters />`. Each `<html>` carries `data-edition="<year>"` so `src/styles/editions/<year>.css` can override tokens and textures for that year only.

**Recurring components:**

- **Item letters** (A, B, C…) are always a black square with a white letter and a red offset shadow, both on photos and in copy.
- **Host quotes** sit with the photo: below it by default, or on it when a large photo has room. Never put them inside the item description.
- **Full-page features** are a big product shot on a holiday background, price numerals on the photo ("only 67⁹⁰ _Each_"), and running copy with bold lead-ins. No bullet lists, stars, or banner-style price labels.
- **Section tabs** (thumb index) are the primary navigation: on the book edge on desktop, a bottom bar on smaller screens.

## Book, URLs, and navigation

- **Every real URL includes the edition year.** Each logical page has a real path: `/2026/` (cover), `/2026/<section>/` (section divider), `/2026/<section>/<slug>/`. Also `/2026/wishlist/?w=…`, `/2026/catalog.txt`, and `/2026/og/<slug>.png`. Each page has its own `<title>`, canonical URL, and Open Graph tags, all absolute and year-scoped.
- **Root copies:** `/` and `/catalog.txt` are build-time copies of the current edition's cover and catalog, with canonical pointing at `/2026/`. They are real files, not redirects. `dist/_redirects` is generated at build from the current edition's sections (`src/lib/redirects.ts`) and sends (302) year-less section paths to the current edition.
- **catalog.txt** is built by `formatCatalogText(ctx)` in `src/lib/catalog-txt.ts` from the book context (`createBookContext` takes already-loaded content, so tests use fixtures). Every line stays within 80 columns (78 wide; URLs never break). Each item is listed once, at the page the order-form index uses (its feature page, else its first appearance), under its section; items mentioned in passing are grouped under the page that lists them. It prints only order lines with `{phone}` or `{catalog}`, the catalog/estimate key entries, buy links (or `links.missingBuy`), the guarantee, and the disclosure: no new copy. `public/_headers` serves it as `text/plain; charset=utf-8`.
- **Build every URL with the URL helper** (`src/lib/urls.ts`: `editionUrl`, `rootUrl`, `absoluteUrl`). Never hard-code a path. Don't use Astro's `base` option; routes live under `src/pages/[edition]/`. The e2e suite checks every root-relative and same-origin URL in the built HTML, `catalog.txt`, and any sitemap (links, `data-path`s, share paths, canonical, `og:url`, `og:image`): each must start with `/<year>/` or `/_astro/`. Nothing links to the root copies.
- **Editions are independent.** Adding a year must not change a byte of another year's output; `tests/e2e/second-edition.spec.ts` builds the fixture 2025 edition next to 2026 and compares. Edition-specific styling goes in `src/styles/editions/<year>.css`, never in shared styles keyed on a year. Steps for a new year are in the README ("Starting next year's WishBook").
- The client never navigates across editions. Links to another year are normal full-page links.
- **Share cards** are crafted 1200×630 images per page (not screenshots), generated at build with Satori + resvg. Satori supports flexbox only, with no CSS filters or masks, so textures are pre-baked images.
  - `src/lib/og.ts` turns content into plain card models (variants: cover, divider, items, feature, centerfold, page, wishlist, default) and renders them with a content-hash cache in `node_modules/.cache/wishbook-og/`. `src/lib/og-layout.ts` draws them. The route is `src/pages/[edition]/og/[slug].png.ts`; every page's `og:image` is `ogImageUrl(edition, slug)`.
  - Which pages get a card comes from `ogSources()` in `og.ts` (one function). Each source is a page or filler copy, with an optional folio and binding side.
  - Fonts are the `.woff` files from the `@fontsource` packages (Satori can't read woff2). Photos are resized and color graded with sharp and passed as data URIs. The paper effects reuse the baked tiles in `src/styles/textures/`, composited onto the rendered card with sharp (grain at half strength so PNGs stay small).
  - Every card carries the masthead, `wishbook.syntax.fm`, and the edition ("WishBook 2026"). Prices follow the page rules (estimates get "est."). Keep each card under about 300 KB: the encoder lowers palette quality for photo-heavy cards.
  - In Satori, a div defaults to `display: block` and `box-sizing: content-box`; the `h()` helper sets flex and border-box. An image drawn over text hides the text, so put overlays (like the wish-list marker loop) before the content they surround.
- **Reading mode by viewport:** book with spreads and a 3D page turn (≥ 1000px), single page with turn (≥ 640px), vertical scroll below that. On small screens the centerfold becomes a horizontal swipe strip with its legend below.
- **Placement rules** are enforced at build: spreads are even (left) / odd (right), the centerfold opens as a spread, and the back cover sits alone on the left. Filler pages are inserted automatically to satisfy them.
- **Pagination API:** `paginate(edition)` in `src/lib/paginate.ts` returns the `Book`: `pages` in order (each `BookPage` has `slug`, `path` inside the edition, `n`/`end`, folio `label` "6 A", `side` left/right/spread, `section`, `title`, `kind` cover/divider/centerfold/back/filler/page, `template`, and for fillers `fillerCopy` {title, text, art}), `spreads`, and helpers `page`, `label`, `ref` ("page 6 A"), `spreadOf`, `firstOf`, `rangeOf`. The centerfold is one entry spanning two numbers. Fillers get a slug from their title and a path in the section before them (`/2026/back/the-grouse-says-hi/`), so they are real pages too. `paginateBook()` is the pure core (unit-tested).
- **The book DOM** (what the engine drives): `Book.astro` renders every page as `.book-pages > article.page` (the centerfold is `section.cf-page`) with `data-slug`, `data-n` (`data-end` on the centerfold), `data-side`, `data-path`, `data-section`, `data-title`, `data-doc-title` (the `<title>` for that page, from `ctx.docTitle`), `data-section-name`, `data-label` (folio "6 A"), and a visually hidden `.page-title` heading (focus target). `.book` carries `data-current` (the page this file opens at) and, in the current edition only, `data-root-slug` (the page the bare `/` opens). The opened page is `.is-current`; it and its spread partner are `.is-shown`. Also `nav.tabs` (links to each section's first page), `nav.pager` (prev/next links, with `data-spread-href` for book mode), and a `[data-live]` polite live region. Item blocks carry `data-item-id`; purchase links `data-links="<id>"`; the order form `data-order-form`, `data-order-row`, `data-order-total`, `data-share`, `data-print`.
- **Reading-mode class:** an inline head script (`MODE_SCRIPT` in `src/lib/modes.ts`, the same breakpoints the engine uses) adds `js` and `m-book` / `m-single` / `m-scroll` to `<html>` before first paint. Without a class (no JS) only the current page shows, and every tab, folio, cross-reference, and prev/next is a real link.
- **The book engine** (`src/scripts/book.ts`, started from `Book.astro`) drives that DOM. Book mode shows the current spread (a page alone in its spread keeps its side: cover on the right, back cover on the left) and turns with a 3D leaf: the turning page and the page on its back rotate about the spine in place, with no cloned markup. Turns into or out of the centerfold fade instead. Single mode stacks the old page over the new one and lifts it away. Scroll mode shows every page in a feed (with a small section head per section); the URL follows the page crossing the middle of the screen. Resizing switches modes and keeps the page.
  - **Scrolling feel:** the feed scrolls freely. No scroll snapping anywhere (an e2e test checks every element), and wheel, touch, and ↑/↓ are never hijacked or corrected afterwards. Page boundaries read through a 40px gutter and the page shadow, plus the running head (`.run-head`, `aria-hidden`: section and folio of the page being read, "Our Favorite Things · page 6 A"; a strip on top on phones, the folio at the foot of the rail in the wide feed). Page Down / Page Up and ← / → step to the next or previous page top (smooth; instant with reduced motion); Space / Shift+Space do the same but read through a page much taller than the window a screen at a time first. None of them act in form fields, dialogs, on a focused button (Space), or in the centerfold strip (arrows).
  - **Stable feed:** every feed page's height is reserved before the feed is shown (`reserveFeed` in `book.ts`): every page renders once, its measured height becomes `contain-intrinsic-height: auto <px>`, and it stays rendered for one frame so the browser remembers it. It reruns when the feed width changes or web fonts load; any change above the reader is absorbed by native scroll anchoring (never set `overflow-anchor: none`). Images carry width/height, so lazy loads don't shift anything. Until the engine starts, the feed shows only the opened page, at the spot the engine then lands it (`scroll-margin-top` equals the feed's top padding), so a deep link lands once, instantly, with no hold or correction. The gutter is wider than the landing margin, so the landed page is the scroll anchor.
  - **Jumps in the feed** (tabs, search, cross-references, index, hotspots): smooth when the target is within two screens, otherwise instant; the page landed on flashes. Reduced motion: always instant. History as for any jump (pushed).
  - **Book and single modes never scroll the document:** the book fits the window, so turns and jumps only change which pages show (leaving the feed for a book mode resets the scroll to the top).
  - API for other client modules: `navigate(slug, { push = true })` (a jump; returns false for a slug not in this book), `turn(1 | -1)`, `currentPage()`, `currentMode()`, `pathOf(slug)`, `setModeResolver((w, h) => mode)`.
  - **Prototype layouts (this branch only):** `?layout=a|b|c|d|e1|e2|hybrid` or the switcher bottom left tries different frames (see `src/lib/proto-layout.ts`). All prototype code is in `src/lib/proto-layout.ts`, `src/scripts/proto-layout.ts`, `src/scripts/proto-hybrid.ts`, and `src/styles/proto-layout.css`, hooked in at three places marked `PROTOTYPE`.
  - **Hybrid** picks one of three tiers per viewport (on load, resize, and once web fonts arrive), never per page. Tier 1 is layout A's spread (`data-chrome="side"`, `m-book`), used only while every page's body copy (the smallest computed item-copy font size × fit scale × `--pz`) is at least the floor (default 11px: the smallest size the page design itself sets item copy at, at its 560px minimum layout width). Tier 2 (`data-chrome="page"`, `m-single`) is one page up to 700px wide, never fit-scaled. The window scrolls within it, the arrows stay fixed beside it, and the tabs are the bottom bar. Tier 3 (`data-chrome="feed"`, `m-scroll`) is the e1 feed, used when a tier-2 page would need more than 2 window heights. `proto-hybrid.ts` measures by cloning every page into a hidden host at the layout width (one layout, removed in the same task, cached per width). The floor and the screen limit are knobs in the switcher (`localStorage` `wishbook:hybrid:floor` / `:screens`). `<html data-hy-tier>` holds the tier, and `wishbookHybrid.breakdown()` in the console lists every page's numbers. In single mode the engine brings the book's top back into view before every turn or jump (`toBookTop` in `book.ts`). Every page change dispatches `wishbook:navigate` on `document` with `{ slug, path, kind: "init" | "turn" | "jump" | "pop" | "scroll", mode }`; a mode change dispatches `wishbook:mode` with `{ mode }`.
  - Routing: paths come from each page's `data-path` (built with the URL helper); `RouteTable` in `src/lib/routes.ts` maps a pathname to a slug. Only pages of the loaded book are routes, so links to another edition stay full page loads. Clicks on in-book links are jumps; the pager turns. Arrow keys and horizontal swipes turn in book and single modes.
  - Images: the engine sets `loading="eager"` on images in the current spread and the spreads either side (pages and their neighbours in single/scroll mode); everything else stays `lazy`. Off-screen pages use `content-visibility: auto`.
  - Pages get `.in` once, the first time they come into view (pops, pulses, marker draws in `motion.css`). Reveals animate transform, opacity, shadow, or stroke only, never layout. A page that comes into view while the feed is moving fast (a fling, a smooth jump) also gets `.quiet`: its end state shows without playing anything.
  - **Fixed page box:** in book and single modes every page is one box, `--pw` × `--ph` (aspect 1.303), computed in CSS from the viewport alone, so the stage, tabs, and prev/next never move between pages. Content taller than its box is scaled down uniformly from the top centre (`src/scripts/fit.ts`: the page gets `.is-fit` and `--fit`, applied as a transform on `.pg` / the centerfold's `.cf`); pages that fit stay at 1. One ResizeObserver refits whenever a page is shown (including a turning leaf), the box changes, fonts arrive, or images load, before paint. A box narrower than 560px lays its page out at 560px and zooms it down (`--dw`, `--pz`), so it never switches to the phone reflow. The scroll feed keeps natural heights.
  - **Page edges:** `button.edge-prev` / `button.edge-next` lie over the outer edge strips (5% of the page, at least 32px, full height) in book and single modes and call `turn()`. Hidden when there is nowhere to turn; out of the tab order (the pager and arrow keys cover the keyboard); a click over a page control under the strip goes to that control. Hover shows a lifted corner.
  - The centerfold's legend and hotspots light each other (`.lit`). When the art is a swipe strip, the first tap on a legend entry scrolls the strip to its hotspot and the second follows the link.
- **Purchase links** render only through `ItemLinks.astro` (placement is provisional, pending owner review): "Buy ↗" (`rel="noopener sponsored"`) and "Maker ↗" (`rel="noopener"`), new tab, 44px touch targets, quieter than the price. A missing buy link shows the muted `links.missingBuy` placeholder; a missing maker link shows a placeholder only in dev. Labels and the affiliate disclosure (on the order form) live in `site.yaml` under `links`.
- **Wish list:** `wishlist.ts` adds a circle toggle (`button.wish-toggle`, `aria-pressed`) and a marker loop (`svg.wish-circle`, drawn on circling; instant with reduced motion) to every `[data-item-id]` block in the book except centerfold hotspot links. Toggles are added by script, so no-JS pages show none. Every copy of an item (it can appear on several pages) stays in sync.
  - Storage: `localStorage["wishbook:<year>:wishlist"]`, a JSON array of item ids in the order circled; per edition, so years never mix. Ids not in the edition's item index are ignored. Changes dispatch `wishbook:wishlist` on `document` with `{ ids }` (other tabs too).
  - Share code (`src/lib/wishlist-codec.ts`): a bitset of item ids (bit `id`, least significant bit first per byte), base64url without padding or trailing zero bytes: `[1, 2, 9]` → `BgI`. Item ids are permanent, so old codes stay valid as items are added; empty, malformed, or oversized codes decode to an empty list. The share URL is `/<year>/wishlist/?w=<code>` (no code for an empty list), copied to the clipboard, or shown selected in a field when the clipboard is unavailable.
  - Item index: `ItemIndex.astro` inlines `buildItemIndex(ctx)` once per document as JSON (`#wishbook-items`: id, name, brand, pickers, section, page slug and ref, catalog number, price/estimate/label, buy link; short keys). About 9.5 KB raw, 2.7 KB gzipped for 2026.
  - Order form: every item has a prerendered hidden row (`data-order-item`, with `CatalogNumber`, `ItemLinks`, `Price`); the script shows the listed ones in list order, pads with blank rows up to three, and fills the total (`est.` when any price is an estimate; `*` plus the `wishList.unpriced` footnote when an item has no price). In book and single modes a long list scrolls inside the form.
  - `/<year>/wishlist/` (`src/pages/[edition]/wishlist/index.astro`) stands alone, outside the book shell: prerendered hidden cards (photo, name, catalog number, price, page link, `ItemLinks`), revealed from `?w=`; "Add these to my list" merges them into the visitor's list; "Start my own" opens the cover. Canonical `/<year>/wishlist/`, `og:image` `/<year>/og/wishlist.png`.
  - Chrome: `WishTools.astro` (search button and the wish-list link with its count) sits fixed at the bottom left in book mode and above the tab bar otherwise. It shows only with JavaScript.
- **Search (⌘K / Ctrl+K, or the search button):** a modal `<dialog>` with an ARIA combobox and listbox over the item index (`src/lib/search.ts`: every query word must match; whole word > prefix > substring > subsequence; name weighs most, then brand, picker, section, page). ↑/↓ move, Enter or a click opens the item's index page through `navigate()`, Esc closes and returns focus. Results don't carry Buy links (interactive content inside a listbox option isn't accessible).
- **Print (⌘P or the Print button):** `src/styles/print.css` hides every child of `<body>` except `PrintSheet.astro`, which `print-sheet.ts` fills from the list: masthead, edition, the order table with each buy URL written out (or `links.missingBuy`), total, the share URL, the `wishList.mailTo` box, the guarantee, and the disclosure. An empty list prints blank lines. It works from every page file and the wish-list page.
- **Wish-list and search copy** lives in `site.yaml` under `wishList` (title, circle/circled labels, copied, empty, shared, add, added, start, unpriced, mailTo) and `search` (label, placeholder, none).
- **History:** a page turn _replaces_ the URL; a jump (tab, cross-ref, index, hotspot) _pushes_ it.
- **Accessibility:** announce the new page in a polite live region and move focus to its heading after every turn or jump (scrolling the feed only updates the URL and the hidden running head: it never announces). Respect `prefers-reduced-motion` (instant swaps). Every static file renders its own page without JavaScript.
- **Performance:** load images only for the current spread and its neighbors; use `content-visibility` for off-screen pages; preload the fonts used above the fold.

## Commits

- Small, focused commits with conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Commit after each completed unit of work, with checks passing.
- Don't reference external tracker IDs in code, comments, or commit messages.
