import { describe, expect, it } from "vitest";
import { MODE_CLASS } from "../../src/lib/modes";
import {
  LAYOUTS,
  PROTO_HEAD_SCRIPT,
  layoutMode,
  parseLayout,
  type Layout,
} from "../../src/lib/proto-layout";

/** Runs the prototype head script against a fake window and returns what it set. */
function runHead(search: string, stored: string | null, w: number, h: number) {
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
  fn({ search }, { getItem: () => stored, setItem: () => {} }, w, h, {
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

  it("b shows one page when spread pages would be small", () => {
    expect(layoutMode("b", 1360, 900)).toBe("book");
    expect(layoutMode("b", 1024, 768)).toBe("single");
    expect(layoutMode("a", 1024, 768)).toBe("book");
    expect(layoutMode("e2", 1920, 1080)).toBe("scroll");
  });
});
