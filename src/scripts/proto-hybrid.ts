/**
 * PROTOTYPE: the hybrid layout's client half (see "hybrid" in
 * src/lib/proto-layout.ts): measures the readable page width, picks the tier
 * for the viewport, and shows the reasoning in the switcher panel.
 *
 * Measuring: every page of the book is cloned into one hidden, fixed-position
 * host at a layout width, laid out there (the same box the fit code uses:
 * width × page aspect, content at its natural height), and read once: the
 * content height, the page's padding, and the smallest computed font size of
 * its item copy. The host is removed in the same task, so nothing paints and
 * the reader's scroll position can't move. One pass is a single layout of the
 * book (about 20ms); results are cached per layout width, the readable width
 * per floor (also in localStorage, for the head script), and everything is
 * measured again once web fonts finish loading.
 */
import {
  availableWidth,
  fitScale,
  hybridMode,
  hybridPageWidth,
  layoutWidth,
  readableWidth,
  HYBRID_FLOOR,
  HYBRID_FLOOR_KEY,
  HYBRID_FLOOR_RANGE,
  HYBRID_MINW_KEY,
  PAGE_ASPECT,
  SIDE_GUTTERS_Y,
  type PageMeasure,
} from "../lib/proto-layout";
import type { ReadingMode } from "../lib/modes";
import { currentMode } from "./book";

const html = document.documentElement;
const cache = new Map<number, PageMeasure[]>();
const readableByFloor = new Map<number, number>();
/** How long the last uncached measurement took, in ms. */
let lastCost = 0;

function storedFloor(): number {
  let v = NaN;
  try {
    v = parseFloat(localStorage.getItem(HYBRID_FLOOR_KEY) ?? "");
  } catch {
    // storage unavailable
  }
  const [lo, hi] = HYBRID_FLOOR_RANGE;
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : HYBRID_FLOOR;
}

export const settings = { floor: storedFloor() };

/** Item copy: the wrappers templates put item descriptions in. */
const BODY = ".desc, .item, [data-item-id]:not(a)";

/** Every page (not the centerfold) laid out at width `lw`. */
function measure(lw: number): PageMeasure[] {
  const hit = cache.get(lw);
  if (hit) return hit;
  const t0 = performance.now();
  const stage = document.querySelector<HTMLElement>(".book-pages");
  if (!stage) return [];
  const host = document.createElement("div");
  host.className = "hy-measure";
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  host.style.width = `${lw}px`;
  host.style.setProperty("--hy-h", `${lw * PAGE_ASPECT}px`);
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
    const cs = getComputedStyle(c);
    let body = Infinity;
    for (const el of pg.querySelectorAll(BODY)) {
      if (!el.textContent?.trim()) continue;
      body = Math.min(body, parseFloat(getComputedStyle(el).fontSize));
    }
    if (!Number.isFinite(body)) body = parseFloat(getComputedStyle(pg).fontSize);
    out.push({
      slug: c.dataset.slug ?? "",
      title: c.dataset.title ?? "",
      natural: pg.offsetHeight,
      pad: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      body,
    });
  }
  host.remove();
  lastCost = performance.now() - t0;
  cache.set(lw, out);
  return out;
}

/** The narrowest readable page width for the current floor (measured once per floor). */
function readable(): number {
  const floor = settings.floor;
  let r = readableByFloor.get(floor);
  if (r === undefined) {
    r = readableWidth(measure, floor);
    readableByFloor.set(floor, r);
    try {
      const all = JSON.parse(localStorage.getItem(HYBRID_MINW_KEY) || "{}") as Record<
        string,
        number
      >;
      all[floor] = Number.isFinite(r) ? r : 1e5;
      localStorage.setItem(HYBRID_MINW_KEY, JSON.stringify(all));
    } catch {
      // storage unavailable: the next load guesses first
    }
  }
  return r;
}

/** The tier for this viewport; sets --hy-minw, the floor under the page box. */
export function decide(w: number, h: number): ReadingMode {
  const r = readable();
  html.style.setProperty("--hy-minw", `${Math.min(r, 1e5)}px`);
  const mode = hybridMode(w, r);
  html.dataset.hyTier = mode === "book" ? "spread" : mode === "single" ? "single" : "feed";
  view = { w, h, mode };
  queueInfo();
  return mode;
}

/** Drops measurements (web fonts arrived: every height changes). */
export function clearMeasurements(): void {
  cache.clear();
  readableByFloor.clear();
}

let view: { w: number; h: number; mode: ReadingMode } | null = null;

export interface HybridStatus {
  tier: "spread" | "single" | "feed";
  floor: number;
  /** Narrowest readable page width (px on screen). */
  readable: number;
  /** Page width on screen, and the box height. */
  pageWidth: number | null;
  pageHeight: number | null;
  /** How far every spread runs past the window (0: it fits). */
  scroll: number;
  /** Pages whose content is taller than the box at this width (they scale down). */
  overflowing: { slug: string; title: string; scale: number; px: number }[];
  /** The pages on screen: their scale and effective body copy size. */
  shown: { slug: string; title: string; scale: number; px: number }[];
}

