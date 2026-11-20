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
pnpm links          # only the items missing a buy link
pnpm textures       # re-bake the paper, print, and wood texture tiles
pnpm optimize:assets  # re-encode new PNG/JPEG sources under assets/ as WebP (≤ 2000px)
pnpm icons          # remake the grouse favicons and home-screen icons in public/
```

Before considering any change done, run `pnpm check`, `pnpm lint`, `pnpm format:check`, and `pnpm test`. Run `pnpm test:e2e` when touching layout, navigation, the book engine, URLs, or anything in the build output. It builds and previews the site itself; set `E2E_PORT` to run it on another port (several checkouts at once).

## Tooling notes

- **pnpm** only. Don't add npm or yarn lockfiles.
- **oxfmt** formats `.astro` through its Prettier-backed path. It requires the `astro` option enabled in the oxfmt config and `@astrojs/compiler-rs` installed as a dev dependency.
- **oxlint** lints only the `<script>` blocks of `.astro` files, so template issues are caught by `astro check`, not the linter.
- No UI framework: client code is vanilla TypeScript modules. Don't add React, Svelte, Vue, or similar without discussion.
- No analytics, trackers, or third-party requests at runtime. Fonts are self-hosted.
- **Everything is local, always.** Every image, font, stylesheet, and script is a checked-in file served from the site's own origin: no CDNs, no remote images, no embeds, no remote URLs ever. The only external URLs are outbound links (buy links and the episode). The Welcome page's "Watch the Whole Thing" screen is a plain link to the video, never an embed or a remote thumbnail. The e2e suite fails on any request to another origin and on any remote `src`, `srcset`, `<link href>`, or CSS `url()` in the build.
- **Vitest uses Astro's Vite config** (`getViteConfig` in `vitest.config.ts`), so unit tests can import `.astro` components and render them with the container API (`experimental_AstroContainer`), as `tests/unit/item-links.test.ts` does.
- **Keystatic is dev-only.** Its integration (and React) is added to the Astro config only for `astro dev`. The production build is always fully static: no adapter, no `/keystatic` or `/api/keystatic` routes, no React.
- Dev accepts URLs with or without a trailing slash (Keystatic's API needs it); production URLs always end in `/`.
- **Design showcase is dev-only.** `/dev/design-system/` renders every component with sample data. Its route is injected only for `astro dev`, so it never reaches `dist/`.

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
                  embedded for the client); pure modules shared with the client:
                  spreads.ts (pairing pages into spreads), modes.ts (reading modes:
                  readable width, mode choice, the head script), routes.ts (path ↔ slug table),
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
                  image loading, reveals), readable.ts (measures the readable page
                  width, picks the mode), fit.ts (the fit safety net),
                  centerfold.ts (legend ↔ hotspot linking), wishlist-store.ts (the stored list + item index), wishlist.ts (toggles,
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
                  mode choice, head script), urls, wishlist
                  (codec, search, item index), item-links (ItemLinks rendering with and without a buy link)
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
                  scaled while turning through the book, the purchase row), layout (fixed page box, fit, side controls, edges, the readable floor,
                  mode by window size, the wide feed's rail), scrolling (no snap,
                  deep links stay put, page keys, far jumps, no document scroll in the book,
                  fit settles), turns (frame by frame with real scrollbars: no scrollbar or
                  overflow mid-turn, no jump on landing, shading eases out, leaf over the tabs)
```

## Content rules

