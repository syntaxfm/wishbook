/**
 * Everything a page template needs about its edition, computed once: the
 * validated content, the paginated book, and helpers for links, labels, order
 * lines, and quotes. Templates take this as `ctx`.
 */
import { resolveAsset, type ResolvedAsset } from "./assets";
import { copyTokens, parseCopyRuns } from "./copy";
import {
  getEdition,
  getGlobal,
  pickCount,
  type EditionContent,
  type Global,
  type Host,
  type Item,
  type Page,
  type Quote,
} from "./content";
import { formatCatalogNumber } from "./catalog";
import { paginate, type Book, type BookPage } from "./paginate";
import type { Template } from "./schema";
import { absoluteUrl, editionUrl, rootUrl, type Edition } from "./urls";

/** Templates where one item gets the whole page. */
const FEATURE_TEMPLATES: ReadonlySet<Template> = new Set([
  "feature",
  "brand-feature",
  "luxury",
  "house-brand",
  "actual-size",
]);

/**
 * Feature templates that show the item's own quotes. Brand features and the
 * luxury page carry a page quote instead, so the item's quotes stay with its
 * photos elsewhere.
 */
const QUOTE_TEMPLATES: ReadonlySet<Template> = new Set(["feature", "house-brand", "actual-size"]);

export interface OrderLine {
  id: string;
  kicker: string | null;
  text: string;
}

export interface BookContext {
  edition: number;
  content: EditionContent;
  global: Global;
  book: Book;
  /** Gifts in the edition ({count}). */
  count: number;
  /** "wishbook.syntax.fm/catalog.txt", for the curl order line. */
  catalogAddress: string;
  /** Logical page content by slug (fillers have none). */
  pageContent(slug: string): Page | undefined;
  item(slug: string): Item;
  /** Root-relative URL of a page in this edition. */
  href(slug: string): string;
  /** An order line by id. */
  orderLine(id: string | null): OrderLine | null;
  /** The order line that prints the phone number. */
  phoneLine: OrderLine | null;
  /** The page that gives an item a page of its own, if any. */
  featurePageOf(item: Item): Page | null;
  /** Where the index sends an item: its feature page, else its first appearance. */
  indexPageOf(item: Item): Page | null;
  /** True when the item has a page of its own other than this one (its variants live there). */
  featuredElsewhere(item: Item, page: Page): boolean;
  /** True when another page features the item with its quotes. */
  quotedElsewhere(item: Item, page: Page): boolean;
  /** An item's photo: main, extra ("2", "3"), or art ("hero"). */
  itemImage(item: Item, suffix?: string | null): Promise<ResolvedAsset>;
  /** Generated art (or any asset key). */
  art(key: string): Promise<ResolvedAsset>;
  /** Alt text for generated art: its manifest title. */
  artAlt(key: string): string;
  /** A host's photo (or placeholder). */
  avatar(host: Host): Promise<ResolvedAsset>;
  /** "Wes", "Wes, on the UV light", "the crew". */
  quoteBy(quote: Quote): string;
  /** Copy as plain text, tokens resolved (meta tags, alt text). */
  plain(text: string | null | undefined): string;
  /** A page's document title: the WishBook's name on the cover, else "<title> · <name>". */
  docTitle(slug: string): string;
  /** A section's display name ("" if unknown). */
  sectionName(id: string): string;
}

const cache = new Map<string, Promise<BookContext>>();

async function build(edition: Edition): Promise<BookContext> {
  const [content, global, book] = await Promise.all([
    getEdition(edition),
    getGlobal(),
    paginate(edition),
  ]);
  return createBookContext(content, global, book);
}

