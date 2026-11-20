import type { APIRoute } from "astro";
import { robotsTxt } from "../lib/sitemap";

/** /robots.txt: crawl everything, and here is the sitemap. */
export const GET: APIRoute = () =>
  new Response(robotsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
