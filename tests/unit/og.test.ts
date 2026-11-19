import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { indexAssets, resolveFrom } from "../../src/lib/assets";
import {
  createContentReader,
  getEditions,
  getPages,
  getCurrentEdition,
} from "../../src/lib/content";
import {
  buildOgCards,
  cardHash,
  EXTRA_CARDS,
  listOgCards,
  OG_HEIGHT,
  OG_WIDTH,
  ogImageUrl,
  ogSources,
  renderOgCard,
  type OgDeps,
} from "../../src/lib/og";
import { OG_MAX_BYTES } from "../../src/lib/og-layout";
import { paginate } from "../../src/lib/paginate";
import { getStaticPaths } from "../../src/pages/[edition]/og/[slug].png";

// ---------------------------------------------------------------- real content

describe("share card routes", () => {
  it("emit a card for every page of every edition, fillers included, plus wishlist and default", async () => {
    const paths = await getStaticPaths();
    const emitted = new Set(paths.map((p) => ogImageUrl(p.params.edition, p.params.slug)));
    expect(emitted.size).toBe(paths.length);

    for (const edition of getEditions()) {
      const book = await paginate(edition);
      expect(book.pages.length).toBeGreaterThanOrEqual((await getPages(edition)).length);
      for (const page of book.pages) {
        expect(emitted, `${edition}/${page.slug}`).toContain(ogImageUrl(edition, page.slug));
      }
      for (const extra of EXTRA_CARDS) expect(emitted).toContain(ogImageUrl(edition, extra));
    }
    // The root copy shares the current edition's cover card.
    expect(emitted).toContain(ogImageUrl(getCurrentEdition(), "cover"));
  });

  it("live under the edition", () => {
    expect(ogImageUrl(2026, "cover")).toBe("/2026/og/cover.png");
  });

  it("pick a variant for each kind of page", async () => {
    const cards = await listOgCards(getCurrentEdition());
    const variant = (slug: string) => cards.find((c) => c.slug === slug)?.variant;
    expect(variant("cover")).toBe("cover");
    expect(variant("wishlist")).toBe("wishlist");
    expect(variant("default")).toBe("default");
    const variants = new Set(cards.map((c) => c.variant));
    for (const v of ["divider", "items", "feature", "centerfold", "page"])
      expect(variants).toContain(v);
  });
});

// ---------------------------------------------------------------- fixtures

const fixtures = createContentReader(resolve(import.meta.dirname, "../fixtures"));
const fixtureIndex = indexAssets(
  import.meta.glob<string>("/tests/fixtures/assets/**/*.{png,jpg,jpeg,webp,avif,svg}", {
    eager: true,
    import: "default",
  }),
  "/tests/fixtures/assets",
);
const deps: OgDeps = {
  getEdition: fixtures.getEdition,
  getGlobal: fixtures.getGlobal,
  resolveAsset: async (edition, key) => {
    const e = await fixtures.getEdition(edition);
    return resolveFrom(fixtureIndex, edition, key, {
      manifest: e.assets,
      items: e.items,
      hosts: e.hosts,
    });
  },
};

describe("share card models", () => {
  it("build one card per page with prices, letters, and placeholders", async () => {
    const cards = await listOgCards(2026, deps);
    expect(cards.map((c) => c.slug)).toEqual([
      "cover",
      "favorites",
      "one-picks",
      "power-bank",
      "notes-for-santa",
      "centerfold",
      "wishlist",
      "default",
    ]);
    expect(cards.map((c) => c.variant)).toEqual([
      "cover",
      "divider",
      "items",
      "feature",
      "page",
      "centerfold",
      "wishlist",
      "default",
    ]);
    for (const c of cards) expect(c.edition).toBe(2026);
    // Folios come from pagination; the cover carries none, the inserted filler
    // sits on the right so the centerfold opens on an even page.
    expect(cards.map((c) => [c.slug, c.folio, c.side]).slice(0, 6)).toEqual([
      ["cover", null, "right"],
      ["favorites", "2 A", "left"],
      ["one-picks", "3 A", "right"],
      ["power-bank", "4 A", "left"],
      ["notes-for-santa", "5 A", "right"],
      ["centerfold", "6–7 A", "right"],
    ]);

    const grid = cards.find((c) => c.slug === "one-picks");
    if (grid?.variant !== "items") throw new Error("expected an items card");
    expect(grid.items.map((i) => i.letter)).toEqual(["A", "B"]);
    expect(grid.items[0]!.image.kind).toBe("image");
    expect(grid.hosts.map((h) => h.shortName)).toHaveLength(1);
    for (const item of grid.items) {
      if (item.price && "whole" in item.price) {
        expect(item.price.cents).toMatch(/^\d\d$/);
      }
    }
  });

  it("take folios, sides, and filler pages from the source list", async () => {
    const { sources } = await ogSources(2026, deps);
    const section = sources[1]!.page!.section;
    const cards = await buildOgCards(
      2026,
      {
        sources: [
          { ...sources[2]!, folio: "6", side: "left" },
          {
            slug: "filler-7",
            filler: { title: "Notes for Santa", text: null, art: null, section },
            folio: "7",
          },
        ],
        pageLabel: (slug) => (slug === "one-picks" ? "page 6 A" : null),
      },
      deps,
    );
    expect(cards.map((c) => [c.slug, c.variant, c.folio, c.side])).toEqual([
      ["one-picks", "items", "6", "left"],
      ["filler-7", "page", "7", "right"],
      ["wishlist", "wishlist", null, "right"],
      ["default", "default", null, "right"],
    ]);
  });

  it("refuse a page slug that clashes with an extra card", async () => {
    const { sources } = await ogSources(2026, deps);
    await expect(
      buildOgCards(2026, { sources: [{ ...sources[0]!, slug: "wishlist" }] }, deps),
    ).rejects.toThrow(/two share cards/);
  });

  it("hash by content", async () => {
    const [cover] = await listOgCards(2026, deps);
    const a = await cardHash(cover!);
    expect(await cardHash({ ...cover! })).toBe(a);
    expect(await cardHash({ ...cover!, title: "Changed" })).not.toBe(a);
  });
});

describe("share card rendering", () => {
  it("renders every variant as a 1200×630 PNG under the size budget", async () => {
    const { sources } = await ogSources(2026, deps);
    const cards = await buildOgCards(
      2026,
      {
        sources: [
          ...sources,
          {
            slug: "filler",
            filler: { title: "Notes for Santa", text: null, art: null, section: null },
            folio: "9",
          },
        ],
      },
      deps,
    );
    for (const card of cards) {
      const png = await renderOgCard(card, { cache: false });
      const meta = await sharp(png).metadata();
      expect([card.slug, meta.format, meta.width, meta.height]).toEqual([
        card.slug,
        "png",
        OG_WIDTH,
        OG_HEIGHT,
      ]);
      expect(png.length, card.slug).toBeLessThan(OG_MAX_BYTES + 10_000);
    }
  }, 60_000);
});
