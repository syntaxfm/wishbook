import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createBookContext, getBookContext } from "../../src/lib/book";
import { formatCatalogText, leader, wrap } from "../../src/lib/catalog-txt";
import { createContentReader, getCurrentEdition, getGlobal } from "../../src/lib/content";
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

describe("catalog.txt for the current edition", async () => {
  const edition = getCurrentEdition();
  const ctx = await getBookContext(edition);
  const text = formatCatalogText(ctx);
  const lines = text.split("\n");

  it(`keeps every line within ${MAX_COLUMNS} columns`, () => {
    const long = lines.filter((l) => columns(l) > MAX_COLUMNS);
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

  it("prints the phone line from the global settings", async () => {
    expect(text).toContain((await getGlobal()).phone.display);
    expect(text.toLowerCase()).not.toContain("toll-free");
  });
});