/** The context for already-loaded content (tests pass fixture content here). */
export function createBookContext(
  content: EditionContent,
  global: Global,
  book: Book,
): BookContext {
  const pages = new Map(content.pages.map((p) => [p.slug, p]));
  const items = new Map(content.items.map((i) => [i.slug, i]));
  const count = pickCount(content.items);
  const catalogAddress = absoluteUrl(rootUrl("catalog.txt")).replace(/^https?:\/\//, "");

  const featurePage = new Map<string, Page>();
  const firstPage = new Map<string, Page>();
  for (const p of content.pages) {
    for (const { item } of p.items) {
      if (!firstPage.has(item.slug)) firstPage.set(item.slug, p);
      if (
        FEATURE_TEMPLATES.has(p.template) &&
        p.items.length === 1 &&
        !featurePage.has(item.slug)
      ) {
        featurePage.set(item.slug, p);
      }
    }
  }

  const item = (slug: string) => {
    const found = items.get(slug);
    if (!found) throw new Error(`Edition ${content.edition} has no item "${slug}"`);
    return found;
  };
  const avatars = new Map<string, Promise<ResolvedAsset>>();

  const ctx: BookContext = {
    edition: content.edition,
    content,
    global,
    book,
    count,
    catalogAddress,
    pageContent: (slug) => pages.get(slug),
    item,
    href: (slug) => editionUrl(content.edition, book.page(slug).path),
    docTitle: (slug) => {
      const p = book.page(slug);
      return p.kind === "cover" ? global.name : `${p.title} · ${global.name}`;
    },
    sectionName: (id) => content.sections.find((s) => s.id === id)?.name ?? "",
    orderLine: (id) => (id ? (content.site.orderLines.find((l) => l.id === id) ?? null) : null),
    phoneLine:
      content.site.orderLines.find((l) =>
        copyTokens(l.text).tokens.some((t) => t.kind === "phone"),
      ) ?? null,
    featurePageOf: (i) => featurePage.get(i.slug) ?? null,
    indexPageOf: (i) => featurePage.get(i.slug) ?? firstPage.get(i.slug) ?? null,
    featuredElsewhere: (i, page) => {
      const f = featurePage.get(i.slug);
      return f !== undefined && f.slug !== page.slug;
    },
    quotedElsewhere: (i, page) => {
      const f = featurePage.get(i.slug);
      return f !== undefined && f.slug !== page.slug && QUOTE_TEMPLATES.has(f.template);
    },
    itemImage: (i, suffix) =>
      resolveAsset(content.edition, suffix ? `item:${i.id}-${suffix}` : `item:${i.id}`),
    art: (key) => resolveAsset(content.edition, key),
    artAlt: (key) => {
      const entry = content.assets.find((a) => a.key === key);
      if (entry) return entry.label.replace(/^[^:]{1,20}:\s*/, "");
      const [kind, ref = ""] = key.split(":");
      if (kind === "host") return content.hosts.find((h) => h.slug === ref)?.name ?? "";
      return "";
    },
    avatar: (host) => {
      let found = avatars.get(host.slug);
      if (!found) {
        found = resolveAsset(content.edition, `host:${host.slug}`);
        avatars.set(host.slug, found);
      }
      return found;
    },
    quoteBy: (q) => {
      const who = q.byLabel ?? q.by?.shortName ?? "";
      return q.context ? `${who}, ${q.context}` : who;
    },
    plain: (text) => {
      if (!text) return "";
      return parseCopyRuns(text)
        .map((run) => {
          switch (run.kind) {
            case "text":
              return run.text;
            case "page":
              return book.ref(run.slug);
            case "syn": {
              const t = item(run.slug).timestamp;
              return t ? formatCatalogNumber(t) : "";
            }
            case "count":
              return String(count);
            case "phone":
              return global.phone.display;
            case "catalog":
              return catalogAddress;
          }
        })
        .join("");
    },
  };
  return ctx;
}

/** The shared context for an edition's templates (cached). */
export function getBookContext(edition: Edition): Promise<BookContext> {
  const key = String(edition);
  let ctx = cache.get(key);
  if (!ctx) {
    ctx = build(edition);
    cache.set(key, ctx);
  }
  return ctx;
}

export type { BookPage };
