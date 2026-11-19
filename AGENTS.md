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

Before considering any change done, run `pnpm check`, `pnpm lint`, `pnpm format:check`, and `pnpm test`. Run `pnpm test:e2e` when touching layout, navigation, or the book engine.

## Tooling notes

- **pnpm** only. Don't add npm or yarn lockfiles.
- **oxfmt** formats `.astro` through its Prettier-backed path. It requires the `astro` option enabled in the oxfmt config and `@astrojs/compiler-rs` installed as a dev dependency.
- **oxlint** lints only the `<script>` blocks of `.astro` files, so template issues are caught by `astro check`, not the linter.
- No UI framework: client code is vanilla TypeScript modules. Don't add React, Svelte, Vue, or similar without discussion.
- No analytics, trackers, or third-party requests at runtime. Fonts are self-hosted.
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
                  (the per-edition context every template gets), redirects.ts (_redirects)
  layouts/        BookPage.astro (one HTML file: meta + the whole book opened at a page);
                  templates/ (one component per catalog layout, plus Filler)
  components/     catalog building blocks (Img, Placeholder, ItemLetter, PhotoQuote, Price,
                  CatalogNumber, PickedBy, NewBanner, Folio, ShopLine, Kbd, Frame…); content
                  renderers (Copy, CopyParas, ItemCopy, ItemOrder, ItemLinks, ItemQuote,
                  LineQuote); PageShell (one page's <article>), Book (all pages, tabs,
                  prev/next); DesignSystem (styles + font preloads, in <head>), PrintFilters
  scripts/        client modules: book engine, router, image loader, wish list, search
  styles/         global.css imports, in order: fonts, tokens (palette, type roles), textures,
                  base, components, templates (page layouts), book (shell, reading modes,
                  tabs, purchase links), effects (paper & print), motion; editions/<year>.css
                  overrides; textures/ holds the baked tiles; print stylesheet
  dev/            dev-only design showcase and its sample images
  pages/
    index.astro   root copy of the current edition's cover
    [edition]/    every real route, generated per edition (pages, og/, wishlist/, catalog.txt)
public/           static files (_headers); _redirects is generated at build
scripts/          node scripts (assets report, texture baking)
keystatic.config.ts   admin config: the schema for the current edition
tests/            unit/ for vitest; e2e/ for playwright; fixtures/ (two fixture editions)
```

## Content rules

- **Never hard-code content in markup.** Items, prices, quotes, timestamps, and settings come from content/config.
- **Never type a page number.** Page numbers, filler pages, and cross-references are computed from the book order. Reference other pages or items by slug in content; the build renders the label ("page 6 A") and the link.
- **Single sources of truth:** the phone number, episode URL, and timestamps each live in exactly one place.
- **Content and copy live in YAML**, editable through Keystatic (`pnpm dev`, then `/keystatic`). Keystatic always edits the current edition.
- **Catalog numbers are timestamps** into the episode (`SYN 036:41`). They come from the timestamps file. Clicking one opens the video at that moment.
- **Quotes** are taken from the episode transcript. Use "…" to trim. Quotes marked as needing verification must keep that flag until reviewed.
- **Prices:** show the confirmed price when set, otherwise the estimate with an "est." marker.
- **Missing images** render the placeholder component (a solid color block with a short title) until the real asset exists. All images are local; never link remote image URLs.
- **Per-edition content and assets:** each year's content lives in `content/<year>/` and its images in `assets/<year>/`. Item images are found by convention, not stored paths: `assets/<year>/items/<id>-<name>.<ext>`, extra photos `-2`, `-3`, item art `-hero`. Only the id prefix and suffix matter. Write ids zero-padded to three digits (`001-silicone-cables.png`); the resolver accepts any padding. Don't end a name in `-<digit>` (it reads as an extra-photo suffix). Item ids are permanent within an edition and never reused. Keystatic has no image upload fields on purpose: its uploads are named after the field, not the id, so they can't follow the convention. Drop files into the folders instead.
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
- **Build every URL with the URL helper** (`src/lib/urls.ts`: `editionUrl`, `rootUrl`, `absoluteUrl`). Never hard-code a path. Don't use Astro's `base` option; routes live under `src/pages/[edition]/`.
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
- **The book DOM** (what the engine drives): `Book.astro` renders every page as `.book-pages > article.page` (the centerfold is `section.cf-page`) with `data-slug`, `data-n` (`data-end` on the centerfold), `data-side`, `data-path`, `data-section`, `data-title`, and a visually hidden `.page-title` heading (focus target). The opened page is `.is-current`; it and its spread partner are `.is-shown`. Also `nav.tabs` (links to each section's first page), `nav.pager` (prev/next links, with `data-spread-href` for book mode), and a `[data-live]` polite live region. Item blocks carry `data-item-id`; purchase links `data-links="<id>"`; the order form `data-order-form`, `data-order-row`, `data-order-total`, `data-share`, `data-print`.
- **Reading-mode class:** an inline head script adds `js` and `m-book` / `m-single` / `m-scroll` to `<html>` before first paint. Without a class (no JS) only the current page shows, and every tab, folio, cross-reference, and prev/next is a real link.
- **Purchase links** render only through `ItemLinks.astro` (placement is provisional): "Buy ↗" (`rel="noopener sponsored"`) and "Maker ↗" (`rel="noopener"`), new tab, 44px touch targets, quieter than the price. A missing buy link shows the muted `links.missingBuy` placeholder; a missing maker link shows a placeholder only in dev. Labels and the affiliate disclosure (on the order form) live in `site.yaml` under `links`.
- **History:** a page turn _replaces_ the URL; a jump (tab, cross-ref, index, hotspot) _pushes_ it.
- **Accessibility:** announce the new page in a polite live region and move focus to its heading after every turn or jump. Respect `prefers-reduced-motion` (instant swaps). Every static file renders its own page without JavaScript.
- **Performance:** load images only for the current spread and its neighbors; use `content-visibility` for off-screen pages; preload the fonts used above the fold.

## Commits

- Small, focused commits with conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Commit after each completed unit of work, with checks passing.
- Don't reference external tracker IDs in code, comments, or commit messages.
