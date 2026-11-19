/**
 * The shared wish-list page (/<year>/wishlist/?w=<code>): decodes the code,
 * reveals the listed items' prerendered cards (unknown ids are ignored), and
 * offers "Add these to my list", which merges them into this edition's list.
 */
import { decodeWishlist } from "../lib/wishlist-codec";
import { fillPrintSheet } from "./print-sheet";
import { addAll, knownIds } from "./wishlist-store";

export function start(): void {
  const root = document.querySelector<HTMLElement>("[data-wishlist-page]");
  if (!root) return;
  const ids = knownIds(decodeWishlist(new URLSearchParams(location.search).get("w")));
  const listed = new Set(ids);

  for (const card of root.querySelectorAll<HTMLElement>("[data-wl-item]")) {
    card.hidden = !listed.has(Number(card.dataset.wlItem));
  }
  const some = ids.length > 0;
  const intro = root.querySelector<HTMLElement>("[data-wl-intro]");
  if (intro) intro.hidden = !some;
  const empty = root.querySelector<HTMLElement>("[data-wl-empty]");
  if (empty) empty.hidden = some;

  const add = root.querySelector<HTMLButtonElement>("[data-wl-add]");
  if (add) {
    add.hidden = !some;
    add.addEventListener("click", () => {
      addAll(ids);
      add.hidden = true;
      const added = root.querySelector<HTMLElement>("[data-wl-added]");
      if (added) added.hidden = false;
    });
  }
  fillPrintSheet(ids);
}
