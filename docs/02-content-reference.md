# Content reference

Everything editable lives in `content/` as YAML. Edit it in the browser with Keystatic (`pnpm dev`, then `/keystatic`), or edit the files directly. Keystatic is dev-only; the production build has no admin. You never edit page markup to change content. The schema for every field is `src/lib/schema.ts`.

## Shared files

- `content/editions.yaml`: the list of editions and the `current` one.
- `content/global.yaml`: settings shared across years (site name, podcast and YouTube links).

## In each edition (`content/<year>/`)

### Items (`items/*.yaml`)

One file per gift: id, name, picker, section, prices, buy link, descriptions, variants, and quotes.

- **Ids are permanent and never reused** within an edition. Image file names and shared wish-list links are built from them; a removed item's id stays retired.
- **Prices:** `priceConfirmed` shows as is; otherwise `priceEstimate` shows with "est."; otherwise `priceLabel` (e.g. "Price upon request"). Prices end in .99.
- **Buy link** (`buyLink`): the item's link from the episode description, and the only link the site shows for it. An item without one shows no link at all.
  - `noLink: true`: never sold online (the pottery class, the grouse), so `pnpm links` doesn't list it.
  - `linkLabel`: replaces "Buy" for one item ("View" for Power Wheels).
  - `affiliate: false`: drops `rel="sponsored"` for a link that isn't an affiliate or store link.
- **Mentions:** items "mentioned in passing" (the Odds 'n' Ends pages) are marked `mention: true` and aren't counted as gifts.
- **Quotes** come from the episode transcript, trimmed with "…".

### Hosts (`hosts/*.yaml`)

The shoppers, with role, bio, and their picks page.

### Book order (`book.yaml`)

Which pages exist, in what order, which layout each uses, which items they show (optionally with page-specific copy), and their copy. Page numbers, filler pages, and cross-references are all computed from this.

- **Item caps:** every page is one fixed size, so each layout takes a limited number of items (grid and under-$… 4, holly and price tags 6, brand column 2, lineup 3, single-item layouts 1; the full list is `ITEM_CAPS` in `src/lib/schema.ts`). The build fails with the page's name when a page holds more: split it into two pages instead.
- **Duo pages:** a page with two items shows them big, one per row (price-tag pages with up to three do the same, and stocking-stuffer pages with up to four get a card each).
- **Openers:** a section's first page can carry the section's opener header (`opener: true`: its kicker, name, and page range) in place of a divider page.
- **Mascot:** `mascot` places a grouse pose on the page (an `IMG-M1-…` key from `assets.yaml`); `mascotFlip` mirrors it.
- **Order line:** `orderLine` picks the footer banner from `site.yaml`.
- **Feature options:** `collage` (several photos on the stage, like the Brad Tolinski book covers), `fill` (a photo that covers the whole stage), `maxQuotes`.

### Sections (`sections.yaml`)

The thumb-index sections, in order.

### Timestamps (`timestamps.yaml`)

The one file mapping each item to its moment in the episode. Items mentioned in passing can have one too; a variant without its own entry uses its item's.

### Site settings (`site.yaml`)

Episode and video URL, share description, purchase-link labels and the affiliate disclosure, cover band, welcome page, symbol key, order lines, order form buttons, wish-list and search copy (including the printed form's mail-to box), the back cover, the 404 page (`notFound`), the mascots for search, the empty order form, and the wish-list page (`mascots`), and the copy for automatic filler pages.

- **Order lines:** a page shows an order-line banner only when its `orderLine` is set. An order line can link to the episode video (`link: video`, the "Watch the whole thing on YouTube" line); until the video URL is set, pages show its `fallback` line instead.
- The back cover's mail line is `backCover.mailTo` followed by the return address.

### Generated art (`assets.yaml`)

Each generated image's key, file, placeholder title and color, aspect, prompt, and source item (including the grouse mascot poses). See [Images](03-images.md).

## Copy markup

In copy fields, write:

- `{page:icemag}` for a page reference (rendered "page 6 A", linked)
- `{syn:leatherman-arc}` for a catalog number
- `{count}` for the number of gifts
- `{catalog}` for the plain-text catalog's address (the "$ curl -L" line)
- `**bold**` and `*italic*` for emphasis

Unknown tokens and page slugs fail the build. Missing or invalid content fails the build with an error naming the file.