- **Never hard-code content in markup.** Items, prices, quotes, timestamps, and settings come from content/config.
- **Never type a page number.** Page numbers, filler pages, and cross-references are computed from the book order. Reference other pages or items by slug in content; the build renders the label ("page 6 A") and the link.
- **Single sources of truth:** the episode URL and timestamps each live in exactly one place.
- **Order lines** (`site.yaml` `orderLines`) are the catalog's rotating footers; a page picks one by id (`orderLine`). The cover band and the back cover show their page's line instead of a footer banner. A line with `link: video` (the `watch` line, "Watch the whole thing on YouTube") links to `episode.videoUrl`; until that URL is set, pages show its `fallback` line instead (`search`). Templates get lines resolved through `ctx.orderLine(id)` (`resolveOrderLine` in `content.ts`), never from `site.orderLines` directly.
- **Item ids are permanent and never reused** within an edition. Image file names and shared wish-list codes are built from them, so renumbering or recycling an id breaks old links. A removed item's id stays retired; a new item gets the next unused id.
- **Buy links are editable content** (`buyLink` in each item's YAML): the item's link from the episode description, and the only link the site shows for it (no maker or manufacturer links). An item without a buy link renders no link and no placeholder anywhere (its purchase row keeps only the "Circle it" slot; catalog.txt, the order form, the wish-list page, and the print sheet print nothing); never hard-code a URL. `pnpm links` lists the items still missing one. An item that is never sold online (a pottery class, the grouse) sets `noLink: true`: it renders the same, and documents that no link is coming (so `pnpm links` doesn't list it). `linkLabel` replaces the buy label for one item ("View" for Power Wheels, whose link is a post); `affiliate: false` drops `rel="sponsored"` for a link that isn't a store or affiliate link (default true). Keep every purchase link going through `ItemLinks.astro` so it can change in one place.
- **Content and copy live in YAML**, editable through Keystatic (`pnpm dev`, then `/keystatic`). Keystatic always edits the current edition.
- **Catalog numbers are timestamps** into the episode (`SYN 036:41`). They come from the timestamps file. Clicking one opens the video at that moment.
- **Quotes** are taken from the episode transcript. Use "…" to trim. Quotes marked as needing verification must keep that flag until reviewed.
- **Prices:** show the confirmed price when set, otherwise the estimate with an "est." marker.
- **Missing images** render the placeholder component (a solid color block with a short title) until the real asset exists. All images are local; never link remote image URLs.
- **Per-edition content and assets:** each year's content lives in `content/<year>/` and its images in `assets/<year>/`. Item images are found by convention, not stored paths: `assets/<year>/items/<id>-<name>.<ext>`, extra photos `-2`, `-3`, item art `-hero`. Only the id prefix and suffix matter. Write ids zero-padded to three digits (`001-silicone-cables.webp`); the resolver accepts any padding. Don't end a name in `-<digit>` (it reads as an extra-photo suffix). Keystatic has no image upload fields on purpose: its uploads are named after the field, not the id, so they can't follow the convention. Drop files into the folders instead.
- **Source images are WebP.** After adding images, run `pnpm optimize:assets` (`scripts/optimize-assets.mjs`): it re-encodes every PNG/JPEG under `assets/` as a WebP with the same base name (≤ 2000px longest side, quality 90, lossless alpha), shrinks larger WebPs, and skips files already done. `Img.astro` serves an AVIF `<source>` and a WebP `<img>` (`fallbackFormat="webp"`): no PNG or JPEG copies ship, except the share cards (PNG by spec).
- **Archive, don't delete, replaced photos:** move an item photo no page uses into `assets/<year>/archive/` (same name). The resolver's glob excludes `archive/` (and `indexAssets` skips it), so archived files are never resolved or emitted into `dist/`; `pnpm assets` ignores them too.
- **Schema and reader:** the schema for every editable field is `src/lib/schema.ts` (Keystatic uses it through `keystatic.config.ts`). Read content only through `src/lib/content.ts` (`getItems(edition)`, `getPages(edition)`, …), which resolves references and fails the build with file-specific errors. Resolve images only through `src/lib/assets.ts` (`resolveAsset(edition, key)`), which returns the image or a placeholder.
- **Copy markup:** copy fields are plain text plus `**bold**`, `*italic*`, and tokens: `{page:<slug>}` (rendered "page 6 A", linked), `{syn:<item-slug>}` (catalog number), `{count}` (gifts in the edition: items not marked "mentioned in passing", see `pickCount`), `{catalog}` (the catalog.txt address, for the curl line). Parse with `parseCopy` in `src/lib/copy.ts`. Unknown tokens and slugs fail the build.

## Copy voice

- Write as if the episode is already published ("Watch the whole thing"), never "coming soon."
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

**Item photo edge** (pending owner approval, on Scott's page only): a thin, half-transparent rim that follows the visible photo (warm ink on paper, cream on the green and dark stages), built from `--photo-edge` drop-shadows in `effects.css`. Every item photo `<Img>` carries `class="item-photo"` and every photo filter includes `var(--photo-edge,)`; switching the selector `.page[data-slug="scott"] img.item-photo` to `.page img.item-photo` turns it on everywhere.

The effects apply to any `.page` (with `.left` / `.right` for the gutter and worn corner). Noise, fiber, dust, foxing, wood, and ink-wear textures are baked image tiles (`scripts/bake-textures.mjs` → `src/styles/textures/`), exposed as CSS variables in `textures.css`; never inline SVG noise filters. Ink bleed is the `#inkbleed` SVG filter, so every document renders `<PrintFilters />`. Each `<html>` carries `data-edition="<year>"` so `src/styles/editions/<year>.css` can override tokens and textures for that year only.

**Recurring components:**

- **Item letters** (A, B, C…) are always a black square with a white letter and a red offset shadow, both on photos and in copy.
- **Host quotes** sit with the photo: below it by default, or on it when a large photo has room. Never put them inside the item description.
- **Full-page features** are a big product shot on a holiday background, price numerals on the photo ("only 67⁹⁰ _Each_"), and running copy with bold lead-ins. No bullet lists, stars, or banner-style price labels.
- **Section tabs** (thumb index) are the primary navigation: on the book's edge in book and single modes, a rail on the left in the feed wider than a phone, and a bottom bar on phones. Every section between the front matter (the cover's section) and the back matter (the back cover's) gets a tab, linking to its first page (`ctx.tabs`, also the Shoppers page's contents).
- **Sections without dividers:** a section can open straight onto an item page. A grid page with `opener: true` carries the section's opener header across its top (the section kicker, the name in a red tab, and its page range from `ctx.sectionRange`), in place of a divider page.
- **The grouse mascot** (poses `IMG-M1-<pose>` in the assets manifest, transparent WebP cutouts in `assets/<year>/generated/`) renders through `Mascot.astro`: whole (never in a round frame), `alt=""`, lazy, seated on the paper by a soft oval shadow under its feet (`img.grouse`; it takes the page's photo grade). A page places one from its `mascot` field, mirrored by `mascotFlip` (never a pose with lettering): welcome, holly, index, order form (once the list has items), and back cover (`inset.art`) in their own spots; on each section's first page (grid, under, feature, lineup, price tags, wild, odds 'n' ends) a small themed grouse (`.head-grouse`, out of the flow so it never grows the page) stands at the head's right end: on a section opener's red tab, beside the title, or perched on the "Under $30" headline. Outside the pages, `site.yaml` `mascots` picks the search's no-results pose, the order form's empty-list pose (with `wishList.empty`), and the wish-list page's.

## Book, URLs, and navigation

- **Every real URL includes the edition year.** Each logical page has a real path: `/2026/` (cover), `/2026/<section>/` (section divider), `/2026/<section>/<slug>/`. A section without a divider (all of 2026's) still has `/2026/<section>/`: a build-time copy of its first page, canonical at that page's own URL (the page's `alias`); tabs and links always use the page's own path. Also `/2026/wishlist/?w=…`, `/2026/catalog.txt`, and `/2026/og/<slug>.png`. Each page has its own `<title>`, canonical URL, and Open Graph tags, all absolute and year-scoped.
- **Root copies:** `/` and `/catalog.txt` are build-time copies of the current edition's cover and catalog, with canonical pointing at `/2026/`. They are real files, not redirects. `dist/_redirects` is generated at build from the current edition's sections (`src/lib/redirects.ts`) and sends (302) year-less section paths to the current edition.
- **Site-wide root files** (not edition content, so no year, like `/_astro/`): the icons and manifest (`/favicon.ico`, `/favicon-32.png`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, `/site.webmanifest`; `SiteIcons.astro` links them in every document's head, URLs from `src/lib/icons.ts`), `/robots.txt`, `/sitemap.xml` (every edition's pages at their canonical URLs plus each wish-list page; never root copies, section alias copies, cards, or the 404; `src/lib/sitemap.ts`), and `/404.html` (`src/pages/404.astro`: a standalone sheet, `noindex`, copy in `site.yaml` `notFound`, links year-scoped). The year-scoped URL scan allows exactly these. In `public/_headers`, the general `/*` cache rule comes first and narrower rules `! Cache-Control` before setting their own (Cloudflare joins repeated headers).
- **catalog.txt** is built by `formatCatalogText(ctx)` in `src/lib/catalog-txt.ts` from the book context (`createBookContext` takes already-loaded content, so tests use fixtures). Every line stays within 80 columns (78 wide; URLs never break, so a URL longer than that sits alone on its own unindented line). Each item is listed once, at the page the index uses (its feature page, else its first appearance), under its section; items mentioned in passing are grouped under the page that lists them. It prints only order lines with `{catalog}` (the curl line), the catalog/estimate key entries, buy links under their label (nothing for an item without one), the guarantee, the disclosure, and the back cover's order line ("Listen any time · syntax.fm"): no new copy. `public/_headers` serves it as `text/plain; charset=utf-8`.
- **Build every URL with the URL helper** (`src/lib/urls.ts`: `editionUrl`, `rootUrl`, `absoluteUrl`). Never hard-code a path. Don't use Astro's `base` option; routes live under `src/pages/[edition]/`. The e2e suite checks every root-relative and same-origin URL in the built HTML, `catalog.txt`, and any sitemap (links, `data-path`s, share paths, canonical, `og:url`, `og:image`): each must start with `/<year>/` or `/_astro/`. Nothing links to the root copies.
- **Editions are independent.** Adding a year must not change a byte of another year's output; `tests/e2e/second-edition.spec.ts` builds the fixture 2025 edition next to 2026 and compares. Edition-specific styling goes in `src/styles/editions/<year>.css`, never in shared styles keyed on a year. Steps for a new year are in the README ("Starting next year's WishBook").
- The client never navigates across editions. Links to another year are normal full-page links.
- **Share cards** are crafted 1200×630 images per page (not screenshots), generated at build with Satori + resvg. Satori supports flexbox only, with no CSS filters or masks, so textures are pre-baked images.
  - `src/lib/og.ts` turns content into plain card models (variants: cover, divider, items, feature, centerfold, page, wishlist, default) and renders them with a content-hash cache in `node_modules/.cache/wishbook-og/`. `src/lib/og-layout.ts` draws them. The route is `src/pages/[edition]/og/[slug].png.ts`; every page's `og:image` is `ogImageUrl(edition, slug)`.
  - Which pages get a card comes from `ogSources()` in `og.ts` (one function). Each source is a page or filler copy, with an optional folio and binding side.
  - Fonts are the `.woff` files from the `@fontsource` packages (Satori can't read woff2). Photos are resized and color graded with sharp and passed as data URIs. The paper effects reuse the baked tiles in `src/styles/textures/`, composited onto the rendered card with sharp (grain at half strength so PNGs stay small).
  - Every card carries the masthead, `wishbook.syntax.fm`, and the edition ("WishBook 2026"). Prices follow the page rules (estimates get "est."). Keep each card under about 300 KB: the encoder lowers palette quality for photo-heavy cards.
  - In Satori, a div defaults to `display: block` and `box-sizing: content-box`; the `h()` helper sets flex and border-box. An image drawn over text hides the text, so put overlays (like the wish-list marker loop) before the content they surround.
- **Reading modes** (`src/lib/modes.ts`, one source for the head script and the engine), chosen by window width and the **readable width**: the narrowest page at which the book's smallest item copy, at design scale, is at least 11px on screen (`READABLE_PX`; about 557px for 2026). **Book** (spreads, a 3D page turn) when two readable pages fit side by side beside the side controls (≥ about 1254px wide), **single** (one page, lift-away turn) when one fits, **scroll** (the feed) below that and always under 640px. `src/scripts/readable.ts` measures the readable width by cloning every page into a hidden host at a layout width (one layout, removed in the same task, cached per width; again once web fonts load) and stores it in `localStorage` (`wishbook:<year>:readable-width`), so the next load's head script paints the right mode (before that it uses a guess). On small screens the centerfold becomes a horizontal swipe strip with its legend below. In single mode its legend runs below the art in two columns and the art takes the rest of the page height at its own aspect (letterboxed on ink); in a spread the legend is only as tall as its list and narrow enough to clear the hotspots.
- **Page fit:** every page's content fits the fixed page box (W × 1.303W) at full design scale with at least 2% to spare, at every page width the book uses (560–780px of layout), in the worst case (JavaScript on, fonts loaded, twelve items on the order form). `tests/e2e/page-fit.spec.ts` checks it by cloning every page into boxes 560, 620, 698, and 780px wide: content over 98% of the box, or anything sticking out past the page's sides or foot, fails with the page, width, pixels over, and the three tallest blocks. Art that runs off the edge on purpose is marked `data-bleed` (`<Img bleed>`). It also walks the whole book at 1920×1080, 1440×900, 1366×768, 1440×700, and 1240×800 and fails if any page gets scaled. `tests/e2e/centerfold.spec.ts` checks a centerfold (legend whole, no hotspot under it) in spread and single modes, against the fixture edition. To keep pages fitting:
  - **Item caps** per layout (`ITEM_CAPS` in `src/lib/schema.ts`; the content reader fails the build past them, naming the page): grid 4, under 4, holly 6 (two items are the two-up, three to six its grid), price tags 6, brand column 2, lineup 3, actual size 2, wild 2, odds & ends 8, feature / brand feature / house brand / luxury 1, and 0 for layouts without items. A page with more picks becomes two pages ("Kaitlin's Favorite Things" + "More of Kaitlin's Favorite Things").
  - **Duo pages:** a grid, holly (with nothing else on it but small print), or under page with two items lays them out in rows, a big photo (quote on it, the product kept clear) beside its copy, alternating sides; the rows grow into the room the page box leaves. The wild-card layout is always staggered this way; a price-tag page with up to three loose items gives each a row (photo with its quote on it beside the tag and description); a stocking-stuffer page with up to four items lays them out two by two as cards whose photos (or placeholders) grow. Feature stages likewise grow from 54% of the page width into spare room. Growth only ever fills the box: the test measures content at its own size.
  - **Size from the room left:** `.pg` sets `--room` (the page box height less the 2% spare and its padding, in `cqi`); a template sizes a photo column from it so the page fits by construction (the brand column's photos are `height: var(--room)`).
  - Photos are contained in their frames (`object-fit: contain`), never cropped; frames with a set shape (grid 16:10, holly two-up 4:3, holly grid 16:10, under 16:10 or 2:1 with four items) don't take their size from the image. Exceptions, for real photos on their own background: a feature page item with `fill: true` covers the whole stage (Wes holding the picture frame), and the house-brand hero fills its 2:3 frame, cropped to the product above the quote card. On the bench stage a photo on white melts into the spotlight (`blend`), while a cut-out (`image.background: dark`, a transparent PNG) stands on top of it. A feature's hero (unless blended or filled) is contained in a box over the stage's left part, the full stage height less a margin, clear of the numerals; trim a cut-out's transparent margins so the product fills it. The stage numerals are red with a cream shadow over a light photo or on the bench, and white over a cut-out or a filled photo.
  - A page item can repeat an item from elsewhere in the book (as "More Gifts Under $30" repeats picks under $30). Repeat an item only after its first appearance or with a feature page of its own, so its index page (and its `catalog.txt` entry) stays put.
- **Placement rules** are enforced at build: spreads are even (left) / odd (right), a centerfold (optional per edition; 2026 has none, the fixture edition has one) opens as a spread, and the back cover sits alone on the left. Filler pages are inserted automatically to satisfy them.
- **Pagination API:** `paginate(edition)` in `src/lib/paginate.ts` returns the `Book`: `pages` in order (each `BookPage` has `slug`, `path` inside the edition, `n`/`end`, folio `label` "6 A", `side` left/right/spread, `section`, `title`, `kind` cover/divider/centerfold/back/filler/page, `template`, for fillers `fillerCopy` {title, text, art}, and on the first page of a section with nothing at its own path `alias` "<section>"), `spreads`, and helpers `page`, `label`, `ref` ("page 6 A"), `spreadOf`, `firstOf`, `rangeOf`. The centerfold is one entry spanning two numbers. Fillers get a slug from their title and a path in the section before them (`/2026/back/the-grouse-says-hi/`), so they are real pages too. `paginateBook()` is the pure core (unit-tested).
- **The book DOM** (what the engine drives): `Book.astro` renders every page as `.book-pages > article.page` (the centerfold is `section.cf-page`) with `data-slug`, `data-n` (`data-end` on the centerfold), `data-side`, `data-path`, `data-alias` (the section path a section's first page also opens, when the section has no divider), `data-section`, `data-title`, `data-doc-title` (the `<title>` for that page, from `ctx.docTitle`), `data-section-name`, `data-label` (folio "6 A"), and a visually hidden `.page-title` heading (focus target). `.book` carries `data-current` (the page this file opens at) and, in the current edition only, `data-root-slug` (the page the bare `/` opens). The opened page is `.is-current`; it and its spread partner are `.is-shown`. Also `nav.tabs` (links to each section's first page), `nav.pager` (prev/next links, with `data-spread-href` for book mode), and a `[data-live]` polite live region. Item blocks carry `data-item-id`; purchase links `data-links="<id>"`; the order form `data-order-form`, `data-order-row`, `data-order-total`, `data-share`, `data-print`.
- **Reading-mode class:** an inline head script (`MODE_SCRIPT` in `src/lib/modes.ts`, the same rule the engine uses, with the stored readable width) adds `js` and `m-book` / `m-single` / `m-scroll` to `<html>` and sets `--readable-w` before first paint. Without a class (no JS) only the current page shows, and every tab, folio, cross-reference, and prev/next is a real link.
- **The book engine** (`src/scripts/book.ts`, started from `Book.astro`) drives that DOM. Book mode shows the current spread (a page alone in its spread keeps its side: cover on the right, back cover on the left) and turns with a 3D leaf: the turning page and the page on its back rotate about the spine in place, with no cloned markup. While a leaf or a single-mode lift turns, the stage (`.book-pages.is-turning`) sits above the tabs, arrows, and wish tools; the book clips (`overflow: clip`) so the leaf never adds scrollable overflow; the leaf's shading follows its angle (sin², darkest edge-on) and is gone as it lands. Turns into or out of the centerfold fade instead. Single mode stacks the old page over the new one and lifts it away. Scroll mode shows every page in a feed (with a small section head per section); the URL follows the page crossing the middle of the screen. Resizing switches modes and keeps the page.
  - **Scrolling feel:** the feed scrolls freely. No scroll snapping anywhere (an e2e test checks every element), and wheel, touch, and ↑/↓ are never hijacked or corrected afterwards. Page boundaries read through a 40px gutter and the page shadow, plus the running head (`.run-head`, `aria-hidden`: section and folio of the page being read, "Our Favorite Things · page 6 A"; a strip on top on phones, the folio at the foot of the rail in the wide feed). Page Down / Page Up and ← / → step to the next or previous page top (smooth; instant with reduced motion); Space / Shift+Space do the same but read through a page much taller than the window a screen at a time first. None of them act in form fields, dialogs, on a focused button (Space), or in the centerfold strip (arrows).
  - **Stable feed:** every feed page's height is reserved before the feed is shown (`reserveFeed` in `book.ts`): every page renders once, its measured height becomes `contain-intrinsic-height: auto <px>`, and it stays rendered for one frame so the browser remembers it. It reruns when the feed width changes or web fonts load; any change above the reader is absorbed by native scroll anchoring (never set `overflow-anchor: none`). Images carry width/height, so lazy loads don't shift anything. Until the engine starts, the feed shows only the opened page, at the spot the engine then lands it (`scroll-margin-top` equals the feed's top padding), so a deep link lands once, instantly, with no hold or correction. The gutter is wider than the landing margin, so the landed page is the scroll anchor.
  - **Jumps in the feed** (tabs, search, cross-references, index, hotspots): smooth when the target is within two screens, otherwise instant; the page landed on flashes. Reduced motion: always instant. History as for any jump (pushed).
  - **Book and single modes scroll the document only when the window is too short:** the book fits the window, so turns and jumps only change which pages show (leaving the feed for a book mode resets the scroll to the top). The page box never drops below the readable width, though, so in a short window every spread is the same height, taller than the window, and the window scrolls the same amount on every spread; turns and jumps snap the window to the book's top first (`toBookTop` in `book.ts`). The arrows (fixed, mid-window) and the tabs (fixed on the book's edge, at most the window's height) never move.
  - **Side controls** (book and single modes): 140px of width is reserved beside the book: a 50px left gutter (the 44px prev arrow, 2px from the window, 4px from the book) and a 90px right one (the 40px tabs against the book, then the next arrow 4px beyond them). The gutters aren't mirrored, so the book sits a little left of centre with its tabs sticking out on the right (`SIDE_GUTTERS_X` in `modes.ts`, `--gl` / `--gr` in `book.css`).
  - **The wide feed** (scroll mode at 640px and up): one column of pages up to 700px wide, the section tabs as a sticky rail on the left, and the running head's folio at the rail's foot.
  - API for other client modules: `navigate(slug, { push = true })` (a jump; returns false for a slug not in this book), `turn(1 | -1)`, `currentPage()`, `currentMode()`, `pathOf(slug)`.
  - Every page change dispatches `wishbook:navigate` on `document` with `{ slug, path, kind: "init" | "turn" | "jump" | "pop" | "scroll", mode }`; a mode change dispatches `wishbook:mode` with `{ mode }`.
  - Routing: paths come from each page's `data-path` (built with the URL helper); `RouteTable` in `src/lib/routes.ts` maps a pathname (a page's path or its `data-alias`) to a slug; a page's address is always its own path. Only pages of the loaded book are routes, so links to another edition stay full page loads. Clicks on in-book links are jumps; the pager turns. Arrow keys and horizontal swipes turn in book and single modes.
  - Images: the engine sets `loading="eager"` on images in the current spread and the spreads either side (pages and their neighbours in single/scroll mode); everything else stays `lazy`. Off-screen pages use `content-visibility: auto`.
  - Pages get `.in` once, the first time they come into view (pops, pulses, marker draws in `motion.css`). Reveals animate transform, opacity, shadow, or stroke only, never layout. A page that comes into view while the feed is moving fast (a fling, a smooth jump) also gets `.quiet`: its end state shows without playing anything.
  - **Fixed page box:** in book and single modes every page is one box, `--pw` × `--ph` (aspect 1.303), computed in CSS from the viewport and the readable width alone: wide enough that the spread (or page) fits the window height, but never narrower than `--readable-w` nor wider than the room beside the side controls or 780px. So the stage, tabs, and prev/next never move between pages. **Every page fits its box at full design scale** (see "Page fit" below); scaling is only a safety net, and it warns in the dev console when it fires. Content taller than its box is scaled down uniformly from the top centre (`src/scripts/fit.ts`: the page gets `.is-fit` and `--fit`, applied as a transform on `.pg` / the centerfold's `.cf`); pages that fit stay at 1. One ResizeObserver refits whenever a page is shown (including a turning leaf), the box changes, fonts arrive, or images load, before paint. A box narrower than 560px lays its page out at 560px and zooms it down (`--dw`, `--pz`), so it never switches to the phone reflow. The scroll feed keeps natural heights.
  - **Page edges:** `button.edge-prev` / `button.edge-next` lie over the outer edge strips (5% of the page, at least 32px, full height) in book and single modes and call `turn()`. Hidden when there is nowhere to turn; out of the tab order (the pager and arrow keys cover the keyboard); a click over a page control under the strip goes to that control. Hover shows a lifted corner.
  - The centerfold's legend and hotspots light each other (`.lit`). When the art is a swipe strip, the first tap on a legend entry scrolls the strip to its hotspot and the second follows the link.
- **Purchase links** render only through `ItemLinks.astro`: one "Buy ↗" link (the item's `linkLabel` when set; `rel="noopener sponsored"`, or `rel="noopener"` with `affiliate: false`), or nothing for an item without a buy link, new tab, a 44px touch target, quieter than the price. In the book (`wish`, which `ItemOrder` and the templates pass) the row is the item's one **purchase row**: the link on the left and an empty `span.wish-slot[data-wish-slot="<id>"]` on the right, where `wishlist.ts` puts the "Circle it" toggle. The toggle overhangs the row's 16px line instead of growing it, so a page is the same height with or without JavaScript. The order form and the wish-list page render links without the slot. Labels and the affiliate disclosure (on the order form) live in `site.yaml` under `links`.
- **Wish list:** `wishlist.ts` adds a circle toggle (`button.wish-toggle`, `aria-pressed`) and a marker loop (`svg.wish-circle`, drawn on circling; instant with reduced motion) to every `[data-item-id]` block in the book except centerfold hotspot links. The toggle goes in the item's purchase-row slot on that page (or, for a block without one, at the block's end). Toggles are added by script, so no-JS pages show none. Every copy of an item (it can appear on several pages) stays in sync.
  - Storage: `localStorage["wishbook:<year>:wishlist"]`, a JSON array of item ids in the order circled; per edition, so years never mix. Ids not in the edition's item index are ignored. Changes dispatch `wishbook:wishlist` on `document` with `{ ids }` (other tabs too).
  - Share code (`src/lib/wishlist-codec.ts`): a bitset of item ids (bit `id`, least significant bit first per byte), base64url without padding or trailing zero bytes: `[1, 2, 9]` → `BgI`. Item ids are permanent, so old codes stay valid as items are added; empty, malformed, or oversized codes decode to an empty list. The share URL is `/<year>/wishlist/?w=<code>` (no code for an empty list), copied to the clipboard, or shown selected in a field when the clipboard is unavailable.
  - Item index: `ItemIndex.astro` inlines `buildItemIndex(ctx)` once per document as JSON (`#wishbook-items`: id, name, brand, pickers, section, page slug and ref, catalog number, price/estimate/label, buy link; short keys). About 9.5 KB raw, 2.7 KB gzipped for 2026.
  - Order form: every item has a prerendered hidden row (`data-order-item`, with `CatalogNumber`, `ItemLinks`, `Price`); the script shows the listed ones in list order, pads with blank rows up to six (as on the printed form), and fills the total (`est.` when any price is an estimate; `*` plus the `wishList.unpriced` footnote when an item has no price). In book and single modes the rows are a fixed six lines tall and a longer list scrolls inside the form. The order form (`order-form` template, `/2026/back/order-form/`) and the alphabetical index of every gift (`index` template, `Index.astro`) are separate pages.
  - `/<year>/wishlist/` (`src/pages/[edition]/wishlist/index.astro`) stands alone, outside the book shell: prerendered hidden cards (photo, name, catalog number, price, page link, `ItemLinks`), revealed from `?w=`; "Add these to my list" merges them into the visitor's list; "Start my own" opens the cover. Canonical `/<year>/wishlist/`, `og:image` `/<year>/og/wishlist.png`.
  - Chrome: `WishTools.astro` (search button and the wish-list link with its count) is a pair of round icon buttons fixed at the top left (in the book's left gutter, or on the feed's rail) at 640px and up, and sits above the tab bar on phones. It shows only with JavaScript.
- **Search (⌘K / Ctrl+K, or the search button):** a modal `<dialog>` with an ARIA combobox and listbox over the item index (`src/lib/search.ts`: every query word must match; whole word > prefix > substring > subsequence; name weighs most, then brand, picker, section, page). ↑/↓ move, Enter or a click opens the item's index page through `navigate()`, Esc closes and returns focus. Results don't carry Buy links (interactive content inside a listbox option isn't accessible).
- **Print (⌘P or the Print button):** `src/styles/print.css` hides every child of `<body>` except `PrintSheet.astro`, which `print-sheet.ts` fills from the list: masthead, edition, the order table with each buy URL written out (nothing without one), total, the share URL, the `wishList.mailTo` box, the guarantee, and the disclosure. An empty list prints blank lines. It works from every page file and the wish-list page.
- **Wish-list and search copy** lives in `site.yaml` under `wishList` (title, circle/circled labels, copied, empty, shared, add, added, start, unpriced, mailTo) and `search` (label, placeholder, none).
- **History:** a page turn _replaces_ the URL; a jump (tab, cross-ref, index, hotspot) _pushes_ it.
- **Accessibility:** announce the new page in a polite live region and move focus to its heading after every turn or jump (scrolling the feed only updates the URL and the hidden running head: it never announces). Respect `prefers-reduced-motion` (instant swaps). Every static file renders its own page without JavaScript.
- **Performance:** load images only for the current spread and its neighbors; use `content-visibility` for off-screen pages; preload the fonts used above the fold.

## Commits

- Small, focused commits with conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Commit after each completed unit of work, with checks passing.
- Don't reference external tracker IDs in code, comments, or commit messages.
