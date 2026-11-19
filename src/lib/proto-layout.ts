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
 */
import { BOOK_MIN_WIDTH, MODE_CLASS, SINGLE_MIN_WIDTH, type ReadingMode } from "./modes";

export const LAYOUTS = ["a", "b", "c", "d", "e1", "e2"] as const;
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
};

/** The frame each layout uses (styles key off `data-chrome`). */
export const LAYOUT_CHROME: Record<Layout, "side" | "viewer" | "feed"> = {
  a: "side",
  b: "side",
  c: "side",
  d: "viewer",
  e1: "feed",
  e2: "feed",
};

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

/** The reading mode a layout uses at a viewport size. Phones always scroll. */
export function layoutMode(layout: Layout, w: number, h: number): ReadingMode {
  if (w < SINGLE_MIN_WIDTH) return "scroll";
  if (LAYOUT_CHROME[layout] === "feed") return "scroll";
  if (layout === "b") return sideSpreadPageWidth(w, h) >= READABLE_PAGE ? "book" : "single";
  return w >= BOOK_MIN_WIDTH ? "book" : "single";
}

/**
 * The inline head script: runs after the mode script, picks the layout (query,
 * then storage, then the default), sets data-layout / data-chrome, and
 * corrects the mode class for layouts that choose modes differently.
 */
export const PROTO_HEAD_SCRIPT = `(function(){
var L=${JSON.stringify(LAYOUTS)},C=${JSON.stringify(LAYOUT_CHROME)},M=${JSON.stringify(MODE_CLASS)};
function p(v){if(!v)return null;v=v.toLowerCase();if(v==='e')v='e1';return L.indexOf(v)>=0?v:null}
var l=null;try{l=p(new URLSearchParams(location.search).get('layout'));if(l)localStorage.setItem('${LAYOUT_KEY}',l);else l=p(localStorage.getItem('${LAYOUT_KEY}'))}catch(e){}
l=l||'${DEFAULT_LAYOUT}';
var d=document.documentElement,w=innerWidth,h=innerHeight;
d.setAttribute('data-layout',l);d.setAttribute('data-chrome',C[l]);
var m=w<${SINGLE_MIN_WIDTH}?'scroll':C[l]==='feed'?'scroll':l==='b'?(Math.min(${PAGE_MAX},(w-${SIDE_GUTTERS_X})/2,(h-${SIDE_GUTTERS_Y})/${PAGE_ASPECT})>=${READABLE_PAGE}?'book':'single'):w>=${BOOK_MIN_WIDTH}?'book':'single';
for(var k in M)d.classList.remove(M[k]);d.classList.add(M[m]);
})()`;
