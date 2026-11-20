/**
 * The item index embedded once in every HTML file (as JSON) for the client:
 * search, the wish-list order form total, the toggles' names, and the printed
 * order form. Kept compact: short keys, nulls dropped.
 */
import type { BookContext } from "./book";
import { formatCatalogNumber } from "./catalog";

/** One item as the browser sees it. */
export interface IndexItem {
  /** Item id (permanent within the edition). */
  id: number;
  /** Name. */
  n: string;
  /** Brand. */
  b?: string;
  /** Who picked it (short names). */
  k?: string[];
  /** Section name. */
  sec?: string;
  /** Slug of the page the index sends it to (navigate() target). */
  s?: string;
  /** That page, as a reference: "page 6 A". */
  l?: string;
  /** Catalog number: "SYN 036:41". */
  c?: string;
  /** Price: confirmed, else the estimate. */
  p?: number;
  /** 1 when `p` is an estimate. */
  e?: 1;
  /** Shown instead of a price ("Price upon request"). */
  x?: string;
  /** Buy link (none: print nothing). */
  u?: string;
}

/** The DOM id of the embedded index's <script type="application/json">. */
export const ITEM_INDEX_ID = "wishbook-items";

/** Every item of the edition, in the order of the page the index sends it to. */
export function buildItemIndex(ctx: BookContext): IndexItem[] {
  const position = new Map(ctx.book.pages.map((p, i) => [p.slug, i]));
  return ctx.content.items
    .map((item) => {
      const page = ctx.indexPageOf(item);
      const { confirmed, estimate, label } = item.price;
      const amount = confirmed ?? estimate;
      const entry: IndexItem = { id: item.id, n: item.name };
      if (item.brand) entry.b = item.brand;
      if (item.pickedBy.length) entry.k = item.pickedBy.map((h) => h.shortName);
      entry.sec = item.section.name;
      if (page) {
        entry.s = page.slug;
        entry.l = ctx.book.ref(page.slug);
      }
      if (item.timestamp) entry.c = formatCatalogNumber(item.timestamp);
      if (amount !== null) entry.p = amount;
      if (confirmed === null && estimate !== null) entry.e = 1;
      if (amount === null && label) entry.x = label;
      if (item.buyLink) entry.u = item.buyLink;
      return { entry, at: page ? (position.get(page.slug) ?? Infinity) : Infinity };
    })
    .toSorted((a, b) => a.at - b.at || a.entry.id - b.entry.id)
    .map((r) => r.entry);
}

/** The index as JSON safe to inline in a <script> element. */
export function itemIndexJson(ctx: BookContext): string {
  return JSON.stringify(buildItemIndex(ctx)).replace(/</g, "\\u003c");
}
