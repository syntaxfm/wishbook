import { resolve } from "node:path";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import ItemLinks from "../../src/components/ItemLinks.astro";
import { createBookContext } from "../../src/lib/book";
import { createContentReader } from "../../src/lib/content";
import { paginateContent } from "../../src/lib/paginate";

// Renders the one purchase-links component against the fixture edition:
// cables has only a buy link, the power bank only a maker link, the grouse none.
const fixtures = createContentReader(resolve(import.meta.dirname, "../fixtures"));
const content = await fixtures.getEdition(2026);
const ctx = createBookContext(content, await fixtures.getGlobal(), paginateContent(content));
const container = await AstroContainer.create();

async function render(slug: string) {
  const item = content.items.find((i) => i.slug === slug);
  if (!item) throw new Error(`no fixture item ${slug}`);
  return container.renderToString(ItemLinks, { props: { item, ctx } });
}

/** The attributes of every start tag whose own attributes match `test`. */
function tags(html: string, test: (attrs: Record<string, string>) => boolean) {
  return [...html.matchAll(/<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>/g)]
    .map((m) => ({
      tag: m[1]!,
      ...Object.fromEntries(
        [...m[2]!.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((a) => [a[1]!, a[2] ?? ""]),
      ),
    }))
    .filter((attrs) => test(attrs));
}

const link = (html: string, cls: string) =>
  tags(html, (a) => a.tag === "a" && a.class?.split(" ").includes(cls));
const missing = (html: string, what: string) => tags(html, (a) => a["data-missing"] === what);

describe("ItemLinks", () => {
  it("renders a buy link as a sponsored new-tab link", async () => {
    const html = await render("cables");
    expect(link(html, "buy")).toEqual([
      expect.objectContaining({
        href: "https://example.com/buy/cables",
        rel: "noopener sponsored",
        target: "_blank",
        "aria-label": "Buy Fixture Cables (opens in a new tab)",
      }),
    ]);
    expect(missing(html, "buy")).toEqual([]);
    expect(tags(html, (a) => a["data-links"] === "1")).toHaveLength(1);
  });

  it("renders the buy placeholder when the buy link is missing", async () => {
    const html = await render("grouse");
    expect(tags(html, (a) => a.tag === "a")).toEqual([]);
    expect(missing(html, "buy")).toHaveLength(1);
    expect(html).toContain("Buy link TBA");
    // No maker link and no maker placeholder outside dev.
    expect(missing(html, "maker")).toEqual([]);
  });

  it("renders a maker link (not sponsored) alongside the buy placeholder", async () => {
    const html = await render("power-bank");
    expect(link(html, "maker")).toEqual([
      expect.objectContaining({
        href: "https://example.com/power-bank",
        rel: "noopener",
        target: "_blank",
      }),
    ]);
    expect(link(html, "buy")).toEqual([]);
    expect(missing(html, "buy")).toHaveLength(1);
  });
});
