/**
 * PROTOTYPE: the hybrid layout's client half (see "hybrid" in
 * src/lib/proto-layout.ts): measures the book, picks the tier for the
 * viewport, and shows the reasoning in the switcher panel.
 *
 * Measuring: every page of the book is cloned into one hidden, fixed-position
 * host at a layout width, laid out there (the same box the fit code uses:
 * width × page aspect, content at its natural height), and read once: the
 * content height, the page's padding, and the smallest computed font size of
 * its item copy. The host is removed in the same task, so nothing paints and
 * the reader's scroll position can't move. One pass is a single layout of the
 * book; results are cached per layout width (a resize only measures widths
 * it hasn't seen), and the cache is dropped when web fonts finish loading.
 */
import {
  chooseTier,
  fitScale,
  hybridCacheKey,
  singleGeometry,
  singleScreens,
  spreadBodyPx,
  spreadGeometry,
  HYBRID_CACHE_KEY,
  HYBRID_FLOOR,
  HYBRID_FLOOR_KEY,
  HYBRID_FLOOR_RANGE,
  HYBRID_SCREENS,
  HYBRID_SCREENS_KEY,
  HYBRID_SCREENS_RANGE,
  PAGE_ASPECT,
  type PageMeasure,
  type TierChoice,
} from "../lib/proto-layout";

const html = document.documentElement;
const cache = new Map<number, PageMeasure[]>();
let last: TierChoice | null = null;
/** How long the last uncached measurement took, in ms. */
let lastCost = 0;

function stored(key: string, fallback: number, [lo, hi]: readonly [number, number]): number {
  let v = NaN;
  try {
    v = parseFloat(localStorage.getItem(key) ?? "");
  } catch {
    // storage unavailable
  }
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

export const settings = {
  floor: stored(HYBRID_FLOOR_KEY, HYBRID_FLOOR, HYBRID_FLOOR_RANGE),
  screens: stored(HYBRID_SCREENS_KEY, HYBRID_SCREENS, HYBRID_SCREENS_RANGE),
};

/** Item copy: the wrappers templates put item descriptions in. */
const BODY = ".desc, .item, [data-item-id]:not(a)";

/** Every page (not the centerfold) laid out at width `lw`. */
function measure(lw: number): PageMeasure[] {
  const hit = cache.get(lw);
  if (hit) return hit;
  const t0 = performance.now();
  const stage = document.querySelector<HTMLElement>(".book-pages");
  if (!stage) return [];
  const sources = [...stage.querySelectorAll<HTMLElement>(":scope > .page")];
  const host = document.createElement("div");
  host.className = "hy-measure";
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  host.style.width = `${lw}px`;
  host.style.setProperty("--hy-h", `${lw * PAGE_ASPECT}px`);
  for (const src of sources) {
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

/** Decides the tier for this viewport (measuring if needed) and records it. */
export function decide(w: number, h: number): TierChoice {
  const choice = chooseTier(w, h, measure, settings);
  last = choice;
  html.dataset.hyTier = String(choice.tier);
  try {
    const all = JSON.parse(localStorage.getItem(HYBRID_CACHE_KEY) || "{}") as Record<
      string,
      string
    >;
    const key = hybridCacheKey(w, h, settings.floor, settings.screens);
    delete all[key];
    all[key] = choice.mode;
    // keep the most recent few dozen sizes
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
    localStorage.setItem(HYBRID_CACHE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the next load guesses first
  }
  renderInfo();
  return choice;
}

/** Drops measurements (web fonts arrived: every height changes). */
export function clearMeasurements(): void {
  cache.clear();
}

/** The last decision, for the panel and tests. */
export function lastChoice(): TierChoice | null {
  return last;
}

/** Every page's numbers at this viewport (for tuning, from the console). */
function breakdown(w = innerWidth, h = innerHeight) {
  const sg = spreadGeometry(w, h);
  const og = singleGeometry(w);
  const single = new Map(measure(og.lw).map((m) => [m.slug, m]));
  return measure(sg.lw).map((m) => ({
    slug: m.slug,
    body: m.body,
    fit: Math.round(fitScale(m, sg.lw) * 1000) / 1000,
    spreadPx: Math.round(spreadBodyPx(m, sg) * 100) / 100,
    screens: Math.round(singleScreens(single.get(m.slug) ?? m, og, h) * 100) / 100,
  }));
}

// PROTOTYPE: a console / test handle.
(globalThis as unknown as { wishbookHybrid: unknown }).wishbookHybrid = {
  choice: lastChoice,
  settings,
  breakdown,
};

/* ---------- the panel: tier, reasons, and the two knobs ---------- */

let info: HTMLElement | null = null;
let onChange: (() => void) | null = null;

const TIER_NAMES = { 1: "spread", 2: "single page", 3: "feed" } as const;

function knob(
  label: string,
  key: string,
  get: () => number,
  set: (v: number) => void,
  step: number,
  [lo, hi]: readonly [number, number],
  unit: string,
): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "hy-knob";
  const name = document.createElement("span");
  name.textContent = label;
  const value = document.createElement("output");
  const show = () => (value.textContent = `${get()}${unit}`);
  const button = (text: string, dir: 1 | -1) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.setAttribute("aria-label", `${label} ${dir > 0 ? "up" : "down"}`);
    b.addEventListener("click", () => {
      const v = Math.round((get() + dir * step) * 100) / 100;
      if (v < lo || v > hi) return;
      set(v);
      try {
        localStorage.setItem(key, String(v));
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

/** Adds the hybrid row to the switcher; `changed` re-decides the tier. */
export function mountPanel(switcher: HTMLElement, changed: () => void): void {
  onChange = changed;
  info = document.createElement("div");
  info.className = "hy-info";
  const text = document.createElement("span");
  text.className = "hy-why";
  info.append(
    text,
    knob(
      "floor",
      HYBRID_FLOOR_KEY,
      () => settings.floor,
      (v) => (settings.floor = v),
      0.5,
      HYBRID_FLOOR_RANGE,
      "px",
    ),
    knob(
      "max",
      HYBRID_SCREENS_KEY,
      () => settings.screens,
      (v) => (settings.screens = v),
      0.25,
      HYBRID_SCREENS_RANGE,
      " screens",
    ),
  );
  switcher.append(info);
  renderInfo();
}

const px = (v: number) => `${v.toFixed(1)}px`;

function renderInfo(): void {
  const why = info?.querySelector(".hy-why");
  if (!why) return;
  const c = last;
  if (!c) {
    why.textContent = "";
    return;
  }
  if (info?.parentElement) info.parentElement.dataset.tier = String(c.tier);
  const parts = [`Tier ${c.tier}: ${TIER_NAMES[c.tier]}`];
  if (c.spread) parts.push(`spread worst: ${c.spread.title} ${px(c.spread.value)}`);
  if (c.screens) {
    parts.push(`single tallest: ${c.screens.title} ${c.screens.value.toFixed(2)} screens`);
  }
  if (c.single && c.tier > 1) parts.push(`single body ≥ ${px(c.single.value)}`);
  if (lastCost) parts.push(`measured in ${Math.round(lastCost)}ms`);
  why.textContent = parts.join(" · ");
  info!.title = parts.join("\n");
}
