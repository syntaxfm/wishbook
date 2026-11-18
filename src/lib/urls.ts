/**
 * The one place site URLs are built. Every real URL lives under its edition
 * year (/2026/…). Never hard-code a path anywhere else.
 */

export const SITE_URL = "https://wishbook.syntax.fm";

export type Edition = number | string;

const FILE_RE = /\.[a-z0-9]+$/i;

/** Joins path segments without doubled or missing slashes. */
function join(...parts: string[]): string {
  return parts
    .flatMap((p) => p.split("/"))
    .filter(Boolean)
    .join("/");
}

/**
 * Root-relative URL for a path inside an edition.
 * Directory paths always end in "/" (the site uses trailing slashes);
 * file paths (catalog.txt, og/cover.png) don't.
 *
 *   editionUrl(2026)                    → "/2026/"
 *   editionUrl(2026, "favorites/wes")   → "/2026/favorites/wes/"
 *   editionUrl(2026, "og/cover.png")    → "/2026/og/cover.png"
 */
export function editionUrl(edition: Edition, path = ""): string {
  const [pathname, query = ""] = path.split("?");
  const joined = join(String(edition), pathname ?? "");
  const url = FILE_RE.test(joined) ? `/${joined}` : `/${joined}/`;
  return query ? `${url}?${query}` : url;
}

/** Root-relative URL outside any edition (the root copies: "/", "/catalog.txt"). */
export function rootUrl(path = ""): string {
  const joined = join(path);
  if (!joined) return "/";
  return FILE_RE.test(joined) ? `/${joined}` : `/${joined}/`;
}

/** Absolute URL on the production site, for canonical, og:url, and og:image. */
export function absoluteUrl(rootRelative: string): string {
  return new URL(rootRelative, SITE_URL).href;
}

/**
 * The episode video opened at a moment (a catalog number's link).
 * Sets the `t` (seconds) query parameter, replacing any existing one.
 *
 *   videoAtTime("https://www.youtube.com/watch?v=abc", 2201) → "https://www.youtube.com/watch?v=abc&t=2201"
 */
export function videoAtTime(videoUrl: string, seconds: number): string {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new Error(`videoAtTime: "${seconds}" is not a whole number of seconds`);
  }
  const url = new URL(videoUrl);
  url.searchParams.set("t", String(seconds));
  return url.href;
}

/** The edition a root-relative pathname belongs to, or null (e.g. the bare root "/"). */
export function editionFromPath(pathname: string): string | null {
  const first = pathname.split("/").find(Boolean);
  return first && /^\d{4}$/.test(first) ? first : null;
}
