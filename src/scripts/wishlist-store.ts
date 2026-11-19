/**
 * The reader's wish list for this edition, kept in localStorage under
 * `wishbook:<edition>:wishlist` (a JSON array of item ids, in the order they
 * were circled). Lists never mix across editions. Ids that aren't in this
 * edition's item index are ignored. Changes (here or in another tab) dispatch
 * `wishbook:wishlist` on document with `{ ids }`.
 *
 * Also reads the embedded item index (src/components/ItemIndex.astro).
 */
import { ITEM_INDEX_ID, type IndexItem } from "../lib/item-index";
import { encodeWishlist } from "../lib/wishlist-codec";

export type { IndexItem };

let items: IndexItem[] | null = null;
let byId: Map<number, IndexItem>;

/** The embedded item index ([] if the page has none). */
export function itemIndex(): IndexItem[] {
  if (!items) {
    const el = document.getElementById(ITEM_INDEX_ID);
    try {
      items = el?.textContent ? (JSON.parse(el.textContent) as IndexItem[]) : [];
    } catch {
      items = [];
    }
    byId = new Map(items.map((i) => [i.id, i]));
  }
  return items;
}

export function indexItem(id: number): IndexItem | undefined {
  itemIndex();
  return byId.get(id);
}

/** Only ids of this edition's items, each once, in order. */
export function knownIds(ids: Iterable<unknown>): number[] {
  itemIndex();
  const out: number[] = [];
  for (const id of ids) {
    if (typeof id === "number" && byId.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function storageKey(edition: string): string {
  return `wishbook:${edition}:wishlist`;
}

const edition = () => document.documentElement.dataset.edition ?? "";
/** Used when localStorage is unavailable (private mode, blocked storage). */
let memory: number[] = [];

export function getList(): number[] {
  try {
    const raw = localStorage.getItem(storageKey(edition()));
    if (raw === null) return knownIds(memory);
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? knownIds(parsed) : [];
  } catch {
    return knownIds(memory);
  }
}

export function setList(ids: readonly number[]): void {
  const list = knownIds(ids);
  memory = list;
  try {
    localStorage.setItem(storageKey(edition()), JSON.stringify(list));
  } catch {
    // Storage is unavailable: the list lives for this page only.
  }
  emit(list);
}

export function has(id: number): boolean {
  return getList().includes(id);
}

/** Circles or uncircles an item. Returns true if it is now on the list. */
export function toggle(id: number): boolean {
  const list = getList();
  const on = !list.includes(id);
  setList(on ? [...list, id] : list.filter((x) => x !== id));
  return on;
}

/** Adds ids to the end of the list (skipping ones already on it). */
export function addAll(ids: readonly number[]): void {
  const list = getList();
  setList([...list, ...ids.filter((id) => !list.includes(id))]);
}

/** The share path for a list: "/2026/wishlist/?w=<code>" (sharePath from the build). */
export function shareUrl(sharePath: string, ids: readonly number[]): string {
  const code = encodeWishlist(ids);
  const url = new URL(sharePath, location.origin);
  if (code) url.searchParams.set("w", code);
  return url.href;
}

function emit(ids: number[]): void {
  document.dispatchEvent(new CustomEvent("wishbook:wishlist", { detail: { ids } }));
}

let watching = false;

/** Calls fn with the list now and after every change, including other tabs. */
export function onList(fn: (ids: number[]) => void): void {
  document.addEventListener("wishbook:wishlist", (e) =>
    fn((e as CustomEvent<{ ids: number[] }>).detail.ids),
  );
  if (!watching) {
    watching = true;
    addEventListener("storage", (e) => {
      if (e.key === storageKey(edition())) emit(getList());
    });
  }
  fn(getList());
}
