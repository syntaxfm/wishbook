/**
 * Client routing table: which page of the book a pathname opens. Pure, so it
 * is unit-tested here and used by the book engine in the browser. Paths come
 * from the pages themselves (built with the URL helper), so the router never
 * builds a URL on its own.
 *
 * Only pages of the book that is loaded are routes: a link to another edition
 * (or anything else on the site) is not, and stays a normal page load.
 */

export interface Route {
  slug: string;
  /** Root-relative, year-scoped path: "/2026/favorites/wes/". */
  path: string;
  /**
   * Another path that opens the page ("/2026/favorites/" for the first page of
   * a section without a divider). The page's own path stays its address.
   */
  alias?: string;
}

const FILE_RE = /\.[a-z0-9]+$/i;

/** One spelling per path: decoded, single slashes, trailing slash on directories. */
export function normalizePath(pathname: string): string {
  let p = pathname;
  try {
    p = decodeURI(p);
  } catch {
    // keep the raw path when it isn't valid percent-encoding
  }
  p = `/${p}`.replace(/\/{2,}/g, "/").replace(/\/index\.html$/i, "/");
  if (!p.endsWith("/") && !FILE_RE.test(p)) p += "/";
  return p;
}

export class RouteTable {
  readonly #bySlug = new Map<string, string>();
  readonly #byPath = new Map<string, string>();

  /**
   * @param routes every page of the loaded book
   * @param rootSlug the page the bare "/" opens (the cover), when the loaded
   *   book is the current edition; otherwise "/" is not a route
   */
  constructor(
    routes: readonly Route[],
    readonly rootSlug: string | null = null,
  ) {
    for (const r of routes) {
      this.#bySlug.set(r.slug, normalizePath(r.path));
      this.#byPath.set(normalizePath(r.path), r.slug);
    }
    for (const r of routes) {
      const alias = r.alias && normalizePath(r.alias);
      if (alias && !this.#byPath.has(alias)) this.#byPath.set(alias, r.slug);
    }
  }

  /** The page a pathname opens, or null when it isn't a page of this book. */
  slugFor(pathname: string): string | null {
    const p = normalizePath(pathname);
    if (p === "/") return this.rootSlug;
    return this.#byPath.get(p) ?? null;
  }

  /** The year-scoped path of a page, or null for an unknown slug. */
  pathOf(slug: string): string | null {
    return this.#bySlug.get(slug) ?? null;
  }
}
