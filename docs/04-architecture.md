# Architecture

The engineering reference: where the code lives, how the book is paginated and rendered, and how the client drives it. For the rules to follow when changing any of it, see [AGENTS.md](../AGENTS.md).

## Structure

```
content/
  editions.yaml   list of editions + `current` (the year served at / and edited in Keystatic)
  global.yaml     settings shared across years (brand, podcast links)
  <year>/         one edition: items/, hosts/, site, sections, book order, timestamps, assets manifest
assets/
  brand/          shared brand assets (logo)
  <year>/         one edition: items/, hosts/, cover/, generated/, archive/ (old photos, never built)
src/
  lib/            urls.ts (URL helper), schema.ts (content schema), content.ts (reader),
                  assets.ts (asset resolver), copy.ts (copy markup), catalog.ts (catalog
                  numbers, prices, order lines), og.ts + og-layout.ts (share cards),
                  editions, paginate.ts (page numbers, fillers, spreads, refs), book.ts
                  (the per-edition context every template gets), redirects.ts (_redirects),
                  catalog-txt.ts (the plain-text catalog), item-index.ts (the item index
                  embedded for the client), sitemap.ts, icons.ts; pure modules shared with
                  the client: spreads.ts (pairing pages into spreads), modes.ts (reading
                  modes: readable width, mode choice, the head script), routes.ts (path ↔
                  slug table), wishlist-codec.ts (share codes), search.ts (fuzzy match), marker.ts
  layouts/        BookPage.astro (one HTML file: meta + the whole book opened at a page);
                  templates/ (one component per catalog layout, plus Filler)
  components/     catalog building blocks (Img, Placeholder, ItemLetter, PhotoQuote, Price,
                  CatalogNumber, PickedBy, Folio, ShopLine, Kbd, Frame, Mascot…); content
                  renderers (Copy, CopyParas, ItemCopy, ItemOrder, ItemLinks, ItemQuote,
                  LineQuote); PageShell (one page's <article>), Book (all pages, tabs,
                  prev/next); DesignSystem (styles + font preloads, in <head>), PrintFilters,
                  SiteIcons; WishTools, SearchDialog, PrintSheet, ItemIndex (wish list,
                  search, print)
  scripts/        client modules: book.ts (the book engine: modes, turns, routing, tabs, a11y,
                  image loading, reveals), readable.ts (measures the readable page
                  width, picks the mode), fit.ts (the fit safety net),
                  centerfold.ts (legend ↔ hotspot linking), wishlist-store.ts (the stored
                  list + item index), wishlist.ts (toggles, count, order form, share, print),
                  search.ts (⌘K), print-sheet.ts, wishlist-page.ts (the shared-list page)
  styles/         global.css imports, in order: fonts, tokens (palette, type roles), textures,
                  base, components, templates (page layouts), book (shell, reading modes,
                  tabs, purchase links), effects (paper & print), motion, wishlist (toggles,
                  marker loop, chrome tools, search, wish-list page), print (the print
                  stylesheet); editions/<year>.css overrides; textures/ holds the baked tiles
  dev/            dev-only design showcase and its sample images
  pages/
    index.astro   root copy of the current edition's cover
    404.astro     the page for any missing path (dist/404.html)
    robots.txt.ts, sitemap.xml.ts, site.webmanifest.ts   site-wide root files
    [edition]/    every real route, generated per edition (pages, og/, wishlist/, catalog.txt)
public/           static files (_headers, the icons from `pnpm icons`); _redirects is generated at build
scripts/          node scripts (assets report, texture baking, image optimizing, icons)
keystatic.config.ts   admin config: the schema for the current edition
tests/
  fixtures/       two small fixture editions (content/2025, content/2026, assets/) for unit tests,
                  the side-by-side build, and the centerfold e2e (fixture 2026 has a centerfold)
  unit/           vitest: content (reader + validation), paginate, assets (resolver), catalog
                  (numbers, prices), copy, og (routes, models, rendering), catalog-txt (+ snapshot
                  in __snapshots__/), redirects, routes (paths, spreads), modes (readable width,
                  mode choice, head script), urls, sitemap, wishlist (codec, search, item
                  index), item-links (ItemLinks rendering with and without a buy link)
  e2e/            playwright, against the built site: smoke, build-output (static files, meta,
                  year-scoped URLs, no foreign resources, root copies, catalog.txt, _redirects),
                  engine (deep links per mode, turns/jumps, history, focus + live region, no-JS,
                  image loading), pages (every page at 390/820/1360 without overflow,
                  modes, no-JS links, item ids, purchase links), design-system (showcase absent,
                  fonts, no requests to other origins on any page), wishlist (round trip, order
                  form, ⌘K, print), second-edition (a fixture year built side by side),
                  centerfold (the fixture edition built and served on its own, since 2026
                  has no centerfold: legend ↔ hotspots, the phone strip, no toggles on
                  hotspots, fit with the whole legend in book and single modes, fade turns),
                  page-fit (every page in its box at full scale at 560–780px, no page
                  scaled while turning through the book, the purchase row), layout (fixed page
                  box, fit, side controls, edges, the readable floor, mode by window size, the
                  wide feed's rail), scrolling (no snap, deep links stay put, page keys, far
                  jumps, no document scroll in the book, fit settles), turns (frame by frame
                  with real scrollbars: no scrollbar or overflow mid-turn, no jump on landing,
                  shading eases out, leaf over the tabs)
```

