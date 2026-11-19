import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveAsset, type ResolvedAsset } from "./assets";
import { formatCatalogNumber, splitPrice } from "./catalog";
import {
  getEdition,
  getGlobal,
  itemPrice,
  pickCount,
  type EditionContent,
  type Global,
  type Host,
  type Item,
  type Page,
  type Section,
} from "./content";
import { parseCopy } from "./copy";
import { cardElement, OG_HEIGHT, OG_WIDTH, renderPng } from "./og-layout";
import { paginateContent } from "./paginate";
import { absoluteUrl, editionUrl, SITE_URL, type Edition } from "./urls";

/**
 * Share cards: a crafted 1200×630 image per page, rendered at build time with
 * Satori (layout → SVG) and resvg (SVG → PNG), then finished with the baked
 * paper textures.
 *
 * This module turns content into plain, serializable card models (one per
 * page, plus the wish list and default cards). og-layout.ts draws them.
 *
 * The cards a build emits come from `ogSources()`: one per physical page of the
 * paginated book (fillers included), with folios.
 */

export { OG_HEIGHT, OG_WIDTH };

// ---------------------------------------------------------------- sources

/** Copy for a page that has no content of its own (an inserted filler). */
export interface OgFiller {
  title: string;
  text: string | null;
  /** Asset key for the filler's art, if any. */
  art: string | null;
  section: Section | null;
}

/** One page that gets a card. Exactly one of `page` or `filler` is set. */
export interface OgSource {
  /** Card file name: /<edition>/og/<slug>.png */
  slug: string;
  page?: Page;
  filler?: OgFiller;
  /** Printed page label for the folio ("6", "6 A"). Omitted: no folio. */
  folio?: string | null;
  /** Binding side: left pages get a green folio, right pages a yellow one. */
  side?: "left" | "right";
}

export interface OgSourceList {
  sources: OgSource[];
  /** The printed label for a page reference ("page 6 A"); null if unknown. */
  pageLabel?: (slug: string) => string | null;
}

/**
 * The pages that get a card, in book order: every physical page of the
 * paginated book, including inserted fillers, with its folio and binding side.
 * The cover and back cover carry no folio.
 */
export async function ogSources(
  edition: Edition,
  deps: OgDeps = defaultDeps,
): Promise<OgSourceList> {
  const content = await deps.getEdition(edition);
  const book = paginateContent(content);
  const pages = new Map(content.pages.map((p) => [p.slug, p]));
  const sections = new Map(content.sections.map((s) => [s.id, s]));
  const sources = book.pages.map((bp): OgSource => {
    const base = {
      slug: bp.slug,
      folio: bp.kind === "cover" || bp.kind === "back" ? null : bp.label,
      side: bp.side === "left" ? ("left" as const) : ("right" as const),
    };
    const page = pages.get(bp.slug);
    if (page) return { ...base, page };
    const copy = bp.fillerCopy ?? { title: bp.title, text: null, art: null };
    return { ...base, filler: { ...copy, section: sections.get(bp.section) ?? null } };
  });
  const slugs = new Set(book.pages.map((p) => p.slug));
  return {
    sources,
    pageLabel: (slug) => (slugs.has(slug) ? book.ref(slug) : null),
  };
}

/** Card slugs that aren't pages. A page can't use these. */
export const EXTRA_CARDS = ["wishlist", "default"] as const;

// ---------------------------------------------------------------- models

export type OgImage =
  /** `file` is root-relative to the project ("/assets/2026/items/…"). */
  | { kind: "image"; file: string; dark: boolean }
  | { kind: "placeholder"; label: string; color: string };

export type OgPrice =
  | { whole: string; cents: string; estimate: boolean; unit: string }
  | { label: string };

export interface OgItem {
  letter: string;
  name: string;
  brand: string | null;
  price: OgPrice | null;
  image: OgImage;
}

export interface OgHost {
  name: string;
  shortName: string;
  image: OgImage;
}

export interface OgSection {
  name: string;
  tabLabel: string;
  color: string;
  kicker: string | null;
}

/** A run of copy: plain, bold, or italic. */
export interface OgRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type OgPanel =
  | { kind: "hosts"; hosts: OgHost[] }
  | { kind: "steps"; steps: OgRun[][] }
  | { kind: "art"; art: OgImage; caption: string | null }
  | { kind: "items"; items: OgItem[] }
  | { kind: "none" };

interface CardBase {
  slug: string;
  edition: number;
  /** The page's own title (also the card's alt text). */
  title: string;
  folio: string | null;
  side: "left" | "right";
  section: OgSection | null;
  /** Masthead details shared by every card. */
  brand: { site: string };
}