/** Where things stand at this viewport (panel, tests, console). */
export function status(): HybridStatus | null {
  if (!view) return null;
  const { w, h, mode } = view;
  const r = readable();
  const tier = mode === "book" ? "spread" : mode === "single" ? "single" : "feed";
  const base = { tier, floor: settings.floor, readable: r } as const;
  if (mode === "scroll") {
    return { ...base, pageWidth: null, pageHeight: null, scroll: 0, overflowing: [], shown: [] };
  }
  const pw = hybridPageWidth(mode, w, h, r);
  const { lw, pz } = layoutWidth(pw);
  const ms = measure(lw);
  const row = (m: PageMeasure) => {
    const scale = fitScale(m, lw);
    return {
      slug: m.slug,
      title: m.title,
      scale: Math.round(scale * 1000) / 1000,
      px: Math.round(m.body * scale * pz * 100) / 100,
    };
  };
  const shownSlugs = new Set(
    [...document.querySelectorAll<HTMLElement>(".book-pages > .is-shown")]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.dataset.slug),
  );
  return {
    ...base,
    pageWidth: Math.round(pw * 10) / 10,
    pageHeight: Math.round(pw * PAGE_ASPECT * 10) / 10,
    scroll: Math.max(0, Math.round(pw * PAGE_ASPECT + SIDE_GUTTERS_Y - h)),
    overflowing: ms.filter((m) => fitScale(m, lw) < 1).map(row),
    shown: ms.filter((m) => shownSlugs.has(m.slug)).map(row),
  };
}

// PROTOTYPE: a console / test handle.
(globalThis as unknown as { wishbookHybrid: unknown }).wishbookHybrid = {
  status,
  settings,
  available: availableWidth,
};

/* ---------- the panel: tier, page size, the pages on screen, the floor knob ---------- */

let info: HTMLElement | null = null;
let onChange: (() => void) | null = null;

function floorKnob(): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "hy-knob";
  const name = document.createElement("span");
  name.textContent = "floor";
  const value = document.createElement("output");
  const show = () => (value.textContent = `${settings.floor}px`);
  const [lo, hi] = HYBRID_FLOOR_RANGE;
  const button = (text: string, dir: 1 | -1) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.setAttribute("aria-label", `floor ${dir > 0 ? "up" : "down"}`);
    b.addEventListener("click", () => {
      const v = settings.floor + dir * 0.5;
      if (v < lo || v > hi) return;
      settings.floor = v;
      try {
        localStorage.setItem(HYBRID_FLOOR_KEY, String(v));
      } catch {
        // storage unavailable
      }
      show();
      onChange?.();
    });
    return b;
  };
  wrap.append(name, button("−", -1), value, button("+", 1));
  show();
  return wrap;
}

/** Adds the hybrid rows to the switcher; `changed` re-decides the tier. */
export function mountPanel(switcher: HTMLElement, changed: () => void): void {
  onChange = changed;
  info = document.createElement("div");
  info.className = "hy-info";
  const why = document.createElement("span");
  why.className = "hy-why";
  const over = document.createElement("span");
  over.className = "hy-over";
  info.append(why, floorKnob(), over);
  switcher.append(info);
  document.addEventListener("wishbook:navigate", queueInfo);
  queueInfo();
}

let queued = false;
function queueInfo(): void {
  if (queued || !info) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderInfo();
  });
}

const px = (v: number) => `${v.toFixed(1)}px`;

function renderInfo(): void {
  const s = html.dataset.layout === "hybrid" ? status() : null;
  if (!info || !s) return;
  if (info.parentElement) info.parentElement.dataset.tier = s.tier;
  const parts = [`${s.tier} · floor ${s.floor}px → readable page ≥ ${Math.round(s.readable)}px`];
  if (s.pageWidth !== null) {
    parts.push(`page ${Math.round(s.pageWidth)}×${Math.round(s.pageHeight!)}px`);
    parts.push(s.scroll ? `every spread scrolls ${s.scroll}px` : "fits the window");
    for (const p of s.shown) {
      parts.push(`${p.title}: scale ${p.scale}, body ${px(p.px)}`);
    }
  }
  if (lastCost) parts.push(`measured in ${Math.round(lastCost)}ms`);
  info.querySelector(".hy-why")!.textContent = parts.join(" · ");
  info.querySelector(".hy-over")!.textContent =
    currentMode() === "scroll"
      ? ""
      : s.overflowing.length
        ? `Overflowing the box at this size (scaled down; revamp targets): ${s.overflowing
            .map((p) => `${p.title} ${p.scale}`)
            .join(", ")}`
        : "No page overflows the box at this size.";
}
