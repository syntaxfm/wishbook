# Testing

```sh
pnpm test                   # Vitest: tests/unit/
pnpm test:e2e               # Playwright: tests/e2e/, against pnpm build && pnpm preview
E2E_PORT=4511 pnpm test:e2e # use another port (to run several checkouts at once)
```

- **Unit tests** (`tests/unit/`) run the real content reader, pagination, asset resolver, catalog numbers, copy markup, share-card models and rendering, `catalog.txt` (with a snapshot of the fixture edition), redirects, routes, the sitemap, the wish-list codec, search, and the purchase-link component (rendered with Astro's container API). Most run against `tests/fixtures/`, two small fixture editions (2025 and 2026); a few check the real 2026 content.
- **Browser tests** (`tests/e2e/`) build the site and serve it: deep links in all three reading modes, page turns and jumps (with no network requests, and the right history entries), focus and live-region announcements, no-JavaScript rendering, every template at 390, 820, and 1360px without overflow, purchase links, the wish list round trip, ⌘K search, print, the 404 page, icons, and checks on the built files (year-scoped URLs everywhere, no requests to other origins, the root copies, `_redirects`, `catalog.txt`, the sitemap).
- **Page fit** (`tests/e2e/page-fit.spec.ts`): every page fits its fixed page box at full size, with 2% to spare, at page widths from 560 to 780px, with the wish list full and every "Circle it" button showing. A failure names the page, the width, how many pixels it's over, and its three tallest blocks. It also turns through the whole book at common desktop sizes and fails if any page had to be scaled down to fit.
- **Page turns** (`tests/e2e/turns.spec.ts`): frame-by-frame checks with real scrollbars: no scrollbar or overflow mid-turn, no jump on landing, shading eases out, and the turning page stays above the tabs.
- **Centerfold** (`tests/e2e/centerfold.spec.ts`): 2026 has no centerfold, so this builds the fixture edition (which has one) and tests the legend, hotspots, phone strip, and fit.
- **A second edition side by side** (`tests/e2e/second-edition.spec.ts`): copies the project to a temporary folder, adds the fixture 2025 edition next to the real 2026 one, runs a real `astro build` there, and checks that 2025 gets its own pages, share cards, catalog, and wish list while every 2026 file, the root copies, and `_redirects` stay byte for byte the same as the main build.
