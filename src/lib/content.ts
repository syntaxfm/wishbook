import { resolve } from "node:path";
import { createReader, type Entry } from "@keystatic/core/reader";
import { copyTokens } from "./copy";
import { readEditions } from "./editions";
import {
  createKeystaticConfig,
  TIMESTAMP_RE,
  type KeySymbol,
  type KeystaticConfig,
  type PageVariant,
  type PhotoBackground,
  type QuotePlacement,
  type Template,
} from "./schema";
import type { Edition } from "./urls";

/**
 * The build-time content reader. Reads one edition (content/<year>/…) plus
 * content/global.yaml through Keystatic's reader, resolves every reference, and
 * validates the whole edition up front. Any problem fails the build with a list
 * of file-specific errors.
 */

// ---------------------------------------------------------------- types

export interface Section {
  id: string;
  name: string;
  code: string;
  color: string;
  kicker: string | null;
  tabLabel: string;
}

export interface Host {
  slug: string;
  name: string;
  shortName: string;
  role: string;
  bio: string | null;
  /** Slug of this host's favorites page. */
  picksPage: string | null;
  order: number;
}

export interface Quote {
  text: string;
  by: Host | null;
  /** Shown instead of the host's short name ("the crew"). */
  byLabel: string | null;
  context: string | null;
  verify: boolean;
  placement: QuotePlacement;
}

export interface Price {
  confirmed: number | null;
  estimate: number | null;
  /** Shown instead of a number when neither is set ("TBA"). */
  label: string | null;
  note: string | null;
  unit: string;
}

export interface Variant {
  key: string;
  name: string;
  features: string | null;
  price: number | null;
  priceLabel: string | null;
  unit: string;
  imageSuffix: string | null;
  /** The variant's own timestamp, else the item's. */
  timestamp: string | null;
}

export interface Item {
  slug: string;
  id: number;
  name: string;
  shortName: string;
  indexName: string;
  brand: string | null;
  section: Section;
  pickedBy: Host[];
  isNew: boolean;
  /** Only mentioned in passing: not a pick, not counted in {count}. */
  mention: boolean;
  price: Price;
  buyLink: string | null;
  makerLink: string | null;
  sources: string[];
  headline: string | null;
  description: string | null;
  altDescriptions: string[];
  features: { lead: string; text: string | null }[];
  specs: string | null;
  alsoIn: string[];
  variants: Variant[];
  quotes: Quote[];
  image: { alt: string; background: PhotoBackground; credit: string | null };
  timestamp: string | null;
  internalNote: string | null;
}

export interface PageItem {
  item: Item;
  /** Photo suffix: null for the main photo, "2", "3", or "hero". */
  photo: string | null;
  caption: string | null;
  /** Copy that replaces the item description on this page. */
  text: string | null;
  badge: string | null;
  group: string | null;
}

export interface Hotspot {
  item: Item;
  x: number;
  y: number;
  label: string;
}

export interface PageCopy {
  kicker: string | null;
  headline: string | null;
  script: string | null;
  tagline: string | null;
  subhead: string | null;
  sticker: string | null;
  body: string | null;
  note: string | null;
  badge: string | null;
  meta: string | null;
  xref: string | null;
  footer: string | null;
  smallprint: string | null;
}

export interface Page {
  slug: string;
  section: Section;
  template: Template;
  variant: PageVariant;
  title: string;
  hosts: Host[];
  items: PageItem[];
  art: string | null;
  inset: { art: string | null; caption: string | null };
  copy: PageCopy;
  quotes: Quote[];
  orderLine: string | null;
  centerfold: { focal: string | null; hotspots: Hotspot[] };
}

export interface AssetEntry {
  key: string;
  file: string;
  label: string;
  color: string | null;
  aspect: string | null;
  prompt: string | null;
  sourceItem: string | null;
}

