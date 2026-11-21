# Starting next year's WishBook

Each year is a new edition next to the old ones; nothing from the previous year is edited or moved.

1. Create `content/<year>/` with the same files as the current edition: `site.yaml`, `sections.yaml`, `book.yaml`, `timestamps.yaml`, `assets.yaml`, `items/`, and `hosts/`. Copying the previous year and clearing it out is the quickest start. Item ids start again at 1: ids are per edition, permanent, and never reused within it.
2. Create `assets/<year>/` with `items/`, `hosts/`, `cover/`, and `generated/`, and fill it as photos arrive (`pnpm assets <year>` shows what's missing).
3. Add the year to `content/editions.yaml` and set `current` to it. The current edition is the one served at `/` and `/catalog.txt`, the target of the year-less `_redirects`, and the one Keystatic edits.
4. Optionally add `src/styles/editions/<year>.css` to override tokens or textures for that year only.
5. Update the paths in the README's content table to the new year.
6. Decide what happens to older years:
   - **Keep them building** (the default): leave them in `editions.yaml` with their content and assets. Their URLs, share cards, and shared wish lists keep working and pick up site-wide fixes, but they also change whenever shared code changes, and every deploy builds them.
   - **Freeze them as snapshots**: copy the year's built files (`dist/<year>/` and the `dist/_astro/` files they use) into `public/`, then remove the year from `editions.yaml`. Its URLs keep working and never change again, but it no longer picks up fixes. This isn't automated; check the result with `pnpm build && pnpm preview`.