## Tooling details

- **oxfmt** formats `.astro` through its Prettier-backed path. It requires the `astro` option enabled in the oxfmt config and `@astrojs/compiler-rs` installed as a dev dependency.
- **oxlint** lints only the `<script>` blocks of `.astro` files, so template issues are caught by `astro check`, not the linter.
- **Vitest uses Astro's Vite config** (`getViteConfig` in `vitest.config.ts`), so unit tests can import `.astro` components and render them with the container API (`experimental_AstroContainer`), as `tests/unit/item-links.test.ts` does.
- **Keystatic** (and React) is added to the Astro config only for `astro dev`. The production build has no adapter, no `/keystatic` or `/api/keystatic` routes, no React. Dev accepts URLs with or without a trailing slash (Keystatic's API needs it); production URLs always end in `/`.
- **Design showcase:** `/dev/design-system/` renders every component with sample data. Its route is injected only for `astro dev`, so it never reaches `dist/`.

## Content pipeline

- The schema for every editable field is `src/lib/schema.ts` (Keystatic uses it through `keystatic.config.ts`).
- `src/lib/content.ts` reads content (`getItems(edition)`, `getPages(edition)`, …), resolves references, and fails the build with file-specific errors.
- `src/lib/assets.ts` resolves images (`resolveAsset(edition, key)`), returning the image or a placeholder. Item images are found by convention: the resolver accepts any id padding, and its glob excludes `archive/` (as does `indexAssets`).
- `src/lib/copy.ts` parses copy markup (`parseCopy`). `{count}` counts items not marked as mentions (`pickCount`).
- Order lines are resolved through `ctx.orderLine(id)` (`resolveOrderLine` in `content.ts`). The cover band and the back cover show their page's line instead of a footer banner. The `watch` line (`link: video`) links to `episode.videoUrl` and falls back to the `search` line until that is set.
- `Img.astro` serves an AVIF `<source>` and a WebP `<img>` (`fallbackFormat="webp"`).

## URLs and root files

- Each logical page has a real path: `/2026/` (cover), `/2026/<section>/` (section divider), `/2026/<section>/<slug>/`. A section without a divider (all of 2026's) still has `/2026/<section>/`: a build-time copy of its first page, canonical at that page's own URL (the page's `alias`); tabs and links always use the page's own path. Each page has its own `<title>`, canonical URL, and Open Graph tags, all absolute and year-scoped.
- **Root copies:** `/` and `/catalog.txt` are real files, not redirects, with canonical pointing at `/2026/`. `dist/_redirects` is generated from the current edition's sections (`src/lib/redirects.ts`).
- **Site-wide root files** (no year, like `/_astro/`): the icons and manifest (`/favicon.ico`, `/favicon-32.png`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, `/site.webmanifest`; `SiteIcons.astro` links them in every document's head, URLs from `src/lib/icons.ts`), `/robots.txt`, `/sitemap.xml` (every edition's pages at their canonical URLs plus each wish-list page; never root copies, section alias copies, cards, or the 404; `src/lib/sitemap.ts`), and `/404.html` (`src/pages/404.astro`: a standalone sheet, `noindex`, copy in `site.yaml` `notFound`, links year-scoped). The year-scoped URL scan allows exactly these.
- The URL helper is `src/lib/urls.ts` (`editionUrl`, `rootUrl`, `absoluteUrl`); routes live under `src/pages/[edition]/`. The e2e suite checks every root-relative and same-origin URL in the built HTML, `catalog.txt`, and the sitemap (links, `data-path`s, share paths, canonical, `og:url`, `og:image`): each must start with `/<year>/` or `/_astro/`.
- `tests/e2e/second-edition.spec.ts` builds the fixture 2025 edition next to 2026 and compares every 2026 file byte for byte.

## catalog.txt

Built by `formatCatalogText(ctx)` in `src/lib/catalog-txt.ts` from the book context (`createBookContext` takes already-loaded content, so tests use fixtures). Every line stays within 80 columns (78 wide; URLs never break, so a URL longer than that sits alone on its own unindented line). Each item is listed once, at the page the index uses (its feature page, else its first appearance), under its section; items mentioned in passing are grouped under the page that lists them. It prints only order lines with `{catalog}` (the curl line), the catalog/estimate key entries, buy links under their label (nothing for an item without one), the guarantee, the disclosure, and the back cover's order line ("Listen any time · syntax.fm"): no new copy. `public/_headers` serves it as `text/plain; charset=utf-8`.

## Share cards

Crafted 1200×630 images per page (not screenshots), generated at build with Satori + resvg. Satori supports flexbox only, with no CSS filters or masks, so textures are pre-baked images.

- `src/lib/og.ts` turns content into plain card models (variants: cover, divider, items, feature, centerfold, page, wishlist, default) and renders them with a content-hash cache in `node_modules/.cache/wishbook-og/`. `src/lib/og-layout.ts` draws them. The route is `src/pages/[edition]/og/[slug].png.ts`; every page's `og:image` is `ogImageUrl(edition, slug)`.
- Which pages get a card comes from `ogSources()` in `og.ts` (one function). Each source is a page or filler copy, with an optional folio and binding side.
- Fonts are the `.woff` files from the `@fontsource` packages (Satori can't read woff2). Photos are resized and color graded with sharp and passed as data URIs. The paper effects reuse the baked tiles in `src/styles/textures/`, composited onto the rendered card with sharp (grain at half strength so PNGs stay small).
- Every card carries the masthead, `wishbook.syntax.fm`, and the edition ("WishBook 2026"). Prices follow the page rules (estimates get "est."). Each card stays under about 300 KB: the encoder lowers palette quality for photo-heavy cards.
- In Satori, a div defaults to `display: block` and `box-sizing: content-box`; the `h()` helper sets flex and border-box. An image drawn over text hides the text, so put overlays (like the wish-list marker loop) before the content they surround.
- **Cache:** only changed cards are redrawn. Delete `node_modules/.cache/wishbook-og/` to force a full re-render. A fresh install (like a Cloudflare build) renders them all, which takes about 15 seconds.
- **Checking a card:** after a build, open the files in `dist/2026/og/`, or `pnpm preview` and visit `/2026/og/<slug>.png`. To see how a link previews after deploying, paste it into Slack, Discord, or iMessage.

## Pagination

- **Placement rules** are enforced at build: spreads are even (left) / odd (right), a centerfold (optional per edition; 2026 has none, the fixture edition has one) opens as a spread, and the back cover sits alone on the left. Filler pages are inserted automatically to satisfy them.
- `paginate(edition)` in `src/lib/paginate.ts` returns the `Book`: `pages` in order (each `BookPage` has `slug`, `path` inside the edition, `n`/`end`, folio `label` "6 A", `side` left/right/spread, `section`, `title`, `kind` cover/divider/centerfold/back/filler/page, `template`, for fillers `fillerCopy` {title, text, art}, and on the first page of a section with nothing at its own path `alias` "<section>"), `spreads`, and helpers `page`, `label`, `ref` ("page 6 A"), `spreadOf`, `firstOf`, `rangeOf`. The centerfold is one entry spanning two numbers. Fillers get a slug from their title and a path in the section before them (`/2026/back/the-grouse-says-hi/`), so they are real pages too. `paginateBook()` is the pure core (unit-tested).
- Section tabs come from `ctx.tabs` (every section between the front matter and the back matter, linking to its first page; also the Shoppers page's contents). An opener's page range comes from `ctx.sectionRange`.

## Reading modes

`src/lib/modes.ts` is one source for the head script and the engine. The mode is chosen by window width and the **readable width**: the narrowest page at which the book's smallest item copy, at design scale, is at least 11px on screen (`READABLE_PX`; about 557px for 2026).

- **Book** (spreads, a 3D page turn) when two readable pages fit side by side beside the side controls (≥ about 1254px wide), **single** (one page, lift-away turn) when one fits, **scroll** (the feed) below that and always under 640px.
- `src/scripts/readable.ts` measures the readable width by cloning every page into a hidden host at a layout width (one layout, removed in the same task, cached per width; again once web fonts load) and stores it in `localStorage` (`wishbook:<year>:readable-width`), so the next load's head script paints the right mode (before that it uses a guess).
- An inline head script (`MODE_SCRIPT`, the same rule the engine uses, with the stored readable width) adds `js` and `m-book` / `m-single` / `m-scroll` to `<html>` and sets `--readable-w` before first paint. Without a class (no JS) only the current page shows, and every tab, folio, cross-reference, and prev/next is a real link.
- On small screens the centerfold becomes a horizontal swipe strip with its legend below. In single mode its legend runs below the art in two columns and the art takes the rest of the page height at its own aspect (letterboxed on ink); in a spread the legend is only as tall as its list and narrow enough to clear the hotspots.

## Page fit

Every page's content fits the fixed page box (W × 1.303W) at full design scale with at least 2% to spare, at every page width the book uses (560–780px of layout), in the worst case (JavaScript on, fonts loaded, twelve items on the order form).

- `tests/e2e/page-fit.spec.ts` checks it by cloning every page into boxes 560, 620, 698, and 780px wide: content over 98% of the box, or anything sticking out past the page's sides or foot, fails with the page, width, pixels over, and the three tallest blocks. Art that runs off the edge on purpose is marked `data-bleed` (`<Img bleed>`). It also walks the whole book at 1920×1080, 1440×900, 1366×768, 1440×700, and 1240×800 and fails if any page gets scaled. `tests/e2e/centerfold.spec.ts` checks a centerfold (legend whole, no hotspot under it) in spread and single modes, against the fixture edition.
- **Item caps** per layout (`ITEM_CAPS` in `src/lib/schema.ts`; the content reader fails the build past them, naming the page): grid 4, under 4, holly 6 (two items are the two-up, three to six its grid), price tags 6, brand column 2, lineup 3, actual size 2, wild 2, odds & ends 8, feature / brand feature / house brand / luxury 1, and 0 for layouts without items. A page with more picks becomes two pages ("Kaitlin's Favorite Things" + "More of Kaitlin's Favorite Things").
- **Duo pages:** a grid, holly (with nothing else on it but small print), or under page with two items lays them out in rows, a big photo (quote on it, the product kept clear) beside its copy, alternating sides; the rows grow into the room the page box leaves. The wild-card layout is always staggered this way; a price-tag page with up to three loose items gives each a row (photo with its quote on it beside the tag and description); a stocking-stuffer page with up to four items lays them out two by two as cards whose photos (or placeholders) grow. Feature stages likewise grow from 54% of the page width into spare room. Growth only ever fills the box: the test measures content at its own size.
- **Size from the room left:** `.pg` sets `--room` (the page box height less the 2% spare and its padding, in `cqi`); a template sizes a photo column from it so the page fits by construction (the brand column's photos are `height: var(--room)`).
- **Photos** are contained in their frames (`object-fit: contain`), never cropped; frames with a set shape (grid 16:10, holly two-up 4:3, holly grid 16:10, under 16:10 or 2:1 with four items) don't take their size from the image. Exceptions, for real photos on their own background: a feature page item with `fill: true` covers the whole stage (Wes holding the picture frame), and the house-brand hero fills its 2:3 frame, cropped to the product above the quote card. On the bench stage a photo on white melts into the spotlight (`blend`), while a cut-out (`image.background: dark`, a transparent PNG) stands on top of it. A feature's hero (unless blended or filled) is contained in a box over the stage's left part, the full stage height less a margin, clear of the numerals; trim a cut-out's transparent margins so the product fills it. The stage numerals are red with a cream shadow over a light photo or on the bench, and white over a cut-out or a filled photo.
- **Repeats:** a page item can repeat an item from elsewhere in the book (as "More Gifts Under $30" repeats picks under $30). Repeat an item only after its first appearance or with a feature page of its own, so its index page (and its `catalog.txt` entry) stays put.

## The book DOM

What the engine drives. `Book.astro` renders every page as `.book-pages > article.page` (the centerfold is `section.cf-page`) with `data-slug`, `data-n` (`data-end` on the centerfold), `data-side`, `data-path`, `data-alias` (the section path a section's first page also opens, when the section has no divider), `data-section`, `data-title`, `data-doc-title` (the `<title>` for that page, from `ctx.docTitle`), `data-section-name`, `data-label` (folio "6 A"), and a visually hidden `.page-title` heading (focus target).

- `.book` carries `data-current` (the page this file opens at) and, in the current edition only, `data-root-slug` (the page the bare `/` opens). The opened page is `.is-current`; it and its spread partner are `.is-shown`.
- Also `nav.tabs` (links to each section's first page), `nav.pager` (prev/next links, with `data-spread-href` for book mode), and a `[data-live]` polite live region.
- Item blocks carry `data-item-id`; purchase links `data-links="<id>"`; the order form `data-order-form`, `data-order-row`, `data-order-total`, `data-share`, `data-print`.

## The book engine

`src/scripts/book.ts`, started from `Book.astro`, drives that DOM.

- **Book mode** shows the current spread (a page alone in its spread keeps its side: cover on the right, back cover on the left) and turns with a 3D leaf: the turning page and the page on its back rotate about the spine in place, with no cloned markup. While a leaf or a single-mode lift turns, the stage (`.book-pages.is-turning`) sits above the tabs, arrows, and wish tools; the book clips (`overflow: clip`) so the leaf never adds scrollable overflow; the leaf's shading follows its angle (sin², darkest edge-on) and is gone as it lands. Turns into or out of the centerfold fade instead.
- **Single mode** stacks the old page over the new one and lifts it away.
- **Scroll mode** shows every page in a feed (with a small section head per section); the URL follows the page crossing the middle of the screen. Resizing switches modes and keeps the page.
- **Scrolling feel:** the feed scrolls freely. No scroll snapping anywhere (an e2e test checks every element), and wheel, touch, and ↑/↓ are never hijacked or corrected afterwards. Page boundaries read through a 40px gutter and the page shadow, plus the running head (`.run-head`, `aria-hidden`: section and folio of the page being read, "Our Favorite Things · page 6 A"; a strip on top on phones, the folio at the foot of the rail in the wide feed). Page Down / Page Up and ← / → step to the next or previous page top (smooth; instant with reduced motion); Space / Shift+Space do the same but read through a page much taller than the window a screen at a time first. None of them act in form fields, dialogs, on a focused button (Space), or in the centerfold strip (arrows).
- **Stable feed:** every feed page's height is reserved before the feed is shown (`reserveFeed`): every page renders once, its measured height becomes `contain-intrinsic-height: auto <px>`, and it stays rendered for one frame so the browser remembers it. It reruns when the feed width changes or web fonts load; any change above the reader is absorbed by native scroll anchoring (never set `overflow-anchor: none`). Images carry width/height, so lazy loads don't shift anything. Until the engine starts, the feed shows only the opened page, at the spot the engine then lands it (`scroll-margin-top` equals the feed's top padding), so a deep link lands once, instantly, with no hold or correction. The gutter is wider than the landing margin, so the landed page is the scroll anchor.
- **Jumps in the feed** (tabs, search, cross-references, index, hotspots): smooth when the target is within two screens, otherwise instant; the page landed on flashes. Reduced motion: always instant.
- **Book and single modes scroll the document only when the window is too short:** the book fits the window, so turns and jumps only change which pages show (leaving the feed for a book mode resets the scroll to the top). The page box never drops below the readable width, though, so in a short window every spread is the same height, taller than the window, and the window scrolls the same amount on every spread; turns and jumps snap the window to the book's top first (`toBookTop`). The arrows (fixed, mid-window) and the tabs (fixed on the book's edge, at most the window's height) never move.
- **Side controls** (book and single modes): 140px of width is reserved beside the book: a 50px left gutter (the 44px prev arrow, 2px from the window, 4px from the book) and a 90px right one (the 40px tabs against the book, then the next arrow 4px beyond them). The gutters aren't mirrored, so the book sits a little left of centre with its tabs sticking out on the right (`SIDE_GUTTERS_X` in `modes.ts`, `--gl` / `--gr` in `book.css`).
- **The wide feed** (scroll mode at 640px and up): one column of pages up to 700px wide, the section tabs as a sticky rail on the left, and the running head's folio at the rail's foot.
- **Fixed page box:** in book and single modes every page is one box, `--pw` × `--ph` (aspect 1.303), computed in CSS from the viewport and the readable width alone: wide enough that the spread (or page) fits the window height, but never narrower than `--readable-w` nor wider than the room beside the side controls or 780px. So the stage, tabs, and prev/next never move between pages. Scaling is only a safety net, and it warns in the dev console when it fires: content taller than its box is scaled down uniformly from the top centre (`src/scripts/fit.ts`: the page gets `.is-fit` and `--fit`, applied as a transform on `.pg` / the centerfold's `.cf`); pages that fit stay at 1. One ResizeObserver refits whenever a page is shown (including a turning leaf), the box changes, fonts arrive, or images load, before paint. A box narrower than 560px lays its page out at 560px and zooms it down (`--dw`, `--pz`), so it never switches to the phone reflow. The scroll feed keeps natural heights.
- **Page edges:** `button.edge-prev` / `button.edge-next` lie over the outer edge strips (5% of the page, at least 32px, full height) in book and single modes and call `turn()`. Hidden when there is nowhere to turn; out of the tab order (the pager and arrow keys cover the keyboard); a click over a page control under the strip goes to that control. Hover shows a lifted corner.
- **Centerfold:** the legend and hotspots light each other (`.lit`). When the art is a swipe strip, the first tap on a legend entry scrolls the strip to its hotspot and the second follows the link.
- **Routing:** paths come from each page's `data-path` (built with the URL helper); `RouteTable` in `src/lib/routes.ts` maps a pathname (a page's path or its `data-alias`) to a slug; a page's address is always its own path. Only pages of the loaded book are routes, so links to another edition stay full page loads. Clicks on in-book links are jumps; the pager turns. Arrow keys and horizontal swipes turn in book and single modes.
- **Images:** the engine sets `loading="eager"` on images in the current spread and the spreads either side (pages and their neighbours in single/scroll mode); everything else stays `lazy`. Off-screen pages use `content-visibility: auto`.
- **Reveals:** pages get `.in` once, the first time they come into view (pops, pulses, marker draws in `motion.css`). Reveals animate transform, opacity, shadow, or stroke only, never layout. A page that comes into view while the feed is moving fast (a fling, a smooth jump) also gets `.quiet`: its end state shows without playing anything.
- **API** for other client modules: `navigate(slug, { push = true })` (a jump; returns false for a slug not in this book), `turn(1 | -1)`, `currentPage()`, `currentMode()`, `pathOf(slug)`.
- **Events:** every page change dispatches `wishbook:navigate` on `document` with `{ slug, path, kind: "init" | "turn" | "jump" | "pop" | "scroll", mode }`; a mode change dispatches `wishbook:mode` with `{ mode }`.

## Purchase links

`ItemLinks.astro` renders one "Buy ↗" link (the item's `linkLabel` when set; `rel="noopener sponsored"`, or `rel="noopener"` with `affiliate: false`), or nothing for an item without a buy link: new tab, a 44px touch target, quieter than the price. In the book (`wish`, which `ItemOrder` and the templates pass) the row is the item's one **purchase row**: the link on the left and an empty `span.wish-slot[data-wish-slot="<id>"]` on the right, where `wishlist.ts` puts the "Circle it" toggle. The toggle overhangs the row's 16px line instead of growing it, so a page is the same height with or without JavaScript. The order form and the wish-list page render links without the slot. Labels and the affiliate disclosure (on the order form) live in `site.yaml` under `links`.

## Wish list

`wishlist.ts` adds a circle toggle (`button.wish-toggle`, `aria-pressed`) and a marker loop (`svg.wish-circle`, drawn on circling; instant with reduced motion) to every `[data-item-id]` block in the book except centerfold hotspot links. The toggle goes in the item's purchase-row slot on that page (or, for a block without one, at the block's end). Toggles are added by script, so no-JS pages show none. Every copy of an item (it can appear on several pages) stays in sync.

- **Storage:** `localStorage["wishbook:<year>:wishlist"]`, a JSON array of item ids in the order circled; per edition, so years never mix. Ids not in the edition's item index are ignored. Changes dispatch `wishbook:wishlist` on `document` with `{ ids }` (other tabs too).
- **Share code** (`src/lib/wishlist-codec.ts`): a bitset of item ids (bit `id`, least significant bit first per byte), base64url without padding or trailing zero bytes: `[1, 2, 9]` → `BgI`. Item ids are permanent, so old codes stay valid as items are added; empty, malformed, or oversized codes decode to an empty list. The share URL is `/<year>/wishlist/?w=<code>` (no code for an empty list), copied to the clipboard, or shown selected in a field when the clipboard is unavailable.
- **Item index:** `ItemIndex.astro` inlines `buildItemIndex(ctx)` once per document as JSON (`#wishbook-items`: id, name, brand, pickers, section, page slug and ref, catalog number, price/estimate/label, buy link; short keys). About 9.5 KB raw, 2.7 KB gzipped for 2026.
- **Order form:** every item has a prerendered hidden row (`data-order-item`, with `CatalogNumber`, `ItemLinks`, `Price`); the script shows the listed ones in list order, pads with blank rows up to six (as on the printed form), and fills the total (`est.` when any price is an estimate; `*` plus the `wishList.unpriced` footnote when an item has no price). In book and single modes the rows are a fixed six lines tall and a longer list scrolls inside the form. The order form (`order-form` template, `/2026/back/order-form/`) and the alphabetical index of every gift (`index` template, `Index.astro`) are separate pages.
- **The wish-list page:** `/<year>/wishlist/` (`src/pages/[edition]/wishlist/index.astro`) stands alone, outside the book shell: prerendered hidden cards (photo, name, catalog number, price, page link, `ItemLinks`), revealed from `?w=`; "Add these to my list" merges them into the visitor's list; "Start my own" opens the cover. Canonical `/<year>/wishlist/`, `og:image` `/<year>/og/wishlist.png`.
- **Chrome:** `WishTools.astro` (search button and the wish-list link with its count) is a pair of round icon buttons fixed at the top left (in the book's left gutter, or on the feed's rail) at 640px and up, and sits above the tab bar on phones. It shows only with JavaScript.
- **Copy** lives in `site.yaml` under `wishList` (title, circle/circled labels, copied, empty, shared, add, added, start, unpriced, mailTo) and `search` (label, placeholder, none).

## Search

⌘K / Ctrl+K, or the search button: a modal `<dialog>` with an ARIA combobox and listbox over the item index (`src/lib/search.ts`: every query word must match; whole word > prefix > substring > subsequence; name weighs most, then brand, picker, section, page). ↑/↓ move, Enter or a click opens the item's index page through `navigate()`, Esc closes and returns focus. Results don't carry Buy links (interactive content inside a listbox option isn't accessible).

## Print

⌘P or the Print button: `src/styles/print.css` hides every child of `<body>` except `PrintSheet.astro`, which `print-sheet.ts` fills from the list: masthead, edition, the order table with each buy URL written out (nothing without one), total, the share URL, the `wishList.mailTo` box, the guarantee, and the disclosure. An empty list prints blank lines. It works from every page file and the wish-list page.
