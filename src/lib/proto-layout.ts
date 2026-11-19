/**
 * PROTOTYPE: alternative reading layouts for screens wider than a phone, to
 * try side by side before one is chosen. Everything prototype-only lives in
 * this module, src/scripts/proto-layout.ts, src/scripts/proto-hybrid.ts, and
 * src/styles/proto-layout.css; removing them (and their three hooks: the head
 * script in BookPage.astro, the import in Book.astro, the stylesheet import
 * in global.css) leaves the chosen layout's code to fold into book.css and
 * the engine.
 *
 * Pick a layout with `?layout=a|b|c|d|e1|e2|hybrid` (`e` means `e1`) or the
 * switcher panel; the choice is remembered in localStorage. <html> gets
 * `data-layout` (the variant) and `data-chrome` (the frame it uses):
 *
 *   a   Spread fit        spreads ≥ 1000px, fitted to the viewport; arrows beside
 *   b   Single more often spreads only when each page stays readable, else one big page
 *   c   Fit + zoom        like a, plus a magnifier that opens a page full width
 *   d   Viewer            the spread fills the screen; auto-hiding overlay controls
 *   e1  Scroll: pages     no flipping; one column of pages, sticky section rail
 *   e2  Scroll: spreads   no flipping; spreads stacked, sticky section rail
 *   hybrid                a, but the page box never shrinks below a readable
 *                         size: below that every spread is taller than the
 *                         window and scrolls (see "hybrid" below)
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

export type Chrome = "side" | "viewer" | "feed";

/**
 * The frame each layout uses (styles key off `data-chrome`). Hybrid uses the
 * side frame for spreads and single pages and the feed below that: see
 * chromeFor.
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

/** The frame for a layout in a reading mode. */
export function chromeFor(layout: Layout, mode: ReadingMode): Chrome {
  if (layout !== "hybrid") return LAYOUT_CHROME[layout];
  return mode === "scroll" ? "feed" : "side";
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
 * Hybrid needs the readable page width (measured): see hybridMode.
 */
export function layoutMode(layout: Layout, w: number, h: number): ReadingMode {
  if (w < SINGLE_MIN_WIDTH) return "scroll";
  if (LAYOUT_CHROME[layout] === "feed") return "scroll";
  if (layout === "b") return sideSpreadPageWidth(w, h) >= READABLE_PAGE ? "book" : "single";
  if (layout === "hybrid") return hybridMode(w, guessReadableWidth(HYBRID_FLOOR));
  return w >= BOOK_MIN_WIDTH ? "book" : "single";
}

/* ---------- hybrid ----------
 * Layout a with a floor under the page size. Every page of the book is one
 * box, W × page aspect: W is a's (the spread fits the window height) but
 * never narrower than the readable width, the narrowest page at which the
 * book's body copy, at its design size, is at least `floor` px on screen.
 * Below that the box stays at the readable width: every spread is the same
 * height, taller than the window, and the window scrolls the same amount on
 * every spread; turning snaps back to the top. A page whose content is
 * taller than the box still scales down to fit, as in a (not floored).
 *
 * Tiers, by width alone:
 *   spread  two pages side by side, whenever the window is wide enough for
 *           two pages whose body copy (at the page's own design size, before
 *           any fit) is at least the floor
 *   single  one page, when there is room for one such page but not two
 *   feed    the scroll feed, when there is room for neither (and on phones)
 *
 * Body copy size is measured, not assumed: the client lays every page out
 * at a width and reads the computed font size of its item copy (see
 * src/scripts/proto-hybrid.ts). Text sizes are in cqi, so they follow the
 * page width; a page narrower than DESIGN_MIN lays out at DESIGN_MIN and
 * zooms down (--pz), which shrinks them too.
 */

/** Default readability floor: the effective size of body copy, in px. */
export const HYBRID_FLOOR = 11;
export const HYBRID_FLOOR_RANGE = [9, 14] as const;
export const HYBRID_FLOOR_KEY = "wishbook:hybrid:floor";
/** Readable page widths already measured, by floor, so a reload paints right first. */
export const HYBRID_MINW_KEY = "wishbook:hybrid:minw";
/** Pages narrower than this lay out at this width and zoom down (src/scripts/fit.ts). */
export const DESIGN_MIN = 560;
/** Smallest item-copy size at DESIGN_MIN, as measured on the 2026 book (for the first guess). */
const GUESS_BODY_AT_MIN = 11.08;

/** Before anything is measured: the readable page width for a floor. */
export function guessReadableWidth(floor: number): number {
  return Math.ceil((DESIGN_MIN * floor) / GUESS_BODY_AT_MIN);
}

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

/** The layout width a page of this on-screen width uses, and the zoom between. */
export function layoutWidth(pw: number): { lw: number; pz: number } {
  const lw = Math.max(DESIGN_MIN, Math.round(pw));
  return { lw, pz: Math.min(1, pw / lw) };
}

/** Room for a spread / single page by width alone (the side frame's gutters). */
export function availableWidth(mode: "book" | "single", w: number): number {
  return Math.min(PAGE_MAX, mode === "book" ? (w - SIDE_GUTTERS_X) / 2 : w - SIDE_GUTTERS_X);
}

/** The tier for a viewport width, given the narrowest readable page width. */
export function hybridMode(w: number, readable: number): ReadingMode {
  if (w < SINGLE_MIN_WIDTH) return "scroll";
  if (availableWidth("book", w) >= readable) return "book";
  if (availableWidth("single", w) >= readable) return "single";
  return "scroll";
}

/**
 * The on-screen page width: a's (fit to the window), but never narrower
 * than the readable width; the room by width is the limit. Keep in step with
 * proto-layout.css.
 */
export function hybridPageWidth(
  mode: "book" | "single",
  w: number,
  h: number,
  readable: number,
): number {
  const byHeight = (h - SIDE_GUTTERS_Y) / PAGE_ASPECT;
  return Math.max(240, Math.min(availableWidth(mode, w), Math.max(byHeight, readable)));
}

/**
 * The narrowest on-screen page width at which every page's body copy is at
 * least `floor` px, from `measure(lw)` (every page laid out at lw). Infinity
 * when even the widest page is too small.
 */
export function readableWidth(measure: (lw: number) => PageMeasure[], floor: number): number {
  const smallest = (lw: number) => Math.min(...measure(lw).map((m) => m.body));
  // Below DESIGN_MIN the page is zoomed, so its text shrinks in proportion.
  const atMin = smallest(DESIGN_MIN);
  if (atMin >= floor) return Math.ceil((DESIGN_MIN * floor) / atMin);
  if (smallest(PAGE_MAX) < floor) return Infinity;
  let lo = DESIGN_MIN;
  let hi = PAGE_MAX;
  while (hi - lo > 1) {
    const mid = Math.round((lo + hi) / 2);
    if (smallest(mid) >= floor) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * The scale a's fit gives a page in the box at layout width `lw` (1 when its
 * content fits). Hybrid doesn't floor it: pages that still need it are the
 * ones whose templates overflow the box at full size.
 */
export function fitScale(m: PageMeasure, lw: number): number {
  const room = lw * PAGE_ASPECT - m.pad;
  return m.natural <= room + 1 ? 1 : room / m.natural;
}

/**
 * The inline head script: runs after the mode script, picks the layout (query,
 * then storage, then the default), sets data-layout / data-chrome, and
 * corrects the mode class for layouts that choose modes differently. Hybrid
 * uses the readable width measured earlier for its floor, if any (else a
 * guess), and exposes it to the page box CSS as --hy-minw.
 */
export const PROTO_HEAD_SCRIPT = `(function(){
var L=${JSON.stringify(LAYOUTS)},C=${JSON.stringify(LAYOUT_CHROME)},M=${JSON.stringify(MODE_CLASS)};
function p(v){if(!v)return null;v=v.toLowerCase();if(v==='e')v='e1';return L.indexOf(v)>=0?v:null}
var l=null;try{l=p(new URLSearchParams(location.search).get('layout'));if(l)localStorage.setItem('${LAYOUT_KEY}',l);else l=p(localStorage.getItem('${LAYOUT_KEY}'))}catch(e){}
l=l||'${DEFAULT_LAYOUT}';
var d=document.documentElement,w=innerWidth,h=innerHeight;
var sp=Math.min(${PAGE_MAX},(w-${SIDE_GUTTERS_X})/2,(h-${SIDE_GUTTERS_Y})/${PAGE_ASPECT});
var m=w<${SINGLE_MIN_WIDTH}?'scroll':C[l]==='feed'?'scroll':l==='b'?(sp>=${READABLE_PAGE}?'book':'single'):w>=${BOOK_MIN_WIDTH}?'book':'single';
if(l==='hybrid'){var f=${HYBRID_FLOOR},r;try{f=parseFloat(localStorage.getItem('${HYBRID_FLOOR_KEY}'))||f;r=JSON.parse(localStorage.getItem('${HYBRID_MINW_KEY}')||'{}')[f]}catch(e){}
r=r||Math.ceil(${DESIGN_MIN}*f/${GUESS_BODY_AT_MIN});
m=w<${SINGLE_MIN_WIDTH}?'scroll':Math.min(${PAGE_MAX},(w-${SIDE_GUTTERS_X})/2)>=r?'book':Math.min(${PAGE_MAX},w-${SIDE_GUTTERS_X})>=r?'single':'scroll';
if(d.style)d.style.setProperty('--hy-minw',Math.min(r,1e5)+'px')}
var c=l==='hybrid'&&m==='scroll'?'feed':C[l];
d.setAttribute('data-layout',l);d.setAttribute('data-chrome',c);
for(var k in M)d.classList.remove(M[k]);d.classList.add(M[m]);
})()`;
