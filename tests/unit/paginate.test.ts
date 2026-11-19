import { describe, expect, it } from "vitest";
import {
  folioLabel,
  pagePath,
  paginate,
  paginateBook,
  PaginationError,
  type LogicalPage,
} from "../../src/lib/paginate";
import type { Template } from "../../src/lib/schema";

const P = (section: string, slug: string, template: Template = "grid"): LogicalPage => ({
  section,
  slug,
  template,
  title: `Title of ${slug}`,
});
const FILLERS = [{ title: "The Grouse Says Hi" }, { title: "Notes for Santa" }];
const COVER = P("front", "cover", "cover");

const rows = (book: ReturnType<typeof paginateBook>) =>
  book.pages.map((p) => [p.slug, p.n, p.side, p.kind]);

describe("paginateBook", () => {
  it("numbers pages from the cover, alone on the right, then even|odd spreads", () => {
    const book = paginateBook([COVER, P("front", "welcome"), P("front", "shoppers")], FILLERS);
    expect(rows(book)).toEqual([
      ["cover", 1, "right", "cover"],
      ["welcome", 2, "left", "page"],
      ["shoppers", 3, "right", "page"],
    ]);
    expect(book.spreads.map((s) => [s.left?.slug ?? null, s.right?.slug ?? null])).toEqual([
      [null, "cover"],
      ["welcome", "shoppers"],
    ]);
    expect(book.fillers).toBe(0);
    expect(book.pageCount).toBe(3);
  });

  it("gives the centerfold two numbers starting on an even page", () => {
    const book = paginateBook(
      [COVER, P("cf", "centerfold", "centerfold"), P("kids", "b")],
      FILLERS,
    );
    const cf = book.page("centerfold");
    expect([cf.n, cf.end, cf.side, cf.label]).toEqual([2, 3, "spread", "2–3 A"]);
    expect(book.page("b").n).toBe(4);
    expect(book.spreadOf("centerfold")).toEqual({ left: cf, right: cf });
    expect(book.ref("centerfold")).toBe("page 2–3 A");
    expect(book.fillers).toBe(0);
  });

  it("inserts a filler when the centerfold would start on an odd page", () => {
    const book = paginateBook(
      [COVER, P("kitchen", "k1"), P("cf", "centerfold", "centerfold"), P("kids", "k2")],
      FILLERS,
    );
    expect(rows(book)).toEqual([
      ["cover", 1, "right", "cover"],
      ["k1", 2, "left", "page"],
      ["the-grouse-says-hi", 3, "right", "filler"],
      ["centerfold", 4, "spread", "centerfold"],
      ["k2", 6, "left", "page"],
    ]);
    // The filler continues the section before it, and every later number moves.
    const filler = book.page("the-grouse-says-hi");
    expect([filler.section, filler.path, filler.title, filler.filler]).toEqual([
      "kitchen",
      "kitchen/the-grouse-says-hi",
      "The Grouse Says Hi",
      0,
    ]);
    expect(filler.fillerCopy).toEqual({ title: "The Grouse Says Hi", text: null, art: null });
    expect(book.ref("k2")).toBe("page 6 A");
    expect(book.fillers).toBe(1);
  });

  it("puts the back cover alone on the left, inserting a filler if needed", () => {
    const odd = paginateBook(
      [COVER, P("back", "order"), P("back", "back-cover", "back-cover")],
      FILLERS,
    );
    expect(rows(odd)).toEqual([
      ["cover", 1, "right", "cover"],
      ["order", 2, "left", "page"],
      ["the-grouse-says-hi", 3, "right", "filler"],
      ["back-cover", 4, "left", "back"],
    ]);
    expect(odd.spreads.at(-1)).toEqual({ left: odd.page("back-cover"), right: null });

    const even = paginateBook(
      [COVER, P("back", "a"), P("back", "b"), P("back", "back-cover", "back-cover")],
      FILLERS,
    );
    expect(even.page("back-cover").n).toBe(4);
    expect(even.fillers).toBe(0);
  });

  it("uses filler copy in order, repeats it, and keeps filler slugs unique", () => {
    const book = paginateBook(
      [
        COVER,
        P("a", "a1"),
        P("cf", "cf1", "centerfold"),
        P("b", "notes-for-santa"),
        P("cf", "cf2", "centerfold"),
        P("c", "c1"),
        P("back", "back-cover", "back-cover"),
      ],
      FILLERS,
    );
    const fillers = book.pages.filter((p) => p.kind === "filler");
    expect(fillers.map((f) => [f.slug, f.n, f.filler])).toEqual([
      ["the-grouse-says-hi", 3, 0],
      // "notes-for-santa" is taken by a real page.
      ["notes-for-santa-2", 7, 1],
      ["the-grouse-says-hi-2", 11, 0],
    ]);
    expect(book.page("back-cover").n).toBe(12);
    for (const p of book.pages) {
      if (p.kind === "centerfold") expect(p.n % 2).toBe(0);
      else if (p.side !== "spread") expect(p.side).toBe(p.n % 2 === 0 ? "left" : "right");
    }
  });

  it("fails clearly when a filler is needed but there is no filler copy", () => {
    expect(() =>
      paginateBook([COVER, P("back", "a"), P("back", "back-cover", "back-cover")], []),
    ).toThrow(PaginationError);
  });

  it("computes section ranges for dividers, skipping the divider itself", () => {
    const book = paginateBook(
      [COVER, P("fav", "fav", "divider"), P("fav", "wes"), P("fav", "niki"), P("tech", "t1")],
      FILLERS,
    );
    const range = book.rangeOf("fav");
    expect([range?.first.label, range?.last.label]).toEqual(["3 A", "4 A"]);
    expect(book.firstOf("fav")?.slug).toBe("fav");
    expect(book.rangeOf("nope")).toBeNull();
  });

  it("opens a section without a divider at its own path with its first page", () => {
    const book = paginateBook(
      [COVER, P("fav", "fav", "divider"), P("fav", "wes"), P("tech", "t1"), P("tech", "t2")],
      FILLERS,
    );
    expect(book.pages.map((p) => [p.slug, p.path, p.alias ?? null])).toEqual([
      ["cover", "", "front"],
      ["fav", "fav", null],
      ["wes", "fav/wes", null],
      ["t1", "tech/t1", "tech"],
      ["t2", "tech/t2", null],
    ]);
    expect(book.firstOf("tech")?.slug).toBe("t1");
    const range = book.rangeOf("tech");
    expect([range?.first.label, range?.last.label]).toEqual(["4 A", "5 A"]);
  });

  it("labels and refs pages, and throws on unknown slugs", () => {
    const book = paginateBook([COVER, P("front", "welcome")], FILLERS);
    expect(book.label("welcome")).toBe("2 A");
    expect(book.ref("welcome")).toBe("page 2 A");
    expect(() => book.ref("missing")).toThrow(PaginationError);
  });
});

