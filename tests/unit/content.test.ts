import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ContentError,
  createContentReader,
  itemPrice,
  pickCount,
  timestampSeconds,
} from "../../src/lib/content";

const FIXTURE = resolve(import.meta.dirname, "../fixtures");
const content = createContentReader(FIXTURE);

const temps: string[] = [];
afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A copy of the fixture project with some files replaced or added. */
function fixtureWith(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "wishbook-content-"));
  temps.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text);
  return createContentReader(dir);
}

async function problemsOf(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ContentError) return err.problems;
    throw err;
  }
  throw new Error("expected a ContentError");
}

describe("editions", () => {
  it("lists editions and the current one", () => {
    expect(content.getEditions()).toEqual([2025, 2026]);
    expect(content.getCurrentEdition()).toBe(2026);
  });

  it("rejects an unknown edition", async () => {
    await expect(content.getItems(2019)).rejects.toThrow(/Unknown edition "2019"/);
  });

  it("accepts the edition as a string (route params)", async () => {
    expect((await content.getItems("2026")).length).toBe(3);
  });
});

describe("reading an edition", () => {
  it("reads items sorted by id with relationships resolved", async () => {
    const items = await content.getItems(2026);
    expect(items.map((i) => [i.id, i.slug])).toEqual([
      [1, "cables"],
      [2, "power-bank"],
      [3, "grouse"],
    ]);
    const bank = items[1]!;
    expect(bank.section.name).toBe("Our Favorite Things");
    expect(bank.pickedBy.map((h) => h.shortName)).toEqual(["One", "Two"]);
    expect(bank.shortName).toBe("The Bank");
    expect(bank.quotes[0]).toMatchObject({ by: { slug: "scott" }, verify: true, placement: "on" });
    expect(bank.makerLink).toBe("https://example.com/power-bank");
    expect(bank.buyLink).toBeNull();
  });

  it("fills defaults for optional fields", async () => {
    const cables = await content.getItem(2026, "cables");
    expect(cables.shortName).toBe("Fixture Cables");
    expect(cables.indexName).toBe("Cables, fixture");
    expect(cables.price.unit).toBe("Each");
    expect(cables.image).toEqual({ alt: "Fixture Cables", background: "light", credit: null });
    expect(cables.makerLink).toBeNull();
    expect(await content.getItem(2026, 3)).toMatchObject({ slug: "grouse" });
  });

  it("prices: confirmed, else estimate (marked), else the label", async () => {
    const [cables, bank, grouse] = await content.getItems(2026);
    expect(itemPrice(cables!.price)).toEqual({ amount: 13.99, estimate: false });
    expect(itemPrice(bank!.price)).toEqual({ amount: 67.9, estimate: true });
    expect(itemPrice(grouse!.price)).toEqual({ label: "Price upon request" });
  });

  it("reads timestamps for items and variants", async () => {
    expect(await content.getTimestamp(2026, "cables")).toBe("0:36");
    expect(await content.getTimestamp(2026, "grouse")).toBeNull();
    expect(await content.getTimestamp(2026, "power-bank", "kit")).toBe("1:02:34");
    // A variant without its own timestamp uses the item's.
    expect(await content.getTimestamp(2026, "power-bank", "dock")).toBe("1:04");
    const bank = await content.getItem(2026, "power-bank");
    expect(bank.variants.map((v) => v.unit)).toEqual(["Each", "Kit"]);
    expect(timestampSeconds("1:02:34")).toBe(3754);
    expect(timestampSeconds("36:41")).toBe(2201);
  });

  it("reads pages in book order with items, hosts, and hotspots", async () => {
    const pages = await content.getPages(2026);
    expect(pages.map((p) => p.slug)).toEqual([
      "cover",
      "favorites",
      "one-picks",
      "power-bank",
      "centerfold",
    ]);
    const picks = pages[2]!;
    expect(picks.hosts.map((h) => h.slug)).toEqual(["wes"]);
    expect(picks.items.map((pi) => [pi.item.slug, pi.caption])).toEqual([
      ["cables", null],
      ["power-bank", "(B) The bank"],
    ]);
    expect(pages[3]).toMatchObject({ variant: "bench", inset: { art: "IMG-C1" } });
    expect(pages[4]!.centerfold.hotspots[0]).toMatchObject({ item: { id: 3 }, x: 33, y: 28 });
    expect(pages[4]!.quotes[0]).toMatchObject({ by: null, byLabel: "the crew" });
  });

  it("reads hosts in display order, sections, site, and global", async () => {
    expect((await content.getHosts(2026)).map((h) => h.slug)).toEqual(["wes", "scott"]);
    expect((await content.getSections(2026)).map((s) => s.tabLabel)).toEqual([
      "Front",
      "Favorites",
    ]);
    const site = await content.getSite(2026);
    expect(site.episode.number).toBe(999);
    expect(site.key.entries[0]!.item?.slug).toBe("cables");
    expect(site.orderLines).toEqual([{ id: "phone", kicker: "Call any time", text: "{phone}" }]);
    expect(site.meta.description).toBe("{count} gifts, fixture edition.");
    expect(site.links).toEqual({
      buy: "Buy",
      maker: null,
      missingBuy: "Buy link TBA",
      missingMaker: null,
      disclosure: "Some links pay us. See {page:one-picks}.",
    });
    expect(await content.getGlobal()).toEqual({
      name: "Fixture WishBook",
      phone: { display: "1-555-FIXTURE", tel: "+15550000000" },
      podcastUrl: null,
      youtubeUrl: null,
    });
  });

  it("reads mentions, per-page item copy, and filler pages", async () => {
    const reader = fixtureWith({
      "content/2026/items/patches.yaml":
        "name: Repair Patches\nid: 9\nsection: favorites\nmention: true\n",
      "content/2026/book.yaml": [
        readFileSync(join(FIXTURE, "content/2026/book.yaml"), "utf8").trimEnd(),
        "  - slug: stuffers",
        "    section: favorites",
        "    template: odds-ends",
        "    title: Stocking Stuffers",
        "    items:",
        "      - item: patches",
        "      - item: cables",
        "        text: The cables again. See {page:cover}.",
        "",
      ].join("\n"),
      "content/2026/site.yaml": [
        // Replace the fixture's own filler copy.
        readFileSync(join(FIXTURE, "content/2026/site.yaml"), "utf8")
          .split("\nfillers:")[0]!
          .trimEnd(),
        "fillers:",
        "  - title: Notes for Santa",
        "  - title: The Grouse Says Hi",
        "    art: IMG-S1",
        "",
      ].join("\n"),
    });
    const items = await reader.getItems(2026);
    expect(items.map((i) => [i.slug, i.mention])).toContainEqual(["patches", true]);
    expect(pickCount(items)).toBe(3);
    const stuffers = (await reader.getPages(2026)).find((p) => p.slug === "stuffers");
    expect(stuffers!.items.map((pi) => pi.text)).toEqual([
      null,
      "The cables again. See {page:cover}.",
    ]);
    expect((await reader.getSite(2026)).fillers).toEqual([
      { title: "Notes for Santa", text: null, art: null },
      { title: "The Grouse Says Hi", text: null, art: "IMG-S1" },
    ]);
  });
});