export type OgCard = CardBase &
  (
    | {
        variant: "cover";
        art: OgImage;
        price: string | null;
        tagline: string | null;
        note: string | null;
        call: { kicker: string | null; text: string } | null;
      }
    | {
        variant: "divider";
        art: OgImage;
        inset: OgImage | null;
        count: number;
        pages: string[];
      }
    | {
        variant: "items";
        kicker: string | null;
        items: OgItem[];
        /** Items on the page beyond the ones listed. */
        more: number;
        hosts: OgHost[];
      }
    | {
        variant: "feature";
        headline: string;
        body: OgRun[] | null;
        item: OgItem;
        hosts: OgHost[];
        stage: "holiday" | "bench";
      }
    | {
        variant: "centerfold";
        kicker: string | null;
        subhead: string | null;
        art: OgImage;
        focal: { x: number; y: number };
        hotspots: { n: number; x: number; y: number; label: string }[];
      }
    | { variant: "page"; kicker: string | null; subtitle: string | null; panel: OgPanel }
    | { variant: "wishlist"; items: OgItem[]; count: number }
    | { variant: "default"; tagline: string | null; count: number; items: OgItem[] }
  );

export type OgVariant = OgCard["variant"];

// ---------------------------------------------------------------- building

export interface OgDeps {
  getEdition(edition: Edition): Promise<EditionContent>;
  getGlobal(): Promise<Global>;
  resolveAsset(edition: Edition, key: string): Promise<ResolvedAsset<unknown>>;
}

const defaultDeps: OgDeps = { getEdition, getGlobal, resolveAsset };

/** Pages drawn as a single big product, when they show exactly one item. */
const FEATURE_TEMPLATES = new Set([
  "feature",
  "brand-feature",
  "luxury",
  "house-brand",
  "actual-size",
]);
/** Item rows listed on an item card. */
const MAX_ROWS = 5;
const letterFor = (i: number) => String.fromCodePoint(65 + i);

/** The first `max` items, those with real photos ahead of placeholders. */
const pickPhotos = <T extends { image: OgImage }>(items: T[], max: number) =>
  [
    ...items.filter((i) => i.image.kind === "image"),
    ...items.filter((i) => i.image.kind !== "image"),
  ].slice(0, max);

function ogPrice(item: Item): OgPrice | null {
  const p = itemPrice(item.price);
  if ("amount" in p)
    return { ...splitPrice(p.amount), estimate: p.estimate, unit: item.price.unit };
  return p.label ? { label: p.label } : null;
}

function ogSection(s: Section): OgSection {
  return { name: s.name, tabLabel: s.tabLabel, color: s.color, kicker: s.kicker };
}

/** Every card model for an edition: one per page from `ogSources()`, plus the extras. */
export async function listOgCards(edition: Edition, deps: OgDeps = defaultDeps): Promise<OgCard[]> {
  return buildOgCards(edition, await ogSources(edition, deps), deps);
}

