/**
 * robots.txt and sitemap.xml, written at build. The sitemap lists every real
 * page of every edition at its canonical URL (absolute, year-scoped): each
 * book page at its own path, then the edition's wish-list page. Never the root
 * copies (/, /catalog.txt), a section path that only copies its first page,
 * share cards, or the 404 page.
 */
import type { BookPage } from "./paginate";
import { absoluteUrl, editionUrl, rootUrl, type Edition } from "./urls";

/** Every canonical page URL of one edition, in book order, then its wish list. */
export function editionPageUrls(edition: Edition, pages: readonly Pick<BookPage, "path">[]) {
  return [
    ...pages.map((p) => absoluteUrl(editionUrl(edition, p.path))),
    absoluteUrl(editionUrl(edition, "wishlist")),
  ];
}

const escapeXml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** A sitemap of the given absolute URLs. */
export function sitemapXml(urls: readonly string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

/** robots.txt: everything may be crawled; the sitemap lists the pages. */
export function robotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${absoluteUrl(rootUrl("sitemap.xml"))}`,
    "",
  ].join("\n");
}
