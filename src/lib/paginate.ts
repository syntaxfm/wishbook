/**
 * Pagination: turns the book order (logical pages) into numbered physical
 * pages, inserting filler pages where the placement rules need them. Page
 * numbers are never typed anywhere; folios, cross-references ("page 6 A"), and
 * divider ranges all come from here.
 *
 * Placement rules:
 *   - The cover is page 1, alone on the right.
 *   - Spreads are even (left) | odd (right).
 *   - The centerfold opens as a spread: it starts on an even page and spans two
 *     numbers.
 *   - The back cover sits alone on the left (an even page).
 * When a rule would break, a filler page is inserted before the page. Filler
 * copy comes from the edition's site settings, used in order and repeated.
 */
import { getEdition, type EditionContent } from "./content";
import type { Template } from "./schema";
import { buildSpreads, type Spread as SpreadOf } from "./spreads";
import type { Edition } from "./urls";

/** The catalog's page suffix: "6 A". */
export const PAGE_SUFFIX = "A";

export type PageKind = "cover" | "divider" | "centerfold" | "back" | "filler" | "page";

/** What pagination needs to know about a logical page. */
export interface LogicalPage {
  slug: string;
  section: string;
  template: Template;
  title: string;
}

export interface FillerCopy {
  title: string;
  /** Copy markup, if any. */
  text?: string | null;
  /** Asset key for the filler's art, if any. */
  art?: string | null;
}

export interface BookPage {
  /** First page number. */
  n: number;
  /** Last page number: n + 1 for the centerfold, otherwise n. */
  end: number;
  slug: string;
  /** Path inside the edition: "" (cover), "<section>" (divider), "<section>/<slug>". */
  path: string;
  /**
   * The section's path ("<section>"), on the first page of a section that has
   * no page there (no divider): /<year>/<section>/ opens this page too.
   */
  alias?: string;
  /** Folio label: "6 A", "28–29 A". */
  label: string;
  /** Side of the spread. The centerfold spans both. */
  side: "left" | "right" | "spread";
  section: string;
  title: string;
  kind: PageKind;
  template: Template | "filler";
  /** Fillers only: index into the edition's filler copy. */
  filler?: number;
  /** Fillers only: the filler's copy (title, text, art). */
  fillerCopy?: { title: string; text: string | null; art: string | null };
  /** Position in book order (0-based). */
  index: number;
}

export type Spread = SpreadOf<BookPage>;

export interface Book {
  /** Every page in order. The centerfold is one entry spanning two numbers. */
  pages: BookPage[];
  /** Cover alone on the right, then even|odd pairs. The centerfold fills both sides. */
  spreads: Spread[];
  /** Number of filler pages inserted. */
  fillers: number;
  /** Total page numbers used (the last folio). */
  pageCount: number;
  /** A page by slug (logical or filler). Throws if unknown. */
  page(slug: string): BookPage;
  /** Folio label for a page: "6 A". */
  label(slug: string): string;
  /** Cross-reference text: "page 6 A". */
  ref(slug: string): string;
  /** The spread a page sits in. */
  spreadOf(slug: string): Spread;
  /** The first page of a section (its divider when it has one; else the page at its alias). */
  firstOf(section: string): BookPage | undefined;
  /** First and last non-divider page of a section, for the divider's "Pages 5 A – 14 A". */
  rangeOf(section: string): { first: BookPage; last: BookPage } | null;
}

export class PaginationError extends Error {}

const KIND_BY_TEMPLATE: Partial<Record<Template, PageKind>> = {
  cover: "cover",
  divider: "divider",
  centerfold: "centerfold",
  "back-cover": "back",
};

/** Folio label for a page number or range: 6 → "6 A", 28–29 → "28–29 A". */
export function folioLabel(n: number, end = n): string {
  return end > n ? `${n}–${end} ${PAGE_SUFFIX}` : `${n} ${PAGE_SUFFIX}`;
}

/** Path of a logical page inside its edition: cover "", divider "<section>", else "<section>/<slug>". */
export function pagePath(page: { slug: string; section: string; template: Template | "filler" }) {
  if (page.template === "cover") return "";
  if (page.slug === page.section) return page.section;
  return `${page.section}/${page.slug}`;
}

