/**
 * Reading modes by viewport width. Shared by the inline head script (which
 * sets the mode class before first paint) and the book engine (which switches
 * modes on resize), so both always agree.
 *
 *   book    ≥ 1000px  spreads with a 3D page turn
 *   single  ≥ 640px   one page with a lift-away turn
 *   scroll  below     a vertical feed
 */

export type ReadingMode = "book" | "single" | "scroll";

export const BOOK_MIN_WIDTH = 1000;
export const SINGLE_MIN_WIDTH = 640;

export const MODE_CLASS: Record<ReadingMode, string> = {
  book: "m-book",
  single: "m-single",
  scroll: "m-scroll",
};

export function modeFor(width: number): ReadingMode {
  return width >= BOOK_MIN_WIDTH ? "book" : width >= SINGLE_MIN_WIDTH ? "single" : "scroll";
}

/** The inline head script: adds `js` and the mode class to <html> before first paint. */
export const MODE_SCRIPT =
  `(function(){var w=innerWidth,c=document.documentElement.classList;` +
  `c.add('js',w>=${BOOK_MIN_WIDTH}?'${MODE_CLASS.book}':w>=${SINGLE_MIN_WIDTH}?'${MODE_CLASS.single}':'${MODE_CLASS.scroll}')})()`;
