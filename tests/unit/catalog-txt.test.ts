import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createBookContext, getBookContext } from "../../src/lib/book";
import { formatCatalogText, leader, wrap } from "../../src/lib/catalog-txt";
import { createContentReader, getCurrentEdition } from "../../src/lib/content";
import { paginateContent } from "../../src/lib/paginate";

const MAX_COLUMNS = 80;
const columns = (line: string) => [...line].length;

const fixtures = createContentReader(resolve(import.meta.dirname, "../fixtures"));

async function fixtureCatalog(edition: number) {
  const content = await fixtures.getEdition(edition);
  const ctx = createBookContext(content, await fixtures.getGlobal(), paginateContent(content));
  return formatCatalogText(ctx);
}

describe("catalog.txt helpers", () => {
  it("wraps on words", () => {
    expect(wrap("one two three four", 9, "  ")).toEqual(["  one two", "  three", "  four"]);
  });

  it("fills between left and right", () => {
    expect(leader("SYN 000:36 – Each", "13.99 est.", ".", "  ", 40)).toEqual([
      "  SYN 000:36 – Each ......... 13.99 est.",
    ]);
  });

  it("wraps a long left side and keeps the fill on its last line", () => {
    const lines = leader("a long name that will not fit", "page 6 A", " ", "", 24);
    expect(lines.at(-1)).toMatch(/ {3,}page 6 A$/);
    for (const line of lines) expect(columns(line)).toBeLessThanOrEqual(24);
  });
});

describe("catalog.txt for the fixture edition", () => {
  it("matches the snapshot", async () => {
    await expect(await fixtureCatalog(2026)).toMatchFileSnapshot(
      "__snapshots__/catalog-fixture-2026.txt",
    );
  });
});

// The fixture catalog with one item edited. A fresh reader, so the edit (made
// in place: pages hold the same item objects) doesn't leak into the shared
// fixture content.
async function withItem(slug: string, patch: Record<string, unknown>) {
  const reader = createContentReader(resolve(import.meta.dirname, "../fixtures"));
  const content = await reader.getEdition(2026);
  Object.assign(
    content.items.find((i) => i.slug === slug)!,
    patch,
  );
  const ctx = createBookContext(content, await reader.getGlobal(), paginateContent(content));
  return formatCatalogText(ctx);
}

describe("catalog.txt purchase links", () => {
  it("prints an item's own link label", async () => {
    const text = await withItem("cables", { linkLabel: "View" });
    expect(text).toContain("  View: https://example.com/buy/cables");
  });

  it("prints nothing for an item without a buy link", async () => {
    const before = await fixtureCatalog(2026);
    expect(before).not.toContain("Buy link");
    const text = await withItem("power-bank", { noLink: true });
    expect(text).toBe(before);
  });
});

describe("catalog.txt for the current edition", async () => {
  const edition = getCurrentEdition();
  const ctx = await getBookContext(edition);
  const text = formatCatalogText(ctx);
  const lines = text.split("\n");

  it(`keeps every line within ${MAX_COLUMNS} columns (a longer URL gets a line of its own)`, () => {
    // URLs never break: one longer than the width sits alone, unindented.
    const bareUrl = /^https?:\/\/\S+$/;
    const long = lines.filter((l) => columns(l) > MAX_COLUMNS && !bareUrl.test(l));
    expect(long).toEqual([]);
  });

  it("lists every placed item once, with its page ref", () => {
    for (const item of ctx.content.items) {
      const home = ctx.indexPageOf(item);
      if (!home) continue;
      const heads = lines.filter((l) => l.startsWith(`${item.name.toUpperCase()} `));
      expect(heads, item.slug).toHaveLength(1);
      expect(heads[0], item.slug).toMatch(new RegExp(`${ctx.book.ref(home.slug)}$`));
    }
  });

  it("prints prices with dot leaders and marks estimates", () => {
    expect(text).toMatch(/^ {2}SYN \d{3}:\d{2} – \S.* \.{3,} \d+\.\d{2} est\.$/m);
  });

  it("prints the curl line in the header", () => {
    const header = lines.slice(0, lines.indexOf("", 8));
    expect(header).toContain(`Order by terminal: $ curl ${ctx.catalogAddress}`);
  });

  it("ends with the back cover's order line", () => {
    const back = ctx.content.pages.find((p) => p.template === "back-cover")!;
    const line = ctx.orderLine(back.orderLine)!;
    const footer = lines.slice(-4).map((l) => l.trim());
    expect(footer).toContain(`${ctx.plain(line.kicker)} · ${ctx.plain(line.text)}`);
  });
});