const slugify = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "filler";

/** Even pages are on the left of a spread, odd pages on the right. */
const side = (num: number): "left" | "right" => (num % 2 === 0 ? "left" : "right");

/** Paginates a book order. Pure: the same input always gives the same numbers. */
export function paginateBook(
  logical: readonly LogicalPage[],
  fillerCopy: readonly FillerCopy[],
): Book {
  const pages: BookPage[] = [];
  const used = new Set(logical.map((p) => p.slug));
  let n = 1;
  let fillers = 0;

  const pushFiller = (section: string, before: string) => {
    if (fillerCopy.length === 0) {
      throw new PaginationError(
        `"${before}" needs a filler page before it, but the site settings have no filler copy`,
      );
    }
    const copyIndex = fillers % fillerCopy.length;
    const copy = fillerCopy[copyIndex]!;
    const base = slugify(copy.title);
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    pages.push({
      n,
      end: n,
      slug,
      path: `${section}/${slug}`,
      label: folioLabel(n),
      side: side(n),
      section,
      title: copy.title,
      kind: "filler",
      template: "filler",
      filler: copyIndex,
      fillerCopy: { title: copy.title, text: copy.text ?? null, art: copy.art ?? null },
      index: pages.length,
    });
    n++;
    fillers++;
  };

  for (const p of logical) {
    const kind = KIND_BY_TEMPLATE[p.template] ?? "page";
    const previousSection = pages.at(-1)?.section ?? p.section;
    // The centerfold opens as a spread and the back cover sits on the left:
    // both must start on an even page.
    if ((kind === "centerfold" || kind === "back") && n % 2 === 1) {
      pushFiller(previousSection, p.slug);
    }
    const end = kind === "centerfold" ? n + 1 : n;
    pages.push({
      n,
      end,
      slug: p.slug,
      path: pagePath(p),
      label: folioLabel(n, end),
      side: kind === "centerfold" ? "spread" : side(n),
      section: p.section,
      title: p.title,
      kind,
      template: p.template,
      index: pages.length,
    });
    n = end + 1;
  }

  // A section without a page at its own path (no divider) is opened there by
  // its first page.
  const paths = new Set(pages.map((p) => p.path));
  for (const p of pages) {
    if (p.index === pages.findIndex((q) => q.section === p.section) && !paths.has(p.section)) {
      p.alias = p.section;
      paths.add(p.section);
    }
  }

  // Spreads: page 1 alone on the right, then even|odd pairs.
  const spreads: Spread[] = buildSpreads(pages);
  const last = n - 1;

  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const page = (slug: string) => {
    const found = bySlug.get(slug);
    if (!found) throw new PaginationError(`No page "${slug}" in the book`);
    return found;
  };

  return {
    pages,
    spreads,
    fillers,
    pageCount: last,
    page,
    label: (slug) => page(slug).label,
    ref: (slug) => `page ${page(slug).label}`,
    spreadOf: (slug) => {
      const p = page(slug);
      return spreads.find((s) => s.left === p || s.right === p)!;
    },
    firstOf: (section) => pages.find((p) => p.section === section),
    rangeOf: (section) => {
      const inSection = pages.filter(
        (p) => p.section === section && p.kind !== "divider" && p.kind !== "filler",
      );
      if (inSection.length === 0) return null;
      return { first: inSection[0]!, last: inSection.at(-1)! };
    },
  };
}

const cache = new Map<string, Promise<Book>>();

/**
 * The paginated book for an edition: every physical page (logical pages plus
 * inserted fillers) with its slug, path, folio label, side, section, title,
 * and kind.
 */
export function paginate(edition: Edition): Promise<Book> {
  const key = String(edition);
  let book = cache.get(key);
  if (!book) {
    book = getEdition(edition).then(paginateContent);
    cache.set(key, book);
  }
  return book;
}

/** Paginates already-read edition content (its book order and filler copy). */
export function paginateContent({ pages, site }: Pick<EditionContent, "pages" | "site">): Book {
  return paginateBook(
    pages.map((p) => ({
      slug: p.slug,
      section: p.section.id,
      template: p.template,
      title: p.title,
    })),
    site.fillers,
  );
}
