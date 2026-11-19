/**
 * Reading modes ("tiers"). One module shared by the inline head script (which
 * sets the mode class before first paint) and the book engine (which measures
 * the book and switches modes on resize), so both always agree.
 *
 *   book    spreads: two pages side by side, with a 3D page turn, whenever the
 *           window is wide enough for two readable pages
 *   single  one page with a lift-away turn, when there is room for one
 *           readable page but not two
 *   scroll  a vertical feed, when there is room for neither, and always below
 *           SINGLE_MIN_WIDTH (phones)
 *
 * A page is readable when its body copy is at least READABLE_PX on screen.
 * Text sizes are in cqi, so they follow the page width: the readable width is
 * the narrowest page at which every page's smallest item copy reaches the
 * floor. The client measures it (src/scripts/readable.ts) and stores it per
 * edition, so the head script of the next load paints the right mode at once;
 * before anything is measured it guesses.
 *
 * In book and single modes every page is one fixed box, W × PAGE_ASPECT: W
 * fits the window height but never drops below the readable width (the window
 * then scrolls down the spread) and never exceeds the room beside the side
 * controls (book.css draws it).
 */

export type ReadingMode = "book" | "single" | "scroll";

export const MODE_CLASS: Record<ReadingMode, string> = {
  book: "m-book",
  single: "m-single",
  scroll: "m-scroll",
};

/** Below this width the feed is the only mode. */
export const SINGLE_MIN_WIDTH = 640;

/**
 * The room the side controls take beside the book (keep in step with
 * book.css): 50px on the left (prev arrow) and 90px on the right (tabs, next
 * arrow), not mirrored.
 */
export const SIDE_GUTTERS_X = 140;
/** The widest a page gets. */
export const PAGE_MAX = 780;
export const PAGE_ASPECT = 1.303;

/** The readability floor: the smallest body copy on screen, in px. */
export const READABLE_PX = 11;
/** Pages narrower than this lay out at this width and zoom down (src/scripts/fit.ts). */
export const DESIGN_MIN = 560;
/** Smallest item-copy size at DESIGN_MIN, as measured on the 2026 book (for the first guess). */
const GUESS_BODY_AT_MIN = 11.08;
/** Before anything is measured: the readable page width. */
export const GUESS_READABLE_WIDTH = Math.ceil((DESIGN_MIN * READABLE_PX) / GUESS_BODY_AT_MIN);

/** Where the measured readable width is kept, per edition. */
export function readableKey(edition: string): string {
  return `wishbook:${edition}:readable-width`;
}

/** A page laid out at a width (in layout px, before any zoom). */
export interface PageMeasure {
  slug: string;
  /** The smallest body copy font size on the page, at this width. */
  body: number;
}

/** Room for a spread's page / a single page, by width alone. */
export function availableWidth(mode: "book" | "single", width: number): number {
  return Math.min(
    PAGE_MAX,
    mode === "book" ? (width - SIDE_GUTTERS_X) / 2 : width - SIDE_GUTTERS_X,
  );
}

/** The reading mode for a viewport width, given the narrowest readable page width. */
export function modeFor(width: number, readable: number): ReadingMode {
  if (width < SINGLE_MIN_WIDTH) return "scroll";
  if (availableWidth("book", width) >= readable) return "book";
  if (availableWidth("single", width) >= readable) return "single";
  return "scroll";
}

/**
 * The narrowest on-screen page width at which every page's body copy is at
 * least `floor` px, from `measure(lw)` (every page laid out at lw). Infinity
 * when even the widest page is too small.
 */
export function readableWidth(measure: (lw: number) => PageMeasure[], floor = READABLE_PX): number {
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

/** A readable width as stored and as a CSS length (Infinity can be neither). */
export const finiteWidth = (readable: number): number => Math.min(readable, 1e5);

/**
 * The inline head script: adds `js` and the mode class to <html> before first
 * paint, using the readable width measured on an earlier visit (else the
 * guess), and exposes that width to the page box CSS as --readable-w.
 */
export const MODE_SCRIPT = `(function(){
var d=document.documentElement,w=innerWidth,r;
try{r=parseFloat(localStorage.getItem('wishbook:'+d.getAttribute('data-edition')+':readable-width'))}catch(e){}
r=r>0?r:${GUESS_READABLE_WIDTH};
var m=w<${SINGLE_MIN_WIDTH}?'${MODE_CLASS.scroll}':Math.min(${PAGE_MAX},(w-${SIDE_GUTTERS_X})/2)>=r?'${MODE_CLASS.book}':Math.min(${PAGE_MAX},w-${SIDE_GUTTERS_X})>=r?'${MODE_CLASS.single}':'${MODE_CLASS.scroll}';
d.classList.add('js',m);d.style.setProperty('--readable-w',Math.min(r,1e5)+'px');
})()`;
