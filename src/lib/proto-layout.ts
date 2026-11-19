/**
 * PROTOTYPE: alternative reading layouts for screens wider than a phone, to
 * try side by side before one is chosen. Everything prototype-only lives in
 * this module, src/scripts/proto-layout.ts, and src/styles/proto-layout.css;
 * removing them (and their three hooks: the head script in BookPage.astro,
 * the import in Book.astro, the stylesheet import in global.css) leaves the
 * chosen layout's code to fold into book.css and the engine.
 *
 * Pick a layout with `?layout=a|b|c|d|e1|e2` (`e` means `e1`) or the
 * switcher panel; the choice is remembered in localStorage. <html> gets
 * `data-layout` (the variant) and `data-chrome` (the frame it uses):
 *
 *   a   Spread fit        spreads ≥ 1000px, fitted to the viewport; arrows beside
 *   b   Single more often spreads only when each page stays readable, else one big page
 *   c   Fit + zoom        like a, plus a magnifier that opens a page full width
 *   d   Viewer            the spread fills the screen; auto-hiding overlay controls
 *   e1  Scroll: pages     no flipping; one column of pages, sticky section rail
 *   e2  Scroll: spreads   no flipping; spreads stacked, sticky section rail
 *   hybrid                a's spread while body text stays readable, else one
 *                         page at a readable size that scrolls, else the feed
 *                         (see "hybrid" below and src/scripts/proto-hybrid.ts)
 */
import { BOOK_MIN_WIDTH, MODE_CLASS, SINGLE_MIN_WIDTH, type ReadingMode } from "./modes";

