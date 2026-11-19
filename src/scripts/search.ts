/**
 * ⌘K / Ctrl+K search over the embedded item index
 * (src/components/SearchDialog.astro). An ARIA combobox: type to filter,
 * ↑/↓ to move, Enter (or a click) opens the item's page through the book
 * engine, Esc closes and returns focus. Buttons with `data-search-open`
 * open it too.
 */
import { search } from "../lib/search";
import { navigate, pathOf } from "./book";
import { itemIndex, type IndexItem } from "./wishlist-store";

const LIMIT = 8;

interface Entry {
  item: IndexItem;
  name: string;
  brand: string | null;
  pickers: string[];
  section: string | null;
  page: string | null;
}

let dialog: HTMLDialogElement;
let input: HTMLInputElement;
let list: HTMLElement;
let none: HTMLElement | null;
let entries: Entry[] = [];
let results: Entry[] = [];
let active = -1;

export function start(): void {
  const el = document.querySelector<HTMLDialogElement>("dialog[data-search]");
  if (!el || dialog) return;
  dialog = el;
  input = dialog.querySelector<HTMLInputElement>("[data-search-input]")!;
  list = dialog.querySelector<HTMLElement>("[data-search-results]")!;
  none = dialog.querySelector<HTMLElement>("[data-search-none]");
  entries = itemIndex()
    .filter((item) => item.s)
    .map((item) => ({
      item,
      name: item.n,
      brand: item.b ?? null,
      pickers: item.k ?? [],
      section: item.sec ?? null,
      page: item.l ?? null,
    }));

  addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (dialog.open) dialog.close();
      else open();
    }
  });
  for (const button of document.querySelectorAll<HTMLElement>("[data-search-open]")) {
    button.addEventListener("click", open);
  }
  // Show the shortcut for this platform.
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) {
    for (const kbd of document.querySelectorAll<HTMLElement>("[data-search-key]")) {
      kbd.textContent = "Ctrl K";
    }
  }

  input.addEventListener("input", update);
  input.addEventListener("keydown", onKey);
  list.addEventListener("click", (e) => {
    const option = e.target instanceof Element ? e.target.closest("[role=option]") : null;
    if (option) go(Number((option as HTMLElement).dataset.i));
  });
  list.addEventListener("mousemove", (e) => {
    const option = e.target instanceof Element ? e.target.closest("[role=option]") : null;
    if (option) setActive(Number((option as HTMLElement).dataset.i));
  });
  // A click on the backdrop closes.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}

function open(): void {
  if (dialog.open) return;
  dialog.showModal();
  input.select();
  update();
}

function update(): void {
  results = search(input.value, entries, LIMIT);
  list.replaceChildren(
    ...results.map((r, i) => {
      const li = document.createElement("li");
      li.id = `search-opt-${i}`;
      li.setAttribute("role", "option");
      li.dataset.i = String(i);
      const name = document.createElement("span");
      name.className = "res-name";
      name.textContent = r.name;
      const meta = document.createElement("span");
      meta.className = "res-meta";
      meta.textContent = [r.brand, r.pickers.join(" & "), r.section].filter(Boolean).join(" · ");
      const page = document.createElement("span");
      page.className = "res-page";
      page.textContent = r.page ?? "";
      li.append(name, meta, page);
      return li;
    }),
  );
  const query = input.value.trim();
  if (none) none.hidden = !query || results.length > 0;
  input.setAttribute("aria-expanded", String(results.length > 0));
  setActive(results.length ? 0 : -1);
}

function setActive(i: number): void {
  active = i;
  for (const li of list.children) {
    li.setAttribute("aria-selected", String(li.id === `search-opt-${i}`));
  }
  if (i < 0) {
    input.removeAttribute("aria-activedescendant");
    return;
  }
  input.setAttribute("aria-activedescendant", `search-opt-${i}`);
  list.children[i]?.scrollIntoView({ block: "nearest" });
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!results.length) return;
    const step = e.key === "ArrowDown" ? 1 : -1;
    setActive((active + step + results.length) % results.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (active >= 0) go(active);
  }
}

function go(i: number): void {
  const r = results[i];
  if (!r?.item.s) return;
  dialog.close();
  if (!navigate(r.item.s)) {
    const path = pathOf(r.item.s);
    if (path) location.href = path;
  }
}