/** Card models for a list of sources, plus the wish list and default cards. */
export async function buildOgCards(
  edition: Edition,
  { sources, pageLabel }: OgSourceList,
  deps: OgDeps = defaultDeps,
): Promise<OgCard[]> {
  const content = await deps.getEdition(edition);
  const global = await deps.getGlobal();
  const year = content.edition;
  const count = pickCount(content.items);

  const image = async (key: string | null, dark = false): Promise<OgImage | null> => {
    if (!key) return null;
    const found = await deps.resolveAsset(year, key);
    return found.kind === "image"
      ? { kind: "image", file: found.file, dark }
      : { kind: "placeholder", label: found.label, color: found.color };
  };
  const art = async (key: string | null, fallback: string, color: string) =>
    (await image(key)) ?? { kind: "placeholder" as const, label: fallback, color };

  const itemImage = async (item: Item, photo: string | null = null) =>
    (await image(
      photo ? `item:${item.id}-${photo}` : `item:${item.id}`,
      item.image.background === "dark",
    ))!;

  const ogItem = async (
    item: Item,
    letter: string,
    photo: string | null = null,
  ): Promise<OgItem> => ({
    letter,
    name: item.shortName,
    brand: item.brand,
    price: ogPrice(item),
    image: await itemImage(item, photo),
  });

  const ogHost = async (h: Host): Promise<OgHost> => ({
    name: h.name,
    shortName: h.shortName,
    image: (await image(`host:${h.slug}`))!,
  });

  // Copy as plain runs. Page references render as their printed label when
  // known; a run that can't be resolved makes the whole string unusable (null).
  const runs = (text: string | null): OgRun[] | null => {
    if (!text) return null;
    const out: OgRun[] = [];
    for (const seg of parseCopy(text)) {
      switch (seg.kind) {
        case "text":
          out.push({ text: seg.text });
          break;
        case "bold":
          out.push({ text: seg.text, bold: true });
          break;
        case "italic":
          out.push({ text: seg.text, italic: true });
          break;
        case "count":
          out.push({ text: String(count) });
          break;
        case "phone":
          out.push({ text: global.phone.display });
          break;
        case "catalog":
          out.push({
            text: absoluteUrl(editionUrl(year, "catalog.txt")).replace(/^https?:\/\//, ""),
          });
          break;
        case "syn": {
          const ts = content.items.find((i) => i.slug === seg.slug)?.timestamp;
          if (!ts) return null;
          out.push({ text: formatCatalogNumber(ts) });
          break;
        }
        case "page": {
          const label = pageLabel?.(seg.slug);
          if (!label) return null;
          out.push({ text: label });
          break;
        }
      }
    }
    return out;
  };
  const plain = (text: string | null) =>
    runs(text)
      ?.map((r) => r.text)
      .join("") ?? null;

  // A sample of the edition's gifts, for cards that aren't about one page.
  const sampleItems = async (max: number) => {
    const picks = content.items.filter((i) => !i.mention);
    const all = await Promise.all(picks.map((item, i) => ogItem(item, letterFor(i % 26))));
    return pickPhotos(all, max).map((it, i) => ({ ...it, letter: letterFor(i) }));
  };

  const brand = { site: new URL(SITE_URL).host };
  const base = (src: OgSource, title: string, section: Section | null): CardBase => ({
    slug: src.slug,
    edition: year,
    title,
    folio: src.folio ?? null,
    side: src.side ?? "right",
    section: section && section.id !== "front" && section.id !== "back" ? ogSection(section) : null,
    brand,
  });

  const pageCard = async (src: OgSource, page: Page): Promise<OgCard> => {
    const b = base(src, page.title, page.section);
    const items = await Promise.all(
      page.items.map((pi, i) => ogItem(pi.item, letterFor(i), pi.photo)),
    );
    const hosts = await Promise.all(page.hosts.map(ogHost));

    switch (page.template) {
      case "cover": {
        const line = content.site.orderLines.find((l) => l.id === page.orderLine);
        const lineText = line ? plain(line.text) : null;
        return {
          ...b,
          section: null,
          variant: "cover",
          art: await art(page.art, page.title, "#14204a"),
          price: content.site.cover.price,
          tagline: content.site.cover.tagline,
          note: plain(content.site.cover.note) ?? `${count} gifts`,
          call: lineText ? { kicker: line?.kicker ?? null, text: lineText } : null,
        };
      }
      case "divider": {
        const sectionPages = content.pages.filter(
          (p) => p.section.id === page.section.id && p.slug !== page.slug,
        );
        const gifts = new Set(
          sectionPages.flatMap((p) =>
            p.items.filter((i) => !i.item.mention).map((i) => i.item.slug),
          ),
        );
        return {
          ...b,
          variant: "divider",
          art: await art(page.art, page.section.name, page.section.color),
          inset: await image(page.inset.art),
          count: gifts.size,
          pages: sectionPages.map((p) => p.title),
        };
      }
      case "centerfold": {
        const [fx = 50, fy = 50] = (page.centerfold.focal ?? "50% 50%")
          .split(/\s+/)
          .map((v) => Number.parseFloat(v));
        return {
          ...b,
          variant: "centerfold",
          kicker: plain(page.copy.kicker),
          subhead: plain(page.copy.subhead),
          art: await art(page.art, page.title, page.section.color),
          focal: { x: fx, y: fy },
          hotspots: page.centerfold.hotspots.map((h, i) => ({
            n: i + 1,
            x: h.x,
            y: h.y,
            label: h.label,
          })),
        };
      }
      case "welcome":
        return {
          ...b,
          title: plain(page.copy.headline) ?? page.title,
          variant: "page",
          kicker: page.title,
          subtitle: content.site.welcome.title,
          panel: {
            kind: "steps",
            steps: content.site.welcome.steps.map((s): OgRun[] => {
              const text = runs(s.text);
              return [{ text: s.lead, bold: true }, ...(text ? [{ text: " " }, ...text] : [])];
            }),
          },
        };
      case "shoppers":
        return {
          ...b,
          variant: "page",
          kicker: plain(page.copy.kicker),
          subtitle: null,
          panel: { kind: "hosts", hosts: await Promise.all(content.hosts.map(ogHost)) },
        };
      case "index":
        return {
          ...b,
          variant: "page",
          kicker: null,
          subtitle: null,
          panel: { kind: "items", items: await sampleItems(6) },
        };
      case "order-form":
        return {
          ...b,
          variant: "page",
          kicker: null,
          subtitle: content.site.orderForm.shareLabel,
          panel: { kind: "items", items: await sampleItems(6) },
        };
      case "back-cover": {
        const inset = await image(page.inset.art ?? page.art);
        return {
          ...b,
          title: content.site.backCover.headline ?? page.title,
          variant: "page",
          kicker: null,
          subtitle: content.site.backCover.returnAddress.join(" · ") || null,
          panel: inset ? { kind: "art", art: inset, caption: null } : { kind: "none" },
        };
      }
    }

    if (items.length === 1 && FEATURE_TEMPLATES.has(page.template)) {
      const [item] = items as [OgItem];
      const pi = page.items[0]!;
      const body = runs(pi.text ?? page.copy.body);
      return {
        ...b,
        variant: "feature",
        headline: plain(page.copy.headline) ?? page.title,
        body:
          body && page.copy.body && !pi.text
            ? [{ text: pi.item.shortName, bold: true }, { text: " " }, ...body]
            : body,
        item,
        hosts,
        stage:
          page.variant !== "bench" && item.image.kind === "image" && item.image.dark
            ? "holiday"
            : "bench",
      };
    }

    if (items.length > 0) {
      return {
        ...b,
        variant: "items",
        kicker: plain(page.copy.kicker) ?? plain(page.copy.tagline),
        items,
        more: Math.max(0, items.length - MAX_ROWS),
        hosts,
      };
    }

    return {
      ...b,
      variant: "page",
      kicker: plain(page.copy.kicker),
      subtitle: plain(page.copy.subhead),
      panel: { kind: "none" },
    };
  };

  const fillerCard = async (src: OgSource, filler: OgFiller): Promise<OgCard> => {
    const filled = await image(filler.art);
    return {
      ...base(src, filler.title, filler.section),
      variant: "page",
      kicker: null,
      subtitle: plain(filler.text),
      panel: filled
        ? { kind: "art", art: filled, caption: null }
        : { kind: "items", items: await sampleItems(6) },
    };
  };

  const cards: OgCard[] = [];
  for (const src of sources) {
    if (src.page) cards.push(await pageCard(src, src.page));
    else if (src.filler) cards.push(await fillerCard(src, src.filler));
    else throw new Error(`Share card "${src.slug}" has neither a page nor filler copy`);
  }

  const extra = { slug: "", folio: null, side: "right" as const };
  cards.push({
    ...base({ ...extra, slug: "wishlist" }, "My Wish List", null),
    variant: "wishlist",
    items: await sampleItems(3),
    count,
  });
  cards.push({
    ...base({ ...extra, slug: "default" }, global.name, null),
    variant: "default",
    tagline: content.site.cover.tagline,
    count,
    items: await sampleItems(5),
  });

  const seen = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.slug)) {
      throw new Error(
        `Edition ${year}: two share cards are named "${c.slug}" (page slugs can't be ${EXTRA_CARDS.join(" or ")})`,
      );
    }
    seen.add(c.slug);
  }
  return cards;
}