export const LAYOUTS = ["a", "b", "c", "d", "e1", "e2", "hybrid"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const DEFAULT_LAYOUT: Layout = "a";
export const LAYOUT_KEY = "wishbook:layout";

export const LAYOUT_NAMES: Record<Layout, string> = {
  a: "Spread fit",
  b: "Single more often",
  c: "Fit + zoom",
  d: "Viewer",
  e1: "Scroll: pages",
  e2: "Scroll: spreads",
  hybrid: "Hybrid",
};

export type Chrome = "side" | "viewer" | "feed" | "page";

/**
 * The frame each layout uses (styles key off `data-chrome`). Hybrid changes
 * frame with its tier: see chromeFor.
 */
export const LAYOUT_CHROME: Record<Layout, Chrome> = {
  a: "side",
  b: "side",
  c: "side",
  d: "viewer",
  e1: "feed",
  e2: "feed",
  hybrid: "side",
};

/** The frame for a layout in a reading mode (hybrid: side, page, or feed by tier). */
export function chromeFor(layout: Layout, mode: ReadingMode): Chrome {
  if (layout !== "hybrid") return LAYOUT_CHROME[layout];
  return mode === "book" ? "side" : mode === "single" ? "page" : "feed";
}

/*
 * The page box in the side frame (keep in step with proto-layout.css):
 * gutters of 68px left (prev arrow) and 108px right (tabs, next arrow),
 * 16px above and below, pages at most 780px wide.
 */
export const SIDE_GUTTERS_X = 176;
export const SIDE_GUTTERS_Y = 32;
export const PAGE_MAX = 780;
export const PAGE_ASPECT = 1.303;
/** Layout b shows spreads only while each page is at least this wide. */
export const READABLE_PAGE = 560;

export function parseLayout(value: string | null | undefined): Layout | null {
  if (!value) return null;
  const v = value.toLowerCase() === "e" ? "e1" : value.toLowerCase();
  return (LAYOUTS as readonly string[]).includes(v) ? (v as Layout) : null;
}

/** Page width of a spread in the side frame at this viewport. */
export function sideSpreadPageWidth(w: number, h: number): number {
  return Math.min(PAGE_MAX, (w - SIDE_GUTTERS_X) / 2, (h - SIDE_GUTTERS_Y) / PAGE_ASPECT);
}

/**
 * The reading mode a layout uses at a viewport size. Phones always scroll.
 * For hybrid this is only the first guess (before the client has measured
 * the book): see chooseTier.
 */
export function layoutMode(layout: Layout, w: number, h: number): ReadingMode {
  if (w < SINGLE_MIN_WIDTH) return "scroll";
  if (LAYOUT_CHROME[layout] === "feed") return "scroll";
  if (layout === "b") return sideSpreadPageWidth(w, h) >= READABLE_PAGE ? "book" : "single";
  if (layout === "hybrid")
    return sideSpreadPageWidth(w, h) >= HYBRID_GUESS_PAGE ? "book" : "single";
  return w >= BOOK_MIN_WIDTH ? "book" : "single";
}

/* ---------- hybrid ----------
 * Three tiers, chosen per viewport size from the book's worst page:
 *
 *   1  spread   layout a, only while every page's body copy, at the fit scale
 *               its spread page needs, renders at least `floor` px
 *   2  single   one page at a readable size (width up to SINGLE_PAGE_MAX,
 *               never fit-scaled); the window scrolls within the page, and a
 *               turn brings the next page in at the top. Used while every
 *               page needs at most `screens` window heights
 *   3  feed     the whole catalog as one scrolling column (like e1)
 *
 * Body copy size is measured, not assumed: the client lays every page out
 * at the width in question and reads the computed font size of its item
 * copy (see src/scripts/proto-hybrid.ts). Text sizes are in cqi, so they
 * follow the page width; fit and the narrow-box zoom (--pz) shrink them
 * further.
 */

/** Default readability floor: the effective size of body copy, in px. */
export const HYBRID_FLOOR = 11;
export const HYBRID_FLOOR_RANGE = [9, 14] as const;
/** Default limit for one page in tier 2, in window heights. */
export const HYBRID_SCREENS = 2;
export const HYBRID_SCREENS_RANGE = [1, 4] as const;
export const HYBRID_FLOOR_KEY = "wishbook:hybrid:floor";
export const HYBRID_SCREENS_KEY = "wishbook:hybrid:screens";
/** Tiers already decided, by viewport and settings, so a reload paints right first. */
export const HYBRID_CACHE_KEY = "wishbook:hybrid:tiers";
/** Before anything is measured: a spread with pages at least this wide. */
export const HYBRID_GUESS_PAGE = 600;

/** Pages narrower than this lay out at this width and zoom down (src/scripts/fit.ts). */
export const DESIGN_MIN = 560;
/** Tier 2: the page grows to this width at most (body copy reaches its 15px cap here). */
export const SINGLE_PAGE_MAX = 700;
/** Tier 2: room beside the page for the arrows. Keep in step with proto-layout.css. */
export const SINGLE_GUTTER = 64;
/** Tier 2: the window height left for the page (top padding, the tab bar below). */
export const SINGLE_CHROME_Y = 80;

/** A page laid out at a width (in layout px, before any --pz zoom). */
export interface PageMeasure {
  slug: string;
  title: string;
  /** Natural height of the page content (`.pg`). */
  natural: number;
  /** The page's own vertical padding. */
  pad: number;
  /** The smallest body copy font size on the page, at this width. */
  body: number;
}

/** A page box: its width on screen, the width it lays out at, and the zoom between. */
export interface PageGeometry {
  /** On-screen page width. */
  pw: number;
  /** Layout width (at least DESIGN_MIN). */
  lw: number;
  /** Zoom from layout to screen (≤ 1). */
  pz: number;
}

function geometry(pw: number): PageGeometry {
  const lw = Math.max(DESIGN_MIN, Math.round(pw));
  return { pw, lw, pz: Math.min(1, pw / lw) };
}

/** Tier 1: a page of layout a's spread (same sizes as proto-layout.css). */
export function spreadGeometry(w: number, h: number): PageGeometry {
  return geometry(Math.max(240, sideSpreadPageWidth(w, h)));
}

/** Tier 2: the single scrolling page. */
export function singleGeometry(w: number): PageGeometry {
  return geometry(Math.min(SINGLE_PAGE_MAX, w - 2 * SINGLE_GUTTER));
}

/** The fit scale a page needs in a box of the page aspect at its layout width. */
export function fitScale(m: PageMeasure, lw: number): number {
  const room = lw * PAGE_ASPECT - m.pad;
  return m.natural <= room + 1 ? 1 : room / m.natural;
}

/** Effective body copy size of a page in the spread: body × fit × zoom. */
export function spreadBodyPx(m: PageMeasure, g: PageGeometry): number {
  return m.body * fitScale(m, g.lw) * g.pz;
}

/** How many window heights a page needs in tier 2. */
export function singleScreens(m: PageMeasure, g: PageGeometry, h: number): number {
  const height = Math.max(m.natural + m.pad, g.lw * PAGE_ASPECT) * g.pz;
  return height / Math.max(1, h - SINGLE_CHROME_Y);
}

export interface Worst {
  slug: string;
  title: string;
  value: number;
}

export interface TierChoice {
  tier: 1 | 2 | 3;
  mode: ReadingMode;
  /** The page with the smallest body copy in a spread (effective px). */
  spread: Worst | null;
  /** The page needing the most window heights in tier 2. */
  screens: Worst | null;
  /** The page with the smallest body copy in tier 2 (effective px). */
  single: Worst | null;
}

function worst(ms: PageMeasure[], value: (m: PageMeasure) => number, most: boolean): Worst | null {
  let out: Worst | null = null;
  for (const m of ms) {
    const v = value(m);
    if (!out || (most ? v > out.value : v < out.value)) {
      out = { slug: m.slug, title: m.title, value: v };
    }
  }
  return out;
}

/**
 * Picks the tier for a viewport from the book's worst case. `measure(lw)`
 * returns every page laid out at that width (the client caches it).
 */
export function chooseTier(
  w: number,
  h: number,
  measure: (lw: number) => PageMeasure[],
  { floor = HYBRID_FLOOR, screens = HYBRID_SCREENS }: { floor?: number; screens?: number } = {},
): TierChoice {
  if (w < SINGLE_MIN_WIDTH) {
    return { tier: 3, mode: "scroll", spread: null, screens: null, single: null };
  }
  const sg = spreadGeometry(w, h);
  const spread = worst(measure(sg.lw), (m) => spreadBodyPx(m, sg), false);
  const og = singleGeometry(w);
  const singles = measure(og.lw);
  const tall = worst(singles, (m) => singleScreens(m, og, h), true);
  const small = worst(singles, (m) => m.body * og.pz, false);
  const base = { spread, screens: tall, single: small };
  // A tiny allowance so a value that rounds to the floor counts as reaching it.
  const eps = 0.005;
  if (!spread || spread.value >= floor - eps) return { tier: 1, mode: "book", ...base };
  if ((!tall || tall.value <= screens + eps) && (!small || small.value >= floor - eps)) {
    return { tier: 2, mode: "single", ...base };
  }
  return { tier: 3, mode: "scroll", ...base };
}

/** The cache key for a decided tier. */
export function hybridCacheKey(w: number, h: number, floor: number, screens: number): string {
  return `${w}x${h}:${floor}:${screens}`;
}

/**
 * The inline head script: runs after the mode script, picks the layout (query,
 * then storage, then the default), sets data-layout / data-chrome, and
 * corrects the mode class for layouts that choose modes differently. Hybrid
 * reuses the tier decided earlier for this viewport, if any.
 */
export const PROTO_HEAD_SCRIPT = `(function(){
var L=${JSON.stringify(LAYOUTS)},C=${JSON.stringify(LAYOUT_CHROME)},M=${JSON.stringify(MODE_CLASS)};
function p(v){if(!v)return null;v=v.toLowerCase();if(v==='e')v='e1';return L.indexOf(v)>=0?v:null}
var l=null;try{l=p(new URLSearchParams(location.search).get('layout'));if(l)localStorage.setItem('${LAYOUT_KEY}',l);else l=p(localStorage.getItem('${LAYOUT_KEY}'))}catch(e){}
l=l||'${DEFAULT_LAYOUT}';
var d=document.documentElement,w=innerWidth,h=innerHeight;
var sp=Math.min(${PAGE_MAX},(w-${SIDE_GUTTERS_X})/2,(h-${SIDE_GUTTERS_Y})/${PAGE_ASPECT});
var m=w<${SINGLE_MIN_WIDTH}?'scroll':C[l]==='feed'?'scroll':l==='b'?(sp>=${READABLE_PAGE}?'book':'single'):l==='hybrid'?(sp>=${HYBRID_GUESS_PAGE}?'book':'single'):w>=${BOOK_MIN_WIDTH}?'book':'single';
if(l==='hybrid'&&w>=${SINGLE_MIN_WIDTH}){try{var f=parseFloat(localStorage.getItem('${HYBRID_FLOOR_KEY}'))||${HYBRID_FLOOR},s=parseFloat(localStorage.getItem('${HYBRID_SCREENS_KEY}'))||${HYBRID_SCREENS};var t=JSON.parse(localStorage.getItem('${HYBRID_CACHE_KEY}')||'{}')[w+'x'+h+':'+f+':'+s];if(M[t])m=t}catch(e){}}
var c=l==='hybrid'?(m==='book'?'side':m==='single'?'page':'feed'):C[l];
d.setAttribute('data-layout',l);d.setAttribute('data-chrome',c);
for(var k in M)d.classList.remove(M[k]);d.classList.add(M[m]);
})()`;
