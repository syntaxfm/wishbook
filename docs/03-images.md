# Images

Images aren't uploaded through Keystatic: drop the file into its folder with the right name and it shows up. Until then, a placeholder shows. Any of `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.svg` works.

## Where images go

| Image                                                       | Path                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A gift's photo                                              | `assets/<year>/items/<id>-<name>.<ext>`, id zero-padded to three digits (`001-silicone-usb-c-cables.webp`). Only the id prefix and the suffix matter; the name is for people. Don't end a name in `-<digit>`. |
| Extra photos of the same gift                               | `<id>-<name>-2.<ext>`, `-3`, …                                                                                                                                                                                |
| Generated item art (full-page features)                     | `assets/<year>/items/<id>-<name>-hero.<ext>`                                                                                                                                                                  |
| Other generated art (the grouse, section art, a centerfold) | `assets/<year>/generated/`, under the file name listed in `content/<year>/assets.yaml`                                                                                                                        |
| Host photos                                                 | `assets/<year>/hosts/<host-id>.<ext>`                                                                                                                                                                         |
| Cover art                                                   | `assets/<year>/cover/`                                                                                                                                                                                        |
| Shared brand assets (logo)                                  | `assets/brand/`                                                                                                                                                                                               |
| Old photos kept for reference                               | `assets/<year>/archive/` (same names)                                                                                                                                                                         |

Nothing in `archive/` is resolved or built. Move a file back to its folder to use it again.

## Optimizing

Run `pnpm optimize:assets` after adding images. It re-encodes every PNG and JPEG under `assets/` as a WebP with the same base name (at most 2000px on the longest side, quality 90, lossless alpha), shrinks any larger WebP, and reports the sizes. It skips files already done, so it's safe to run any time.

The site serves AVIF with a WebP fallback, in responsive sizes made at build time. No PNG or JPEG copies ship (except the share cards, which are PNGs).

## What's still missing

`pnpm assets` lists every image the current edition expects (item photos and extras, host photos, generated art, and the cover), each marked present or MISSING with the exact path to create, followed by the prompt for each missing piece of generated art. It then lists the items (picks, then mentions) still missing a buy link, with their content files. `pnpm links` prints only the links part. Pass a year (`pnpm assets 2026`) for another edition. Nothing here is fatal: a missing image renders a placeholder and an item without a buy link simply shows none.

## The grouse mascot

The grouse poses are transparent WebP cutouts in `assets/<year>/generated/grouse-<pose>.webp`, each listed in `assets.yaml` as `IMG-M1-<pose>`: waving, pointing, peeking, headphones, gift, marker, magnifier, presents, price-tag, flashlight, typing, chef, jeep, joker, and stocking.

- A page shows one through its `mascot` field (mirrored with `mascotFlip`, never for a pose with lettering).
- Search's no-results, the empty order form, the wish-list page, and the 404 page pick theirs in `site.yaml` under `mascots`.
- They were cut from one generated character sheet. To redo them, generate a new sheet with the same poses in the same order and replace the files with the same names.

## Icons and textures

- `pnpm icons` remakes the favicons and home-screen icons in `public/` from the waving grouse (`scripts/make-icons.mjs`).
- `pnpm textures` re-bakes the paper, print, and wood texture tiles in `src/styles/textures/` (`scripts/bake-textures.mjs`).
