import type { APIRoute } from "astro";
import { getEditions } from "../lib/content";
import { paginate } from "../lib/paginate";
import { editionPageUrls, sitemapXml } from "../lib/sitemap";

/** /sitemap.xml: every page of every edition, at its canonical URL. */
export const GET: APIRoute = async () => {
  const urls: string[] = [];
  for (const edition of getEditions()) {
    urls.push(...editionPageUrls(edition, (await paginate(edition)).pages));
  }
  return new Response(sitemapXml(urls), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
