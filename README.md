# Syntax WishBook

The Syntax Holiday Gift Guide as an interactive 90s Christmas catalog: a "wish book" you can flip through, circle gifts in, and share. It lives at **[wishbook.syntax.fm](https://wishbook.syntax.fm)**.

- The Syntax crew's gift picks, laid out like a vintage department store catalog.
- Flip it like a book on desktop, read it page by page on tablets, scroll it on phones.
- Every catalog number is a timestamp into the gift guide episode.
- Circle what you want, share your wish list as a link, or print an order form for Santa.
- A new WishBook every year at its own permanent address (`/2026/…`).
- Fully static, no analytics, hosted on Cloudflare Pages.

## Running it

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev          # http://localhost:4321/2026/ (content admin at /keystatic)
pnpm build        # static site, share cards, and catalog.txt in dist/
pnpm preview      # serve the built site
```

Before you commit, run `pnpm check`, `pnpm lint`, `pnpm format:check`, and `pnpm test`. See [CONTRIBUTING.md](CONTRIBUTING.md) for every script and the full workflow.

## Updating content

All content is YAML in `content/`, and you never edit page markup to change it. The easiest way to edit is Keystatic, in the browser: run `pnpm dev` and open **/keystatic**. Keystatic always edits the current year, and it only runs locally.

| What                                                                | Where                          |
| ------------------------------------------------------------------- | ------------------------------ |
| Gifts (name, price, buy link, description, quotes)                  | `content/2026/items/*.yaml`    |
| The shoppers                                                        | `content/2026/hosts/*.yaml`    |
| Which pages exist, their order, layout, and items                   | `content/2026/book.yaml`       |
| Each gift's moment in the episode                                   | `content/2026/timestamps.yaml` |
| Site copy: cover, welcome page, order lines, wish list, search, 404 | `content/2026/site.yaml`       |
| Settings shared across years                                        | `content/global.yaml`          |

Page numbers, cross-references ("page 6 A"), and the index are all computed, so never type them. In copy, write `{page:icemag}` for a page reference and `{syn:leatherman-arc}` for a catalog number. Every field is described in the [content reference](docs/02-content-reference.md).

### Images

Images aren't uploaded through Keystatic. Drop the file into its folder with the right name and it shows up; until then a placeholder shows.

- **A gift's photo:** `assets/2026/items/<id>-<name>.<ext>`, for example `001-silicone-usb-c-cables.jpg`. Only the 3-digit id matters. Extra photos go in `-2`, `-3`, and so on.
- **Then run `pnpm optimize:assets`**, which converts new images to WebP at a sensible size.

All the other image locations (cover, hosts, generated art, the grouse mascot) are in [Images](docs/03-images.md).

### What's still missing

```sh
pnpm assets       # every image the book expects: present or missing, with the exact path
pnpm links        # gifts still missing a buy link
```

A missing image shows a placeholder and a missing link shows nothing, so neither breaks the build. Invalid content does break it, with an error naming the file.

## More docs

- [How it works](docs/01-how-it-works.md): reading modes, URLs and editions, the book engine
- [Content reference](docs/02-content-reference.md): every field in every content file
- [Images](docs/03-images.md): naming, optimizing, the archive, the grouse mascot, icons
- [Architecture](docs/04-architecture.md): the code, pagination, the book engine, share cards, wish list, search, print
- [Design system](docs/05-design-system.md): type, palette, paper effects, components
- [Testing](docs/06-testing.md)
- [Deploying](docs/07-deploying.md): Cloudflare Pages
- [Starting next year's WishBook](docs/08-new-edition.md)
- [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md): workflow and project rules