export interface Site {
  episode: { number: number | null; title: string | null; videoUrl: string | null };
  meta: { description: string | null };
  links: {
    buy: string | null;
    maker: string | null;
    missingBuy: string | null;
    missingMaker: string | null;
    disclosure: string | null;
  };
  cover: { price: string | null; tagline: string | null; note: string | null };
  welcome: {
    title: string | null;
    steps: { lead: string; text: string | null }[];
    shipLink: { badge: string | null; title: string | null; text: string | null };
    watch: { title: string | null; text: string | null };
  };
  key: {
    title: string | null;
    entries: { symbol: KeySymbol; text: string | null; item: Item | null }[];
  };
  guarantee: { lead: string | null; text: string | null };
  orderLines: { id: string; kicker: string | null; text: string }[];
  orderForm: { shareLabel: string | null; printLabel: string | null };
  wishList: {
    title: string | null;
    circle: string | null;
    circled: string | null;
    copied: string | null;
    empty: string | null;
    shared: string | null;
    add: string | null;
    added: string | null;
    start: string | null;
    unpriced: string | null;
    mailTo: string[];
  };
  search: { label: string | null; placeholder: string | null; none: string | null };
  backCover: {
    headline: string | null;
    returnAddress: string[];
    indicia: string[];
    mailingLabel: string[];
  };
  /** Copy for automatically inserted filler pages, used in order and repeated. */
  fillers: { title: string; text: string | null; art: string | null }[];
}

export interface Global {
  name: string;
  phone: { display: string; tel: string | null };
  podcastUrl: string | null;
  youtubeUrl: string | null;
}

export interface EditionContent {
  edition: number;
  site: Site;
  sections: Section[];
  hosts: Host[];
  items: Item[];
  pages: Page[];
  assets: AssetEntry[];
}