/** The root-relative URL of a card: /2026/og/<slug>.png */
export function ogImageUrl(edition: Edition, slug: string): string {
  return editionUrl(edition, `og/${slug}.png`);
}

// ---------------------------------------------------------------- rendering

const CACHE_DIR = resolve(process.cwd(), "node_modules/.cache/wishbook-og");
/** Files whose changes invalidate every cached card. */
const RENDER_SOURCES = ["src/lib/og.ts", "src/lib/og-layout.ts", "package.json"];

let sourceHash: Promise<string> | undefined;
function getSourceHash() {
  sourceHash ??= (async () => {
    const h = createHash("sha256");
    for (const file of RENDER_SOURCES) {
      h.update(await readFile(resolve(process.cwd(), file)).catch(() => Buffer.from(file)));
    }
    return h.digest("hex");
  })();
  return sourceHash;
}

function imageFiles(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const v of value) imageFiles(v, out);
  else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.kind === "image" && typeof o.file === "string") out.add(o.file);
    for (const v of Object.values(o)) imageFiles(v, out);
  }
  return out;
}

/** A key that changes whenever the card's content, its images, or the renderer change. */
export async function cardHash(card: OgCard): Promise<string> {
  const h = createHash("sha256");
  h.update(await getSourceHash());
  h.update(JSON.stringify(card));
  for (const file of [...imageFiles(card)].toSorted()) {
    const s = await stat(resolve(process.cwd(), `.${file}`));
    h.update(`${file}:${s.size}:${s.mtimeMs}`);
  }
  return h.digest("hex").slice(0, 32);
}

/**
 * Renders a card to PNG bytes. Rendered cards are cached on disk by content
 * hash (node_modules/.cache), so unchanged cards are free on the next build.
 */
export async function renderOgCard(card: OgCard, { cache = true } = {}): Promise<Buffer> {
  const key = cache ? await cardHash(card) : null;
  const cached = key ? resolve(CACHE_DIR, `${key}.png`) : null;
  if (cached) {
    const hit = await readFile(cached).catch(() => null);
    if (hit) return hit;
  }
  const png = await renderPng(await cardElement(card), card);
  if (cached) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cached, png);
  }
  return png;
}
