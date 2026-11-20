import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createContentReader } from "../../src/lib/content";
import { webManifest } from "../../src/lib/icons";
import { paginateContent } from "../../src/lib/paginate";
import { editionPageUrls, robotsTxt, sitemapXml } from "../../src/lib/sitemap";

const SITE = "https://wishbook.syntax.fm";
const fixtures = createContentReader(resolve(import.meta.dirname, "../fixtures"));

describe("sitemap", () => {
  it("lists every book page at its own path, then the wish list, and no alias copies", async () => {
    const book = paginateContent(await fixtures.getEdition(2026));
    const urls = editionPageUrls(2026, book.pages);
    expect(urls).toHaveLength(book.pages.length + 1);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls[0]).toBe(`${SITE}/2026/`);
    expect(urls.at(-1)).toBe(`${SITE}/2026/wishlist/`);
    for (const url of urls) expect(url).toMatch(/^https:\/\/wishbook\.syntax\.fm\/2026\/(.+\/)?$/);
    const aliases = book.pages.flatMap((p) => (p.alias ? [`${SITE}/2026/${p.alias}/`] : []));
    const ownPaths = new Set(book.pages.map((p) => `${SITE}/2026/${p.path ? `${p.path}/` : ""}`));
    for (const alias of aliases) {
      if (!ownPaths.has(alias)) expect(urls).not.toContain(alias);
    }
  });

  it("writes a urlset with escaped locations", () => {
    const xml = sitemapXml([`${SITE}/2026/`, `${SITE}/2026/a&b/`]);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns=/);
    expect(xml).toContain(`<url><loc>${SITE}/2026/</loc></url>`);
    expect(xml).toContain(`<loc>${SITE}/2026/a&amp;b/</loc>`);
  });

  it("robots.txt allows everything and points at the sitemap", () => {
    expect(robotsTxt()).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  });
});

describe("web manifest", () => {
  it("names the WishBook, opens the edition, and lists the home-screen icons", () => {
    const manifest = webManifest("Syntax WishBook", "/2026/");
    expect(manifest).toMatchObject({ name: "Syntax WishBook", start_url: "/2026/" });
    expect(manifest.icons.map((i) => [i.src, i.sizes])).toEqual([
      ["/icon-192.png", "192x192"],
      ["/icon-512.png", "512x512"],
    ]);
  });
});
