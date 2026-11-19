import { describe, expect, it } from "vitest";
import { RouteTable, normalizePath } from "../../src/lib/routes";
import { buildSpreads, spreadPages } from "../../src/lib/spreads";

const ROUTES = [
  { slug: "cover", path: "/2026/" },
  { slug: "favorites", path: "/2026/favorites/" },
  { slug: "wes", path: "/2026/favorites/wes/" },
];

const p = (slug: string, n: number, end = n) => ({ slug, n, end });

describe("normalizePath", () => {
  it("adds the trailing slash to directories only", () => {
    expect(normalizePath("/2026/favorites/wes")).toBe("/2026/favorites/wes/");
    expect(normalizePath("/2026/catalog.txt")).toBe("/2026/catalog.txt");
  });
  it("collapses slashes, drops index.html, and decodes", () => {
    expect(normalizePath("//2026//favorites/")).toBe("/2026/favorites/");
    expect(normalizePath("/2026/favorites/index.html")).toBe("/2026/favorites/");
    expect(normalizePath("/2026/caf%C3%A9/")).toBe("/2026/café/");
  });
  it("keeps invalid percent-encoding as is", () => {
    expect(normalizePath("/2026/%E0%A4%A/")).toBe("/2026/%E0%A4%A/");
  });
});

describe("RouteTable", () => {
  it("maps an edition's paths to slugs and back", () => {
    const t = new RouteTable(ROUTES);
    expect(t.slugFor("/2026/favorites/wes/")).toBe("wes");
    expect(t.slugFor("/2026/favorites/wes")).toBe("wes");
    expect(t.slugFor("/2026/")).toBe("cover");
    expect(t.pathOf("favorites")).toBe("/2026/favorites/");
    expect(t.pathOf("nope")).toBeNull();
  });
  it("never routes another edition or an unknown path", () => {
    const t = new RouteTable(ROUTES, "cover");
    expect(t.slugFor("/2025/favorites/wes/")).toBeNull();
    expect(t.slugFor("/2026/catalog.txt")).toBeNull();
    expect(t.slugFor("/favorites/wes/")).toBeNull();
  });
  it("treats the bare / as the cover only for the current edition", () => {
    expect(new RouteTable(ROUTES, "cover").slugFor("/")).toBe("cover");
    expect(new RouteTable(ROUTES).slugFor("/")).toBeNull();
  });
});

describe("buildSpreads", () => {
  const pages = [p("cover", 1), p("a", 2), p("b", 3), p("cf", 4, 5), p("c", 6), p("back", 8)];

  it("puts the cover alone on the right, then even|odd pairs, the centerfold on both sides", () => {
    const s = buildSpreads(pages).map((x) => [x.left?.slug ?? null, x.right?.slug ?? null]);
    expect(s).toEqual([
      [null, "cover"],
      ["a", "b"],
      ["cf", "cf"],
      ["c", null],
      ["back", null],
    ]);
  });
  it("lists a spread's distinct pages, left first", () => {
    const s = buildSpreads(pages);
    expect(spreadPages(s[2]!).map((x) => x.slug)).toEqual(["cf"]);
    expect(spreadPages(s[1]!).map((x) => x.slug)).toEqual(["a", "b"]);
    expect(spreadPages(s[0]!).map((x) => x.slug)).toEqual(["cover"]);
  });
  it("is empty for an empty book", () => {
    expect(buildSpreads([])).toEqual([]);
  });
});
