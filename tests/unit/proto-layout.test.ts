import { describe, expect, it } from "vitest";
import { MODE_CLASS } from "../../src/lib/modes";
import {
  HYBRID_CACHE_KEY,
  LAYOUT_KEY,
  LAYOUTS,
  PAGE_ASPECT,
  PROTO_HEAD_SCRIPT,
  chooseTier,
  chromeFor,
  hybridCacheKey,
  layoutMode,
  parseLayout,
  type Layout,
  type PageMeasure,
} from "../../src/lib/proto-layout";

/**
 * A fake book: page text in cqi, like the real pages, so sizes scale with the
 * layout width. `fill` is the content height as a share of the page box.
 */
function book(fills: number[]) {
  return (lw: number): PageMeasure[] =>
    fills.map((fill, i) => ({
      slug: `p${i}`,
      title: `Page ${i}`,
      natural: lw * PAGE_ASPECT * fill,
      pad: 0,
      body: Math.min(15, lw * 0.0215),
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
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
      },
    },
  });
  return { layout: attrs["data-layout"], chrome: attrs["data-chrome"], classes: [...classes] };
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

  it("hybrid: the spread while every page stays readable", () => {
    const c = chooseTier(1920, 1080, book([0.8, 1, 1.2]));
    expect(c.tier).toBe(1);
    expect(c.mode).toBe("book");
    // 780px pages: body 15px (capped), the densest page scaled by 1/1.2
    expect(c.spread?.slug).toBe("p2");
    expect(c.spread?.value).toBeCloseTo(15 / 1.2, 1);
  });

  it("hybrid: one dense page drops the whole viewport to a single page", () => {
    const c = chooseTier(1920, 1080, book([0.8, 1, 1.6]));
    expect(c.tier).toBe(2);
    expect(c.mode).toBe("single");
    expect(c.spread?.slug).toBe("p2");
  });

  it("hybrid: the feed when a single page needs too many screens", () => {
    expect(chooseTier(1280, 800, book([1, 2.2])).tier).toBe(3);
    expect(chooseTier(1280, 800, book([1, 2.2]), { screens: 4 }).tier).toBe(2);
  });

  it("hybrid: the floor is tunable, and phones always scroll", () => {
    const pages = book([1, 1.3]);
    expect(chooseTier(1920, 1080, pages, { floor: 11 }).tier).toBe(1);
    expect(chooseTier(1920, 1080, pages, { floor: 12 }).tier).toBe(2);
    expect(chooseTier(600, 900, pages).mode).toBe("scroll");
  });

  it("hybrid: the frame follows the tier", () => {
    expect(chromeFor("hybrid", "book")).toBe("side");
    expect(chromeFor("hybrid", "single")).toBe("page");
    expect(chromeFor("hybrid", "scroll")).toBe("feed");
    expect(chromeFor("a", "single")).toBe("side");
  });

  it("hybrid: the head script reuses a tier decided earlier for this viewport", () => {
    const tiers = JSON.stringify({ [hybridCacheKey(1440, 900, 11, 2)]: "scroll" });
    const r = runHead("?layout=hybrid", null, 1440, 900, { [HYBRID_CACHE_KEY]: tiers });
    expect(r.classes).toContain(MODE_CLASS.scroll);
    expect(r.chrome).toBe("feed");
    // another size: the first guess
    const g = runHead("?layout=hybrid", null, 1280, 800, { [HYBRID_CACHE_KEY]: tiers });
    expect(g.classes).toContain(MODE_CLASS[layoutMode("hybrid", 1280, 800)]);
    expect(g.chrome).toBe(chromeFor("hybrid", layoutMode("hybrid", 1280, 800)));
  });

  it("b shows one page when spread pages would be small", () => {
    expect(layoutMode("b", 1360, 900)).toBe("book");
    expect(layoutMode("b", 1024, 768)).toBe("single");
    expect(layoutMode("a", 1024, 768)).toBe("book");
    expect(layoutMode("e2", 1920, 1080)).toBe("scroll");
  });
});