describe("paths and labels", () => {
  it("builds paths: cover, divider, page", () => {
    expect(pagePath({ slug: "cover", section: "front", template: "cover" })).toBe("");
    expect(pagePath({ slug: "favorites", section: "favorites", template: "divider" })).toBe(
      "favorites",
    );
    expect(pagePath({ slug: "wes", section: "favorites", template: "grid" })).toBe("favorites/wes");
  });

  it("formats folio labels", () => {
    expect(folioLabel(6)).toBe("6 A");
    expect(folioLabel(28, 29)).toBe("28–29 A");
  });
});

describe("paginate (the 2026 edition)", () => {
  it("satisfies every placement rule", async () => {
    const book = await paginate(2026);
    expect(book.pages[0]).toMatchObject({ slug: "cover", n: 1, side: "right", path: "" });
    const cf = book.pages.find((p) => p.kind === "centerfold")!;
    expect(cf.n % 2).toBe(0);
    expect(cf.end).toBe(cf.n + 1);
    const back = book.pages.at(-1)!;
    expect(back.kind).toBe("back");
    expect(back.side).toBe("left");
    expect(book.spreads.at(-1)?.right).toBeNull();
    // Numbers are consecutive with no gaps.
    let next = 1;
    for (const p of book.pages) {
      expect(p.n).toBe(next);
      next = p.end + 1;
    }
    expect(new Set(book.pages.map((p) => p.path)).size).toBe(book.pages.length);
  });
});
