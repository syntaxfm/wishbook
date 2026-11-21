# Design system

The look of the WishBook: type, color, the paper and print effects, and the recurring catalog components. Every component renders with sample data at `/dev/design-system/` in `pnpm dev` (dev only, never built).

## Type roles

All fonts are self-hosted.

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

## Palette

Wish red `#C5301F`, holly green `#2A6E3B`, price yellow `#F7D838`, gold `#F3CF6A`→`#B8862B`, cream paper `#F1E2C4`, peach `#F0CFAE`, warm ink `#2b2119`, Syntax yellow `#FABF46`. The tokens live in `src/styles/tokens.css`.

## Paper and print effects

On every page: warm paper, warm ink, paper grain, paper fibers, warm grade, yellowed edges, gutter shadow on the binding side, photo color grade, ink misregistration on headings and prices, glossy sheen, dust and specks, a worn corner on the outer edge, foxing, and ink bleed on large type only. Not used: halftone dot screen, scan tilt, creases, coffee rings. The cover adds worn-ink masks on its type, a spine crease, and scuffs.

- The effects apply to any `.page` (with `.left` / `.right` for the gutter and worn corner).
- Noise, fiber, dust, foxing, wood, and ink-wear textures are baked image tiles (`scripts/bake-textures.mjs` → `src/styles/textures/`, rebuilt with `pnpm textures`), exposed as CSS variables in `textures.css`. Never inline SVG noise filters.
- Ink bleed is the `#inkbleed` SVG filter, so every document renders `<PrintFilters />`.
- Each `<html>` carries `data-edition="<year>"` so `src/styles/editions/<year>.css` can override tokens and textures for that year only.

## Item photo edge

Pending owner approval, on Scott's page only: a thin, half-transparent rim that follows the visible photo (warm ink on paper, cream on the green and dark stages), built from `--photo-edge` drop-shadows in `effects.css`. Every item photo `<Img>` carries `class="item-photo"` and every photo filter includes `var(--photo-edge,)`; switching the selector `.page[data-slug="scott"] img.item-photo` to `.page img.item-photo` turns it on everywhere.

## Recurring components

- **Item letters** (A, B, C…) are always a black square with a white letter and a red offset shadow, both on photos and in copy.
- **Host quotes** sit with the photo: below it by default, or on it when a large photo has room. Never inside the item description.
- **Full-page features** are a big product shot on a holiday background, price numerals on the photo ("only 67⁹⁰ _Each_"), and running copy with bold lead-ins. No bullet lists, stars, or banner-style price labels.
- **Section tabs** (thumb index) are the primary navigation: on the book's edge in book and single modes, a rail on the left in the feed wider than a phone, and a bottom bar on phones. Every section between the front matter (the cover's section) and the back matter (the back cover's) gets a tab, linking to its first page.
- **Sections without dividers:** a section can open straight onto an item page. A grid page with `opener: true` carries the section's opener header across its top (the section kicker, the name in a red tab, and its page range), in place of a divider page.
- **Missing images** render the placeholder component: a solid color block with a short title.

## The grouse mascot

Poses `IMG-M1-<pose>` in the assets manifest, transparent WebP cutouts in `assets/<year>/generated/`, rendered through `Mascot.astro`: whole (never in a round frame), `alt=""`, lazy, seated on the paper by a soft oval shadow under its feet (`img.grouse`; it takes the page's photo grade).

- A page places one from its `mascot` field, mirrored by `mascotFlip` (never a pose with lettering).
- Welcome, holly, index, order form (once the list has items), and back cover (`inset.art`) place it in their own spots.
- On each section's first page (grid, under, feature, lineup, price tags, wild, odds 'n' ends) a small themed grouse (`.head-grouse`, out of the flow so it never grows the page) stands at the head's right end: on a section opener's red tab, beside the title, or perched on the "Under $30" headline.
- Outside the pages, `site.yaml` `mascots` picks the search's no-results pose, the order form's empty-list pose (with `wishList.empty`), the wish-list page's, and the 404 page's.
