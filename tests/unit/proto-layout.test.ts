import { describe, expect, it } from "vitest";
import { MODE_CLASS } from "../../src/lib/modes";
import {
  HYBRID_MINW_KEY,
  LAYOUT_KEY,
  LAYOUTS,
  PAGE_ASPECT,
  PROTO_HEAD_SCRIPT,
  chromeFor,
  fitScale,
  hybridMode,
  hybridPageWidth,
  layoutMode,
  parseLayout,
  readableWidth,
  type Layout,
  type PageMeasure,
} from "../../src/lib/proto-layout";

/**
 * A fake book: page text in cqi, like the real pages, so sizes scale with the
 * layout width (`k` × the base body size). `fill` is the content height as a
 * share of the page box.
 */
function book(pages: { fill: number; k?: number }[]) {
  return (lw: number): PageMeasure[] =>
    pages.map(({ fill, k = 1 }, i) => ({
      slug: `p${i}`,
      title: `Page ${i}`,
      natural: lw * PAGE_ASPECT * fill,
      pad: 0,
      body: k * Math.min(15, lw * 0.0215),
    }));
}

/** Runs the prototype head script against a fake window and returns what it set. */
function runHead(
  search: string,
  stored: string | null,
  w: number,
  h: number,
  extra: Record<string, string> = {},
) {
  const attrs: Record<string, string> = {};
  const props: Record<string, string> = {};
  const classes = new Set<string>(["js", "m-book"]);
  const fn = new Function(
    "location",
    "localStorage",
    "innerWidth",
    "innerHeight",
    "document",
    PROTO_HEAD_SCRIPT,
  );
  const getItem = (k: string) => (k === LAYOUT_KEY ? stored : (extra[k] ?? null));
  fn({ search }, { getItem, setItem: () => {} }, w, h, {
    documentElement: {
      setAttribute: (k: string, v: string) => (attrs[k] = v),
      style: { setProperty: (k: string, v: string) => (props[k] = v) },
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
      },
    },
  });
  return {
    layout: attrs["data-layout"],
    chrome: attrs["data-chrome"],
    classes: [...classes],
    minw: props["--hy-minw"],
  };
}

describe("prototype layouts", () => {
  it("parses layout names, with e as e1", () => {
    expect(parseLayout("B")).toBe("b");
    expect(parseLayout("e")).toBe("e1");
    expect(parseLayout("z")).toBeNull();
  });

  it("the head script picks the same mode as the client", () => {
    const sizes = [
      [390, 844],
      [820, 1180],
      [1024, 768],
      [1280, 800],
      [1360, 900],
      [1920, 1080],
    ] as const;
    for (const layout of LAYOUTS) {
      for (const [w, h] of sizes) {
        const r = runHead(`?layout=${layout}`, null, w, h);
        expect(r.layout).toBe(layout);
        expect(r.classes).toContain(MODE_CLASS[layoutMode(layout as Layout, w, h)]);
        expect(r.classes.filter((c) => c.startsWith("m-"))).toHaveLength(1);
      }
    }
  });

  it("falls back to the stored layout, then the default", () => {
    expect(runHead("", "c", 1360, 900).layout).toBe("c");
    expect(runHead("", null, 1360, 900).layout).toBe("a");
  });

  it("hybrid: the readable width is where the smallest body copy reaches the floor", () => {
    // body at 560px is 12.04px; below 560 the page zooms, so text shrinks in proportion
    const r = readableWidth(book([{ fill: 1 }]), 11);
    expect(r).toBe(Math.ceil((560 * 11) / 12.04));
    // a page with smaller copy (0.9×) sets the width; above 560 it's found by search
    const dense = readableWidth(book([{ fill: 1 }, { fill: 1, k: 0.85 }]), 11);
    expect(dense).toBeGreaterThan(560);
    expect(0.85 * dense * 0.0215).toBeGreaterThanOrEqual(11 - 0.02);
    expect(0.85 * (dense - 1) * 0.0215).toBeLessThan(11);
    // copy too small even at the widest page
    expect(readableWidth(book([{ fill: 1, k: 0.5 }]), 11)).toBe(Infinity);
  });

  it("hybrid: tiers by width alone", () => {
    expect(hybridMode(1920, 556)).toBe("book");
    expect(hybridMode(1366, 556)).toBe("book"); // (1366 - 140) / 2 = 613
    expect(hybridMode(1280, 556)).toBe("book"); // 570 per page
    expect(hybridMode(1252, 556)).toBe("book"); // 556 per page, just enough
    expect(hybridMode(1250, 556)).toBe("single"); // 555 per page is too narrow
    expect(hybridMode(820, 556)).toBe("single");
    expect(hybridMode(690, 556)).toBe("scroll"); // 550 for one page
    expect(hybridMode(600, 300)).toBe("scroll"); // phones always
  });

  it("hybrid: the page box fits the window, but never below the readable width", () => {
    // fits: a's width
    expect(hybridPageWidth("book", 1600, 800, 556)).toBeCloseTo((800 - 32) / PAGE_ASPECT, 5);
    expect(hybridPageWidth("book", 1366, 768, 556)).toBeCloseTo((768 - 32) / PAGE_ASPECT, 5);
    // short window: held at the readable width (taller than the window)
    expect(hybridPageWidth("book", 1440, 600, 556)).toBe(556);
    // never wider than the room
    expect(hybridPageWidth("single", 820, 400, 556)).toBe(556);
    expect(hybridPageWidth("book", 3000, 3000, 556)).toBe(780);
  });

  it("hybrid: overflowing pages still fit down (not floored)", () => {
    const [light, dense] = book([{ fill: 0.8 }, { fill: 1.5 }])(600);
    expect(fitScale(light!, 600)).toBe(1);
    expect(fitScale(dense!, 600)).toBeCloseTo(1 / 1.5, 3);
  });

  it("hybrid: the frame follows the tier", () => {
    expect(chromeFor("hybrid", "book")).toBe("side");
    expect(chromeFor("hybrid", "single")).toBe("side");
    expect(chromeFor("hybrid", "scroll")).toBe("feed");
    expect(chromeFor("a", "single")).toBe("side");
  });

  it("hybrid: the head script uses the readable width measured earlier", () => {
    const minw = JSON.stringify({ 11: 620 });
    const r = runHead("?layout=hybrid", null, 1366, 768, { [HYBRID_MINW_KEY]: minw });
    expect(r.classes).toContain(MODE_CLASS.single); // 613 < 620
    expect(r.minw).toBe("620px");
    expect(r.chrome).toBe("side");
    const g = runHead("?layout=hybrid", null, 1366, 768);
    expect(g.classes).toContain(MODE_CLASS.book);
    expect(runHead("?layout=hybrid", null, 690, 900).chrome).toBe("feed");
  });

  it("b shows one page when spread pages would be small", () => {
    expect(layoutMode("b", 1360, 900)).toBe("book");
    expect(layoutMode("b", 1024, 768)).toBe("single");
    expect(layoutMode("a", 1024, 768)).toBe("book");
    expect(layoutMode("e2", 1920, 1080)).toBe("scroll");
  });
});