export class ContentError extends Error {
  readonly problems: string[];
  constructor(edition: number | null, problems: string[]) {
    const scope = edition === null ? "content" : `edition ${edition}`;
    super(`Invalid ${scope}:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ContentError";
    this.problems = problems;
  }
}

// ---------------------------------------------------------------- helpers

type Cfg = KeystaticConfig;
type RawItem = Entry<Cfg["collections"]["items"]>;
type RawHost = Entry<Cfg["collections"]["hosts"]>;
type RawQuote = RawItem["quotes"][number];

const opt = (s: string | null | undefined): string | null => (s && s.trim() ? s : null);
const isHttpUrl = (s: string) => /^https?:\/\/[^\s/]+\.[^\s]+$/.test(s);

/** Copy fields walked for {token} checks. Skips research, prompts, and URLs. */
const NOT_COPY = new Set([
  "prompt",
  "internalNote",
  "sources",
  "buyLink",
  "makerLink",
  "videoUrl",
  "podcastUrl",
  "youtubeUrl",
  "file",
]);

function walkStrings(value: unknown, visit: (s: string, path: string) => void, path = "") {
  if (typeof value === "string") visit(value, path);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, visit, `${path}[${i}]`));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (!NOT_COPY.has(k)) walkStrings(v, visit, path ? `${path}.${k}` : k);
    }
  }
}

/** Seconds into the episode for a validated timestamp ("36:41", "1:02:34"). */
export function timestampSeconds(time: string): number {
  return time.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** The number of gifts in an edition, as {count} renders it: items that aren't just mentions. */
export function pickCount(items: readonly Pick<Item, "mention">[]): number {
  return items.filter((i) => !i.mention).length;
}

/** The price to print: confirmed if set, else the estimate (marked), else the label. */
export function itemPrice(
  price: Pick<Price, "confirmed" | "estimate" | "label">,
): { amount: number; estimate: boolean } | { label: string | null } {
  if (price.confirmed !== null) return { amount: price.confirmed, estimate: false };
  if (price.estimate !== null) return { amount: price.estimate, estimate: true };
  return { label: price.label };
}

// ---------------------------------------------------------------- loading

async function loadEdition(root: string, edition: number): Promise<EditionContent> {
  const reader = createReader(root, createKeystaticConfig(edition));
  const dir = `content/${edition}`;
  const problems: string[] = [];
  const fail = (file: string, msg: string) => problems.push(`${file}: ${msg}`);

  // Reads one entry, turning Keystatic's field errors into a file-specific problem.
  async function read<T>(file: string, load: () => Promise<T>): Promise<T | null> {
    try {
      return await load();
    } catch (err) {
      const cause =
        err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
      fail(file, `${err instanceof Error ? err.message : String(err)}${cause}`);
      return null;
    }
  }

  const readCollection = async <T>(
    name: "items" | "hosts",
    load: (slug: string) => Promise<T | null>,
  ) => {
    const slugs = await reader.collections[name].list();
    const out: [string, T][] = [];
    for (const slug of slugs.toSorted()) {
      const file = `${dir}/${name}/${slug}.yaml`;
      const entry = await read(file, () => load(slug));
      if (entry) out.push([slug, entry]);
    }
    return out;
  };

  const [rawItems, rawHosts, rawSite, rawSections, rawBook, rawTimestamps, rawAssets] =
    await Promise.all([
      readCollection("items", (slug) => reader.collections.items.read(slug)),
      readCollection("hosts", (slug) => reader.collections.hosts.read(slug)),
      read(`${dir}/site.yaml`, () => reader.singletons.site.read()),
      read(`${dir}/sections.yaml`, () => reader.singletons.sections.read()),
      read(`${dir}/book.yaml`, () => reader.singletons.book.read()),
      read(`${dir}/timestamps.yaml`, () => reader.singletons.timestamps.read()),
      read(`${dir}/assets.yaml`, () => reader.singletons.assets.read()),
    ]);
  if (problems.length) throw new ContentError(edition, problems);
  if (!rawSite) fail(`${dir}/site.yaml`, "missing");
  if (!rawSections) fail(`${dir}/sections.yaml`, "missing");
  if (!rawBook) fail(`${dir}/book.yaml`, "missing");
  if (!rawSite || !rawSections || !rawBook) throw new ContentError(edition, problems);

  // Sections
  const sectionsFile = `${dir}/sections.yaml`;
  const sections: Section[] = rawSections.sections.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    color: s.color,
    kicker: opt(s.kicker),
    tabLabel: opt(s.tabLabel) ?? s.name,
  }));
  const sectionById = new Map<string, Section>();
  const codes = new Set<string>();
  for (const s of sections) {
    if (sectionById.has(s.id)) fail(sectionsFile, `duplicate section id "${s.id}"`);
    if (codes.has(s.code)) fail(sectionsFile, `duplicate section code "${s.code}"`);
    sectionById.set(s.id, s);
    codes.add(s.code);
  }

  // Hosts
  const hostBySlug = new Map<string, Host>();
  for (const [slug, h] of rawHosts as [string, RawHost][]) {
    hostBySlug.set(slug, {
      slug,
      name: h.name,
      shortName: h.shortName,
      role: h.role,
      bio: opt(h.bio),
      picksPage: opt(h.picksPage),
      order: h.order ?? 0,
    });
  }
  const hosts = [...hostBySlug.values()].toSorted(
    (a, b) => a.order - b.order || a.slug.localeCompare(b.slug),
  );
  const host = (file: string, slug: string, what: string): Host | null => {
    const found = hostBySlug.get(slug);
    if (!found) fail(file, `${what} "${slug}" is not a host in ${dir}/hosts/`);
    return found ?? null;
  };
  const toQuote = (file: string, q: RawQuote): Quote => ({
    text: q.text,
    by: q.by ? host(file, q.by, "quote by") : null,
    byLabel: opt(q.byLabel),
    context: opt(q.context),
    verify: q.verify,
    placement: q.placement,
  });

  // Timestamps
  const timesFile = `${dir}/timestamps.yaml`;
  const times = new Map<string, string | null>();
  const itemSlugs = new Set(rawItems.map(([slug]) => slug));
  for (const t of rawTimestamps?.timestamps ?? []) {
    const key = t.variant ? `${t.item}/${t.variant}` : t.item;
    if (!itemSlugs.has(t.item)) fail(timesFile, `"${t.item}" is not an item`);
    if (times.has(key)) fail(timesFile, `duplicate timestamp for "${key}"`);
    const time = opt(t.time);
    if (time !== null && !TIMESTAMP_RE.test(time)) {
      fail(timesFile, `"${key}" has a bad timestamp "${time}" (use mm:ss or h:mm:ss)`);
    }
    times.set(key, time);
  }

  // Items
  const items: Item[] = [];
  const itemBySlug = new Map<string, Item>();
  const fileById = new Map<number, string>();
  for (const [slug, raw] of rawItems as [string, RawItem][]) {
    const file = `${dir}/items/${slug}.yaml`;
    const other = fileById.get(raw.id);
    if (other) fail(file, `duplicate item id ${raw.id} (also used by ${other})`);
    fileById.set(raw.id, file);

    const section = sectionById.get(raw.section);
    if (!section) fail(file, `section "${raw.section}" is not in ${sectionsFile}`);
    for (const [field, url] of [
      ["buyLink", raw.buyLink],
      ["makerLink", raw.makerLink],
      ...raw.sources.map((s) => ["sources", s] as const),
    ] as const) {
      if (url && !isHttpUrl(url)) fail(file, `${field} "${url}" is not an http(s) URL`);
    }
    const variantKeys = new Set<string>();
    for (const v of raw.variants) {
      if (variantKeys.has(v.key)) fail(file, `duplicate variant key "${v.key}"`);
      variantKeys.add(v.key);
    }
    const timestamp = times.get(slug) ?? null;
    const unit = opt(raw.unit) ?? "Each";
    const item: Item = {
      slug,
      id: raw.id,
      name: raw.name,
      shortName: opt(raw.shortName) ?? raw.name,
      indexName: opt(raw.indexName) ?? raw.name,
      brand: opt(raw.brand),
      section: section ?? sections[0]!,
      pickedBy: raw.pickedBy.flatMap((h) => host(file, h, "pickedBy") ?? []),
      isNew: raw.isNew,
      mention: raw.mention,
      price: {
        confirmed: raw.priceConfirmed,
        estimate: raw.priceEstimate,
        label: opt(raw.priceLabel),
        note: opt(raw.priceNote),
        unit,
      },
      buyLink: raw.buyLink,
      makerLink: raw.makerLink,
      sources: raw.sources.filter((s): s is string => s !== null),
      headline: opt(raw.headline),
      description: opt(raw.description),
      altDescriptions: raw.altDescriptions.filter((s) => s.trim()),
      features: raw.features.map((f) => ({ lead: f.lead, text: opt(f.text) })),
      specs: opt(raw.specs),
      alsoIn: raw.alsoIn.filter((s) => s.trim()),
      variants: raw.variants.map((v) => ({
        key: v.key,
        name: v.name,
        features: opt(v.features),
        price: v.price,
        priceLabel: opt(v.priceLabel),
        unit: opt(v.unit) ?? unit,
        imageSuffix: opt(v.imageSuffix),
        timestamp: times.get(`${slug}/${v.key}`) ?? timestamp,
      })),
      quotes: raw.quotes.map((q) => toQuote(file, q)),
      image: {
        alt: opt(raw.image.alt) ?? raw.name,
        background: raw.image.background,
        credit: opt(raw.image.credit),
      },
      timestamp,
      internalNote: opt(raw.internalNote),
    };
    items.push(item);
    itemBySlug.set(slug, item);
  }
  items.sort((a, b) => a.id - b.id);
  for (const t of rawTimestamps?.timestamps ?? []) {
    const item = itemBySlug.get(t.item);
    if (item && t.variant && !item.variants.some((v) => v.key === t.variant)) {
      fail(timesFile, `"${t.item}" has no variant "${t.variant}"`);
    }
  }
  const item = (file: string, slug: string, what: string): Item | null => {
    const found = itemBySlug.get(slug);
    if (!found) fail(file, `${what} "${slug}" is not an item in ${dir}/items/`);
    return found ?? null;
  };

  // Generated-art manifest
  const assetsFile = `${dir}/assets.yaml`;
  const assets: AssetEntry[] = (rawAssets?.assets ?? []).map((a) => ({
    key: a.key,
    file: a.file,
    label: a.label,
    color: opt(a.color),
    aspect: opt(a.aspect),
    prompt: opt(a.prompt),
    sourceItem: a.sourceItem,
  }));
  const assetKeys = new Set<string>();
  for (const a of assets) {
    if (assetKeys.has(a.key)) fail(assetsFile, `duplicate asset key "${a.key}"`);
    assetKeys.add(a.key);
    if (a.sourceItem) item(assetsFile, a.sourceItem, `asset "${a.key}" sourceItem`);
  }
  // Art keys: a manifest key, item:<id>[-suffix], host:<slug>, or brand:<name>.
  const artKeyProblem = (key: string): string | null => {
    const [kind, ref = ""] = key.split(":");
    if (kind === "item") {
      const m = /^(\d+)(?:-(?:[2-9]|hero))?$/.exec(ref);
      if (!m) return `art "${key}" should be item:<id> or item:<id>-<2-9|hero>`;
      return fileById.has(Number(m[1])) ? null : `art "${key}": no item has id ${m[1]}`;
    }
    if (kind === "host") return hostBySlug.has(ref) ? null : `art "${key}": "${ref}" is not a host`;
    if (kind === "brand") return ref ? null : `art "${key}" needs a name`;
    return assetKeys.has(key) ? null : `art "${key}" is not in ${assetsFile}`;
  };

  // Site
  const siteFile = `${dir}/site.yaml`;
  const s = rawSite;
  const orderLineIds = new Set<string>();
  for (const line of s.orderLines) {
    if (orderLineIds.has(line.id)) fail(siteFile, `duplicate order line id "${line.id}"`);
    orderLineIds.add(line.id);
  }
  const site: Site = {
    episode: {
      number: s.episode.number,
      title: opt(s.episode.title),
      videoUrl: s.episode.videoUrl,
    },
    meta: { description: opt(s.meta.description) },
    links: {
      buy: opt(s.links.buy),
      maker: opt(s.links.maker),
      missingBuy: opt(s.links.missingBuy),
      missingMaker: opt(s.links.missingMaker),
      disclosure: opt(s.links.disclosure),
    },
    cover: { price: opt(s.cover.price), tagline: opt(s.cover.tagline), note: opt(s.cover.note) },
    welcome: {
      title: opt(s.welcome.title),
      steps: s.welcome.steps.map((st) => ({ lead: st.lead, text: opt(st.text) })),
      shipLink: {
        badge: opt(s.welcome.shipLink.badge),
        title: opt(s.welcome.shipLink.title),
        text: opt(s.welcome.shipLink.text),
      },
      watch: { title: opt(s.welcome.watch.title), text: opt(s.welcome.watch.text) },
    },
    key: {
      title: opt(s.key.title),
      entries: s.key.entries.map((e) => ({
        symbol: e.symbol,
        text: opt(e.text),
        item: e.item ? item(siteFile, e.item, "key example") : null,
      })),
    },
    guarantee: { lead: opt(s.guarantee.lead), text: opt(s.guarantee.text) },
    orderLines: s.orderLines.map((l) => ({ id: l.id, kicker: opt(l.kicker), text: l.text })),
    orderForm: { shareLabel: opt(s.orderForm.shareLabel), printLabel: opt(s.orderForm.printLabel) },
    wishList: {
      title: opt(s.wishList.title),
      circle: opt(s.wishList.circle),
      circled: opt(s.wishList.circled),
      copied: opt(s.wishList.copied),
      empty: opt(s.wishList.empty),
      shared: opt(s.wishList.shared),
      add: opt(s.wishList.add),
      added: opt(s.wishList.added),
      start: opt(s.wishList.start),
      unpriced: opt(s.wishList.unpriced),
      mailTo: [...s.wishList.mailTo],
    },
    search: {
      label: opt(s.search.label),
      placeholder: opt(s.search.placeholder),
      none: opt(s.search.none),
    },
    backCover: {
      headline: opt(s.backCover.headline),
      returnAddress: [...s.backCover.returnAddress],
      indicia: [...s.backCover.indicia],
      mailingLabel: [...s.backCover.mailingLabel],
    },
    fillers: s.fillers.map((f) => ({ title: f.title, text: opt(f.text), art: opt(f.art) })),
  };
  for (const [i, f] of site.fillers.entries()) {
    const problem = f.art && artKeyProblem(f.art);
    if (problem) fail(`${siteFile} fillers[${i}]`, problem);
  }

  // Book
  const bookFile = `${dir}/book.yaml`;
  const pages: Page[] = [];
  const pageSlugs = new Set<string>();
  for (const [i, p] of rawBook.pages.entries()) {
    const where = `${bookFile} pages[${i}] "${p.slug}"`;
    if (pageSlugs.has(p.slug)) fail(bookFile, `duplicate page slug "${p.slug}"`);
    pageSlugs.add(p.slug);
    const section = sectionById.get(p.section);
    if (!section) fail(where, `section "${p.section}" is not in ${sectionsFile}`);
    for (const key of [p.art, p.inset.art]) {
      const problem = opt(key) && artKeyProblem(key);
      if (problem) fail(where, problem);
    }
    if (opt(p.orderLine) && !orderLineIds.has(p.orderLine)) {
      fail(where, `order line "${p.orderLine}" is not in ${siteFile}`);
    }
    const c = p.copy;
    pages.push({
      slug: p.slug,
      section: section ?? sections[0]!,
      template: p.template,
      variant: p.variant,
      title: p.title,
      hosts: p.hosts.flatMap((h) => host(where, h, "picked by") ?? []),
      items: p.items.flatMap((pi) => {
        const found = pi.item ? item(where, pi.item, "item") : null;
        return found
          ? [
              {
                item: found,
                photo: opt(pi.photo),
                caption: opt(pi.caption),
                text: opt(pi.text),
                badge: opt(pi.badge),
                group: opt(pi.group),
              },
            ]
          : [];
      }),
      art: opt(p.art),
      inset: { art: opt(p.inset.art), caption: opt(p.inset.caption) },
      copy: {
        kicker: opt(c.kicker),
        headline: opt(c.headline),
        script: opt(c.script),
        tagline: opt(c.tagline),
        subhead: opt(c.subhead),
        sticker: opt(c.sticker),
        body: opt(c.body),
        note: opt(c.note),
        badge: opt(c.badge),
        meta: opt(c.meta),
        xref: opt(c.xref),
        footer: opt(c.footer),
        smallprint: opt(c.smallprint),
      },
      quotes: p.quotes.map((q) => toQuote(where, q)),
      orderLine: opt(p.orderLine),
      centerfold: {
        focal: opt(p.centerfold.focal),
        hotspots: p.centerfold.hotspots.flatMap((h) => {
          const found = h.item ? item(where, h.item, "hotspot item") : null;
          return found
            ? [{ item: found, x: h.x ?? 0, y: h.y ?? 0, label: opt(h.label) ?? found.name }]
            : [];
        }),
      },
    });
  }
  for (const h of hosts) {
    if (h.picksPage && !pageSlugs.has(h.picksPage)) {
      fail(
        `${dir}/hosts/${h.slug}.yaml`,
        `picksPage "${h.picksPage}" is not a page in ${bookFile}`,
      );
    }
  }

  // {tokens} in copy must point at real pages and items.
  const checkCopy = (file: string, value: unknown) =>
    walkStrings(value, (text, path) => {
      const { tokens, errors } = copyTokens(text);
      for (const token of tokens) {
        if (token.kind === "page" && !pageSlugs.has(token.slug)) {
          fail(file, `${path}: {page:${token.slug}} is not a page in ${bookFile}`);
        }
        if (token.kind === "syn" && !itemSlugs.has(token.slug)) {
          fail(file, `${path}: {syn:${token.slug}} is not an item in ${dir}/items/`);
        }
      }
      for (const error of errors) fail(file, `${path}: ${error}`);
    });
  checkCopy(siteFile, rawSite);
  checkCopy(sectionsFile, rawSections);
  checkCopy(bookFile, rawBook);
  for (const [slug, raw] of rawItems) checkCopy(`${dir}/items/${slug}.yaml`, raw);
  for (const [slug, raw] of rawHosts) checkCopy(`${dir}/hosts/${slug}.yaml`, raw);

  if (problems.length) throw new ContentError(edition, problems);
  return { edition, site, sections, hosts, items, pages, assets };
}

async function loadGlobal(root: string, edition: number): Promise<Global> {
  const file = "content/global.yaml";
  let raw;
  try {
    raw = await createReader(root, createKeystaticConfig(edition)).singletons.global.read();
  } catch (err) {
    const cause =
      err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
    throw new ContentError(null, [`${file}: ${err instanceof Error ? err.message : err}${cause}`]);
  }
  if (!raw) throw new ContentError(null, [`${file}: missing`]);
  return {
    name: raw.name,
    phone: { display: raw.phone.display, tel: opt(raw.phone.tel) },
    podcastUrl: raw.podcastUrl,
    youtubeUrl: raw.youtubeUrl,
  };
}

// ---------------------------------------------------------------- API

export interface ContentReader {
  /** Every edition that builds, oldest first as listed. */
  getEditions(): number[];
  /** The edition served at the root and edited in Keystatic. */
  getCurrentEdition(): number;
  /** The whole validated edition. */
  getEdition(edition: Edition): Promise<EditionContent>;
  getGlobal(): Promise<Global>;
  getSite(edition: Edition): Promise<Site>;
  getSections(edition: Edition): Promise<Section[]>;
  getHosts(edition: Edition): Promise<Host[]>;
  /** Items sorted by id. */
  getItems(edition: Edition): Promise<Item[]>;
  /** One item by slug or id. Throws if it doesn't exist. */
  getItem(edition: Edition, slugOrId: string | number): Promise<Item>;
  /** Pages in book order (without computed fillers). */
  getPages(edition: Edition): Promise<Page[]>;
  getAssetManifest(edition: Edition): Promise<AssetEntry[]>;
  /** An item's (or variant's) timestamp, or null if not set yet. */
  getTimestamp(edition: Edition, itemSlug: string, variant?: string): Promise<string | null>;
}

/** A reader rooted at a project directory (tests point this at fixtures). */
export function createContentReader(root: string = process.cwd()): ContentReader {
  const editionCache = new Map<number, Promise<EditionContent>>();
  let globalCache: Promise<Global> | undefined;

  const editionsFile = () => readEditions(resolve(root, "content/editions.yaml"));
  const year = (edition: Edition): number => {
    const n = Number(edition);
    const { editions } = editionsFile();
    if (!editions.includes(n)) {
      throw new Error(
        `Unknown edition "${edition}" (content/editions.yaml lists ${editions.join(", ")})`,
      );
    }
    return n;
  };
  const getEdition = (edition: Edition) => {
    const n = year(edition);
    let cached = editionCache.get(n);
    if (!cached) {
      cached = loadEdition(root, n);
      editionCache.set(n, cached);
    }
    return cached;
  };

  return {
    getEditions: () => editionsFile().editions,
    getCurrentEdition: () => editionsFile().current,
    getEdition,
    getGlobal: () => (globalCache ??= loadGlobal(root, editionsFile().current)),
    getSite: async (e) => (await getEdition(e)).site,
    getSections: async (e) => (await getEdition(e)).sections,
    getHosts: async (e) => (await getEdition(e)).hosts,
    getItems: async (e) => (await getEdition(e)).items,
    getItem: async (e, slugOrId) => {
      const { items, edition } = await getEdition(e);
      const found = items.find((i) => (typeof slugOrId === "number" ? i.id : i.slug) === slugOrId);
      if (!found) throw new Error(`Edition ${edition} has no item "${slugOrId}"`);
      return found;
    },
    getPages: async (e) => (await getEdition(e)).pages,
    getAssetManifest: async (e) => (await getEdition(e)).assets,
    getTimestamp: async (e, itemSlug, variant) => {
      const { items, edition } = await getEdition(e);
      const found = items.find((i) => i.slug === itemSlug);
      if (!found) throw new Error(`Edition ${edition} has no item "${itemSlug}"`);
      if (!variant) return found.timestamp;
      const v = found.variants.find((x) => x.key === variant);
      if (!v) throw new Error(`Item "${itemSlug}" has no variant "${variant}"`);
      return v.timestamp;
    },
  };
}

const content = createContentReader();

export const {
  getEditions,
  getCurrentEdition,
  getEdition,
  getGlobal,
  getSite,
  getSections,
  getHosts,
  getItems,
  getItem,
  getPages,
  getAssetManifest,
  getTimestamp,
} = content;
