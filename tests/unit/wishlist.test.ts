import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createBookContext } from "../../src/lib/book";
import { createContentReader } from "../../src/lib/content";
import { buildItemIndex, itemIndexJson } from "../../src/lib/item-index";
import { paginateContent } from "../../src/lib/paginate";
import { search } from "../../src/lib/search";
import { decodeWishlist, encodeWishlist, MAX_CODE_LENGTH } from "../../src/lib/wishlist-codec";

describe("wish-list codec", () => {
  it("round-trips a list", () => {
    const ids = [1, 2, 9, 17, 49, 57];
    expect(decodeWishlist(encodeWishlist(ids))).toEqual(ids);
  });

  it("encodes a known bitset as base64url without padding", () => {
    expect(encodeWishlist([1, 2, 9])).toBe("BgI");
    expect(encodeWishlist([7])).toBe("gA");
    expect(encodeWishlist([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])).toBe("__8");
    expect(encodeWishlist([47])).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("ignores order and duplicates, and decodes ascending", () => {
    expect(encodeWishlist([9, 1, 2, 9])).toBe(encodeWishlist([1, 2, 9]));
    expect(decodeWishlist(encodeWishlist([30, 3, 12]))).toEqual([3, 12, 30]);
  });

  it("round-trips every single id and every list length up to 64 ids", () => {
    for (let id = 0; id < 200; id++) expect(decodeWishlist(encodeWishlist([id]))).toEqual([id]);
    const all: number[] = [];
    for (let id = 1; id <= 64; id++) {
      all.push(id);
      expect(decodeWishlist(encodeWishlist(all))).toEqual(all);
    }
  });

  it("keeps old codes stable when new ids are added to the edition", () => {
    const code = encodeWishlist([3, 12]);
    // A later item (id 80) doesn't change how the existing list encodes.
    expect(encodeWishlist([3, 12])).toBe(code);
    expect(decodeWishlist(code)).toEqual([3, 12]);
    // A list that includes the new id still decodes the old ones.
    expect(decodeWishlist(encodeWishlist([3, 12, 80]))).toEqual([3, 12, 80]);
  });

  it("leaves removed ids for the caller to filter", () => {
    const known = new Set([3, 12]);
    const decoded = decodeWishlist(encodeWishlist([3, 5, 12]));
    expect(decoded.filter((id) => known.has(id))).toEqual([3, 12]);
  });

  it("gives an empty list for empty codes", () => {
    expect(encodeWishlist([])).toBe("");
    expect(decodeWishlist("")).toEqual([]);
    expect(decodeWishlist(null)).toEqual([]);
    expect(decodeWishlist(undefined)).toEqual([]);
    expect(decodeWishlist("AAAA")).toEqual([]);
  });

  it("gives an empty list for invalid codes", () => {
    expect(decodeWishlist("not a code!")).toEqual([]);
    expect(decodeWishlist("Bg+I")).toEqual([]);
    expect(decodeWishlist("B")).toEqual([]);
    expect(decodeWishlist("A".repeat(MAX_CODE_LENGTH + 1))).toEqual([]);
  });

  it("accepts padded codes", () => {
    expect(decodeWishlist("BgI=")).toEqual([1, 2, 9]);
  });

  it("skips ids it can't encode", () => {
    expect(encodeWishlist([-1, 1.5, Number.NaN, 2])).toBe(encodeWishlist([2]));
  });
});

describe("search", () => {
  const entries = [
    { name: "Leatherman Arc", brand: "Leatherman", pickers: ["Scott"], section: "Your Desk" },
    { name: "A Taxidermied Grouse", brand: null, pickers: ["Wes"], section: "Wild Card" },
    { name: "Silicone USB-C Cables", brand: "Anker", pickers: ["Wes"], section: "Favorites" },
    { name: "Grooming Rake", brand: null, pickers: ["CJ"], section: "Kids & Pets" },
  ];

  it("finds by name", () => {
    expect(search("grouse", entries)[0]?.name).toBe("A Taxidermied Grouse");
  });

  it("ranks name prefixes first", () => {
    expect(search("gro", entries).map((e) => e.name)).toEqual([
      "Grooming Rake",
      "A Taxidermied Grouse",
    ]);
  });

  it("matches brand, picker, and section", () => {
    expect(search("anker", entries).map((e) => e.name)).toEqual(["Silicone USB-C Cables"]);
    expect(search("wes", entries)).toHaveLength(2);
    expect(search("desk", entries)[0]?.name).toBe("Leatherman Arc");
  });

  it("matches loosely (subsequence) and needs every word", () => {
    expect(search("lthrmn", entries)[0]?.name).toBe("Leatherman Arc");
    expect(search("usb cables", entries)[0]?.name).toBe("Silicone USB-C Cables");
    expect(search("usb grouse", entries)).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    expect(search("   ", entries)).toEqual([]);
  });
});

describe("item index", async () => {
  const fixtures = createContentReader(resolve(import.meta.dirname, "../fixtures"));
  const content = await fixtures.getEdition(2026);
  const ctx = createBookContext(content, await fixtures.getGlobal(), paginateContent(content));
  const index = buildItemIndex(ctx);

  it("lists every item once with its page", () => {
    expect(index.map((i) => i.id).toSorted((a, b) => a - b)).toEqual(
      content.items.map((i) => i.id).toSorted((a, b) => a - b),
    );
    for (const entry of index) {
      const item = content.items.find((i) => i.id === entry.id)!;
      expect(entry.n).toBe(item.name);
      expect(entry.s).toBe(ctx.indexPageOf(item)?.slug);
    }
  });

  it("marks estimates and keeps labels for unpriced items", () => {
    for (const entry of index) {
      const { price } = content.items.find((i) => i.id === entry.id)!;
      expect(entry.p).toBe(price.confirmed ?? price.estimate ?? undefined);
      expect(entry.e === 1).toBe(price.confirmed === null && price.estimate !== null);
      if (entry.p === undefined) expect(entry.x).toBe(price.label ?? undefined);
    }
  });

  it("is safe to inline in a script element", () => {
    expect(itemIndexJson(ctx)).not.toContain("<");
  });
});
