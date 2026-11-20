import { resolve } from "node:path";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import ItemLinks from "../../src/components/ItemLinks.astro";
import { createBookContext } from "../../src/lib/book";
import { createContentReader } from "../../src/lib/content";
import { paginateContent } from "../../src/lib/paginate";

// Renders the one purchase-links component against the fixture edition:
// cables has a buy link, the grouse none.
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

  it("renders nothing when the buy link is missing", async () => {
    const html = await render("grouse");
    expect(tags(html, (a) => a.tag === "a")).toEqual([]);
    expect(missing(html, "buy")).toEqual([]);
    expect(tags(html, (a) => a["data-links"] !== undefined)).toEqual([]);
    expect(html).not.toContain("Buy link");
  });

  it("keeps only the wish slot in the book when the buy link is missing", async () => {
    const item = content.items.find((i) => i.slug === "grouse")!;
    const html = await container.renderToString(ItemLinks, { props: { item, ctx, wish: true } });
    expect(tags(html, (a) => a.tag === "a")).toEqual([]);
    expect(tags(html, (a) => a["data-wish-slot"] === "3")).toHaveLength(1);
  });

  it("renders only the buy link and the wish slot", async () => {
    const item = content.items.find((i) => i.slug === "cables")!;
    const html = await container.renderToString(ItemLinks, { props: { item, ctx, wish: true } });
    expect(tags(html, (a) => a.tag === "a")).toHaveLength(1);
    expect(tags(html, (a) => a["data-wish-slot"] === "1")).toHaveLength(1);
    expect(html).not.toContain('class="sep"');
  });

  it("uses the item's own label, without sponsored for a non-affiliate link", async () => {
    const cables = content.items.find((i) => i.slug === "cables")!;
    const item = { ...cables, linkLabel: "View", affiliate: false };
    const html = await container.renderToString(ItemLinks, { props: { item, ctx } });
    expect(link(html, "buy")).toEqual([
      expect.objectContaining({
        rel: "noopener",
        "aria-label": "View Fixture Cables (opens in a new tab)",
      }),
    ]);
    expect(html).toContain("View");
  });

  it("renders no link and no placeholder for an item never sold online", async () => {
    const grouse = content.items.find((i) => i.slug === "grouse")!;
    const item = { ...grouse, noLink: true };
    const inBook = await container.renderToString(ItemLinks, { props: { item, ctx, wish: true } });
    expect(tags(inBook, (a) => a.tag === "a")).toEqual([]);
    expect(missing(inBook, "buy")).toEqual([]);
    expect(tags(inBook, (a) => a["data-wish-slot"] === "3")).toHaveLength(1);
    const elsewhere = await container.renderToString(ItemLinks, { props: { item, ctx } });
    expect(tags(elsewhere, (a) => a["data-links"] !== undefined)).toEqual([]);
  });
});
