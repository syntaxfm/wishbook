/**
 * Picks the reading mode for the viewport from the readable page width (see
 * src/lib/modes.ts), measured in the browser.
 *
 * Measuring: every page of the book is cloned into one hidden, fixed-position
 * host at a layout width, laid out there (the fixed box, content at its
 * natural height), and read once: the smallest computed font size of its item
 * copy. The host is removed in the same task, so nothing paints and the
 * reader's scroll position can't move. One pass is a single layout of the
 * book (about 20ms); results are cached per layout width, the readable width
 * once per load (and in localStorage, for the head script of the next load),
 * and everything is measured again once web fonts finish loading.
 */
import {
  PAGE_ASPECT,
  finiteWidth,
  modeFor,
  readableKey,
  readableWidth,
  type PageMeasure,
  type ReadingMode,
} from "../lib/modes";

const html = document.documentElement;
const cache = new Map<number, PageMeasure[]>();
let readable: number | null = null;

/** Item copy: the wrappers templates put item descriptions in. */
const BODY = ".desc, .item, [data-item-id]:not(a)";

/** Every page (not the centerfold) laid out at width `lw`. */
function measure(lw: number): PageMeasure[] {
  const hit = cache.get(lw);
  if (hit) return hit;
  const stage = document.querySelector<HTMLElement>(".book-pages");
  if (!stage) return [];
  const host = document.createElement("div");
  host.className = "readable-measure";
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  host.style.width = `${lw}px`;
  host.style.setProperty("--measure-h", `${lw * PAGE_ASPECT}px`);
  for (const src of stage.querySelectorAll<HTMLElement>(":scope > .page")) {
    const c = src.cloneNode(true) as HTMLElement;
    c.classList.remove("is-fit", "leaf", "leaf-front", "leaf-rear", "lift", "lifted", "under");
    c.removeAttribute("style");
    for (const el of c.querySelectorAll("[id]")) el.removeAttribute("id");
    host.append(c);
  }
  document.body.append(host);
  const out: PageMeasure[] = [];
  for (const c of host.children as HTMLCollectionOf<HTMLElement>) {
    const pg = c.querySelector<HTMLElement>(":scope > .pg");
    if (!pg) continue;
    let body = Infinity;
    for (const el of pg.querySelectorAll(BODY)) {
      if (!el.textContent?.trim()) continue;
      body = Math.min(body, parseFloat(getComputedStyle(el).fontSize));
    }
    if (!Number.isFinite(body)) body = parseFloat(getComputedStyle(pg).fontSize);
    out.push({ slug: c.dataset.slug ?? "", body });
  }
  host.remove();
  cache.set(lw, out);
  return out;
}

/** The narrowest readable page width (measured once, then remembered). */
function readableNow(): number {
  if (readable === null) {
    readable = readableWidth(measure);
    try {
      localStorage.setItem(readableKey(html.dataset.edition ?? ""), String(finiteWidth(readable)));
    } catch {
      // storage unavailable: the next load guesses first
    }
  }
  return readable;
}

/** The mode for this viewport width; sets --readable-w, the floor under the page box. */
export function modeForViewport(width: number): ReadingMode {
  const r = readableNow();
  html.style.setProperty("--readable-w", `${finiteWidth(r)}px`);
  return modeFor(width, r);
}

/** Drops measurements (web fonts arrived: every size changes). */
export function clearMeasurements(): void {
  cache.clear();
  readable = null;
}