describe("edition isolation", () => {
  it("doesn't leak items, hosts, sections, or pages between editions", async () => {
    const old = await content.getEdition(2025);
    expect(old.items.map((i) => i.slug)).toEqual(["old-cable"]);
    expect(old.items[0]).toMatchObject({ id: 1, name: "Old Cable", section: { id: "oldies" } });
    expect(old.hosts.map((h) => h.name)).toEqual(["Last Year Host"]);
    expect(old.sections.map((s) => s.id)).toEqual(["front", "oldies"]);
    expect(old.pages.map((p) => p.slug)).toEqual(["cover", "oldies"]);
    expect(old.assets).toEqual([]);
    // Same id, different item in each edition.
    expect((await content.getItem(2026, 1)).name).toBe("Fixture Cables");
    await expect(content.getItem(2025, "cables")).rejects.toThrow(/no item "cables"/);
    await expect(content.getTimestamp(2025, "old-cable")).resolves.toBeNull();
  });
});

describe("validation", () => {
  it("rejects a duplicate item id", async () => {
    const reader = fixtureWith({
      "content/2026/items/copycat.yaml": "name: Copycat\nid: 2\nsection: favorites\n",
    });
    expect(await problemsOf(reader.getItems(2026))).toEqual([
      "content/2026/items/power-bank.yaml: duplicate item id 2 (also used by content/2026/items/copycat.yaml)",
    ]);
  });

  it("allows the same id in different editions", async () => {
    await expect(content.getItem(2025, 1)).resolves.toMatchObject({ slug: "old-cable" });
  });

  it("rejects relationships to missing hosts, items, and sections", async () => {
    const reader = fixtureWith({
      "content/2026/items/stray.yaml":
        "name: Stray\nid: 9\nsection: nowhere\npickedBy:\n  - nobody\nquotes:\n  - text: hi\n    by: ghost\n",
      "content/2026/book.yaml":
        "pages:\n  - slug: cover\n    section: front\n    template: cover\n    title: X\n    items:\n      - item: missing-item\n",
    });
    const problems = await problemsOf(reader.getEdition(2026));
    expect(problems).toEqual(
      expect.arrayContaining([
        'content/2026/items/stray.yaml: section "nowhere" is not in content/2026/sections.yaml',
        'content/2026/items/stray.yaml: pickedBy "nobody" is not a host in content/2026/hosts/',
        'content/2026/items/stray.yaml: quote by "ghost" is not a host in content/2026/hosts/',
        'content/2026/book.yaml pages[0] "cover": item "missing-item" is not an item in content/2026/items/',
        'content/2026/hosts/wes.yaml: picksPage "one-picks" is not a page in content/2026/book.yaml',
      ]),
    );
  });

  it("rejects bad timestamps and timestamps for unknown items or variants", async () => {
    const reader = fixtureWith({
      "content/2026/timestamps.yaml":
        'timestamps:\n  - item: cables\n    time: "0:36"\n  - item: cables\n    time: "0:40"\n  - item: power-bank\n    variant: nope\n    time: "1:00"\n',
    });
    // Keystatic's field pattern catches the format; the reader catches the rest.
    expect(await problemsOf(reader.getEdition(2026))).toEqual([
      'content/2026/timestamps.yaml: duplicate timestamp for "cables"',
      'content/2026/timestamps.yaml: "power-bank" has no variant "nope"',
    ]);
    const badFormat = fixtureWith({
      "content/2026/timestamps.yaml": 'timestamps:\n  - item: cables\n    time: "36.41"\n',
    });
    const [problem] = await problemsOf(badFormat.getEdition(2026));
    expect(problem).toMatch(/^content\/2026\/timestamps\.yaml: .*timestamps\.0\.time: Use mm:ss/s);
  });

  it("rejects unknown page references and tokens in copy", async () => {
    const reader = fixtureWith({
      "content/2026/items/grouse.yaml":
        "name: Fixture Grouse\nid: 3\nsection: favorites\ndescription: See {page:nope} and {syn:ghost} or {wat}.\n",
    });
    expect(await problemsOf(reader.getEdition(2026))).toEqual([
      "content/2026/items/grouse.yaml: description: {page:nope} is not a page in content/2026/book.yaml",
      "content/2026/items/grouse.yaml: description: {syn:ghost} is not an item in content/2026/items/",
      "content/2026/items/grouse.yaml: description: unknown token {wat}",
    ]);
  });

  it("rejects links that aren't http(s) URLs", async () => {
    const reader = fixtureWith({
      "content/2026/items/grouse.yaml":
        "name: Fixture Grouse\nid: 3\nsection: favorites\nbuyLink: not a url\n",
    });
    expect(await problemsOf(reader.getEdition(2026))).toEqual([
      'content/2026/items/grouse.yaml: buyLink "not a url" is not an http(s) URL',
    ]);
  });

  it("rejects art keys missing from the manifest", async () => {
    const reader = fixtureWith({
      "content/2026/assets.yaml": "assets: []\n",
    });
    expect(await problemsOf(reader.getEdition(2026))).toEqual([
      'content/2026/book.yaml pages[1] "favorites": art "IMG-S1" is not in content/2026/assets.yaml',
      'content/2026/book.yaml pages[3] "power-bank": art "IMG-C1" is not in content/2026/assets.yaml',
    ]);
  });

  it("rejects more items than a layout fits in its page box", async () => {
    const reader = fixtureWith({
      "content/2026/book.yaml": [
        "pages:",
        "  - slug: cover",
        "    section: front",
        "    template: cover",
        "    title: X",
        "    items:",
        "      - item: cables",
        "  - slug: one-picks",
        "    section: favorites",
        "    template: feature",
        "    title: Y",
        "    items:",
        "      - item: cables",
        "      - item: grouse",
        "",
      ].join("\n"),
    });
    expect(await problemsOf(reader.getEdition(2026))).toEqual(
      expect.arrayContaining([
        'content/2026/book.yaml pages[0] "cover": the cover layout shows no items (found 1)',
        'content/2026/book.yaml pages[1] "one-picks": the feature layout fits at most 1 item in its page box (found 2); split the page',
      ]),
    );
  });

  it("reports a missing required field with the file name", async () => {
    const reader = fixtureWith({
      "content/2026/items/grouse.yaml": "name: Fixture Grouse\nsection: favorites\n",
    });
    const [problem] = await problemsOf(reader.getEdition(2026));
    expect(problem).toMatch(/^content\/2026\/items\/grouse\.yaml: /);
  });
});
