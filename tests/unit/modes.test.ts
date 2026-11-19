import { describe, expect, it } from "vitest";
import {
  GUESS_READABLE_WIDTH,
  MODE_CLASS,
  MODE_SCRIPT,
  SINGLE_MIN_WIDTH,
  modeFor,
  readableKey,
  readableWidth,
  type PageMeasure,
} from "../../src/lib/modes";

/**
 * A fake book: page text in cqi, like the real pages, so sizes scale with the
 * layout width (`k` × the base body size).
 */
function book(pages: { k?: number }[]) {
  return (lw: number): PageMeasure[] =>
    pages.map(({ k = 1 }, i) => ({ slug: `p${i}`, body: k * Math.min(15, lw * 0.0215) }));
}

/** Runs the inline head script against a fake window and returns what it set. */
function runHead(w: number, stored: Record<string, string> = {}, edition = "2026") {
  const classes = new Set<string>();
  const props: Record<string, string> = {};
  const fn = new Function("localStorage", "innerWidth", "document", MODE_SCRIPT);
  fn({ getItem: (k: string) => stored[k] ?? null }, w, {
    documentElement: {
      getAttribute: (k: string) => (k === "data-edition" ? edition : null),
      style: { setProperty: (k: string, v: string) => (props[k] = v) },
      classList: { add: (...c: string[]) => c.forEach((x) => classes.add(x)) },
    },
  });
  return { classes: [...classes], readable: props["--readable-w"] };
}

describe("reading modes", () => {
  it("the readable width is where the smallest body copy reaches the floor", () => {
    // body at 560px is 12.04px; below 560 the page zooms, so text shrinks in proportion
    expect(readableWidth(book([{}]), 11)).toBe(Math.ceil((560 * 11) / 12.04));
    // a page with smaller copy sets the width; above 560 it's found by search
    const dense = readableWidth(book([{}, { k: 0.85 }]), 11);
    expect(dense).toBeGreaterThan(560);
    expect(0.85 * dense * 0.0215).toBeGreaterThanOrEqual(11 - 0.02);
    expect(0.85 * (dense - 1) * 0.0215).toBeLessThan(11);
    // copy too small even at the widest page
    expect(readableWidth(book([{ k: 0.5 }]), 11)).toBe(Infinity);
  });

  it("picks spreads, a single page, or the feed by width alone", () => {
    expect(modeFor(1920, 556)).toBe("book");
    expect(modeFor(1366, 556)).toBe("book"); // (1366 - 140) / 2 = 613
    expect(modeFor(1280, 556)).toBe("book"); // 570 per page
    expect(modeFor(1252, 556)).toBe("book"); // 556 per page, just enough
    expect(modeFor(1250, 556)).toBe("single"); // 555 per page is too narrow
    expect(modeFor(820, 556)).toBe("single");
    expect(modeFor(690, 556)).toBe("scroll"); // 550 for one page
    expect(modeFor(SINGLE_MIN_WIDTH - 1, 300)).toBe("scroll"); // phones always
    expect(modeFor(1920, Infinity)).toBe("scroll");
  });

  it("the head script picks the same mode as the client", () => {
    for (const w of [390, 639, 640, 690, 700, 820, 1024, 1250, 1252, 1280, 1366, 1920]) {
      const r = runHead(w);
      expect(r.classes).toEqual(["js", MODE_CLASS[modeFor(w, GUESS_READABLE_WIDTH)]]);
      expect(r.readable).toBe(`${GUESS_READABLE_WIDTH}px`);
    }
  });

  it("the head script uses the readable width measured earlier, per edition", () => {
    const stored = { [readableKey("2026")]: "620" };
    const r = runHead(1366, stored);
    expect(r.classes).toContain(MODE_CLASS.single); // 613 < 620
    expect(r.readable).toBe("620px");
    expect(runHead(1366, stored, "2025").classes).toContain(MODE_CLASS.book);
    // too small to read anywhere: the feed
    expect(runHead(1920, { [readableKey("2026")]: "100000" }).classes).toContain(MODE_CLASS.scroll);
  });
});
