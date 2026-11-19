/**
 * The wish list inside the book: a circle toggle on every item, the count in
 * the chrome, the order form (filled from the list), sharing, and printing.
 *
 * Toggles are added here, not in the static markup, so a page without
 * JavaScript shows no dead buttons. Each item block (`[data-item-id]`, except
 * centerfold hotspot links) gets a `button.wish-toggle` (aria-pressed) and a
 * hand-drawn marker loop (`svg.wish-circle`) that draws when circled. The
 * toggle fills the slot at the end of the item's purchase row
 * (`[data-wish-slot]`, see ItemLinks.astro), so adding it moves nothing.
 */
import { MARKER_LOOP } from "../lib/marker";
import { fillPrintSheet, renderTotal, totalOf } from "./print-sheet";
import { getList, indexItem, onList, shareUrl, toggle, type IndexItem } from "./wishlist-store";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Below this many rows the order form pads itself with blank lines (as on paper). */
const MIN_ROWS = 6;

let started = false;

export function start(): void {
  if (started) return;
  started = true;
  const tools = document.querySelector<HTMLElement>("[data-wish-tools]");
  const labels = {
    circle: tools?.dataset.circle ?? "",
    circled: tools?.dataset.circled ?? "",
    title: tools?.dataset.title ?? "",
  };
  addToggles(labels);
  onList((ids) => {
    renderToggles(ids, labels);
    renderCount(ids);
    renderOrderForm(ids);
    fillPrintSheet(ids);
  });
  bindForm();
  addEventListener("beforeprint", () => fillPrintSheet(getList()));
}

/* ---------- toggles ---------- */

type Labels = { circle: string; circled: string; title: string };

function addToggles(labels: Labels): void {
  const blocks = document.querySelectorAll<HTMLElement>(".book-pages [data-item-id]");
  for (const block of blocks) {
    if (block instanceof HTMLAnchorElement || block.parentElement?.closest("[data-item-id]")) {
      continue;
    }
    const id = Number(block.dataset.itemId);
    const item = indexItem(id);
    if (!item) continue;
    block.classList.add("wishable");
    // The loop is positioned on the block; keep blocks that are already positioned as they are.
    if (getComputedStyle(block).position === "static") block.classList.add("wish-rel");

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "wish-circle");
    svg.setAttribute("viewBox", "0 0 300 120");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", MARKER_LOOP);
    svg.append(path);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "wish-toggle";
    button.dataset.wishToggle = String(id);
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", labels.title ? `${labels.title}: ${item.n}` : item.n);
    button.textContent = labels.circle;
    button.addEventListener("click", () => {
      const on = toggle(id);
      // Draw the loop on every copy of this item (it can appear on several pages).
      for (const b of document.querySelectorAll<HTMLElement>(`.wishable[data-item-id="${id}"]`)) {
        b.classList.remove("drawing");
        const loop = b.querySelector<SVGPathElement>(":scope > .wish-circle path");
        const length = loop ? screenLength(loop) : 0;
        if (on && loop && length > 0) {
          loop.style.setProperty("--loop", `${Math.ceil(length) + 2}px`);
          b.classList.add("drawing");
        }
      }
    });
    block.append(svg);
    // The toggle goes in the item's purchase row (the slot ItemLinks reserves
    // on this page); a block without one gets it at its end.
    const slot =
      block.querySelector<HTMLElement>(`[data-wish-slot="${id}"]:empty`) ??
      block.closest(".page")?.querySelector<HTMLElement>(`[data-wish-slot="${id}"]:empty`);
    (slot ?? block).append(button);
  }
}

/** The loop's length on screen: the viewBox is stretched to the item, unevenly. */
function screenLength(path: SVGPathElement): number {
  const svg = path.ownerSVGElement;
  const box = svg?.getBoundingClientRect();
  if (!svg || !box || box.width === 0) return 0;
  const sx = box.width / svg.viewBox.baseVal.width;
  const sy = box.height / svg.viewBox.baseVal.height;
  const total = path.getTotalLength();
  const STEPS = 64;
  let length = 0;
  let prev = path.getPointAtLength(0);
  for (let i = 1; i <= STEPS; i++) {
    const p = path.getPointAtLength((total * i) / STEPS);
    length += Math.hypot((p.x - prev.x) * sx, (p.y - prev.y) * sy);
    prev = p;
  }
  return length;
}

function renderToggles(ids: number[], labels: Labels): void {
  const on = new Set(ids);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-wish-toggle]")) {
    const pressed = on.has(Number(button.dataset.wishToggle));
    button.setAttribute("aria-pressed", String(pressed));
    button.textContent = pressed ? labels.circled : labels.circle;
  }
  for (const block of document.querySelectorAll<HTMLElement>(".wishable[data-item-id]")) {
    block.classList.toggle("is-wished", on.has(Number(block.dataset.itemId)));
  }
}

function renderCount(ids: number[]): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-wish-count]")) {
    el.textContent = String(ids.length);
    el.hidden = ids.length === 0;
  }
}

/* ---------- order form ---------- */

function renderOrderForm(ids: number[]): void {
  const form = document.querySelector<HTMLElement>("[data-order-form]");
  if (!form) return;
  const container = form.querySelector<HTMLElement>("[data-order-rows]");
  if (!container) return;
  const firstBlank = container.querySelector("[data-order-row]");
  const shown = new Set<Element>();
  for (const id of ids) {
    const row = container.querySelector<HTMLElement>(`[data-order-item="${id}"]`);
    if (!row) continue;
    row.hidden = false;
    container.insertBefore(row, firstBlank);
    shown.add(row);
  }
  for (const row of container.querySelectorAll<HTMLElement>("[data-order-item]")) {
    if (!shown.has(row)) row.hidden = true;
  }
  const blanks = [...container.querySelectorAll<HTMLElement>("[data-order-row]")];
  blanks.forEach((row, i) => (row.hidden = i >= MIN_ROWS - shown.size));

  const list = ids.map(indexItem).filter((i): i is IndexItem => !!i);
  const total = totalOf(list);
  const cell = form.querySelector<HTMLElement>("[data-order-total]");
  if (cell) renderTotal(cell, total);
  const note = document.querySelector<HTMLElement>("[data-order-unpriced]");
  if (note) note.hidden = !total.unpriced;
  form.classList.toggle("has-items", shown.size > 0);
}

function bindForm(): void {
  const form = document.querySelector<HTMLElement>("[data-order-form]");
  const copied = document.querySelector<HTMLElement>("[data-share-copied]");
  const field = document.querySelector<HTMLInputElement>("[data-share-url]");

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-share]")) {
    button.addEventListener("click", async () => {
      const url = shareUrl(form?.dataset.sharePath ?? "", getList());
      if (copied) copied.hidden = true;
      if (field) {
        field.value = url;
        field.hidden = true;
      }
      try {
        await navigator.clipboard.writeText(url);
        if (copied) copied.hidden = false;
      } catch {
        // No clipboard access: show the link, selected, to copy by hand.
        if (field) {
          field.hidden = false;
          field.focus();
          field.select();
        }
      }
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-print]")) {
    button.addEventListener("click", () => {
      fillPrintSheet(getList());
      print();
    });
  }
}
