/**
 * The plain-text catalog (`/2026/catalog.txt`, copied to `/catalog.txt` for the
 * current edition): the whole book for a terminal, monospace, at most WIDTH
 * columns.
 *
 * Layout:
 *   - Masthead: name and year, tagline, the edition's address.
 *   - Order lines that work outside a browser (those printing {phone} or
 *     {catalog}), the episode link, and a legend from the key entries.
 *   - Groups in book order. Gifts are grouped by the section of their page;
 *     items mentioned in passing are grouped under the page that lists them
 *     ("Stocking Stuffers"), with that page's subhead.
 *   - Each item once: its name in caps with its page ref on the right, then
 *     its order lines ("SYN 000:36 – Each ...... 13.99 est.") and its buy
 *     link (or the `links.missingBuy` placeholder). Maker links are left out:
 *     some are too long for the width.
 *   - Footer: the guarantee, the affiliate disclosure, and the phone line.
 *
 * Page refs follow the order-form index: an item's own feature page when it
 * has one, otherwise the first page it appears on.
 */
import type { BookContext } from "./book";
import { formatCatalogNumber, formatPrice, resolvePrice } from "./catalog";
import { copyTokens } from "./copy";
import type { Item, Page } from "./content";
import { absoluteUrl, editionUrl } from "./urls";

/** Line width. Every line fits; only an unbreakable URL may run longer. */
export const WIDTH = 78;
const INDENT = "  ";

const len = (s: string) => [...s].length;

/** Word-wraps text to `width` columns, each line prefixed by `indent`. */
export function wrap(text: string, width = WIDTH, indent = ""): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && len(indent + line + " " + word) > width) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(indent + line);
  return lines;
}

/** Centers each wrapped line of text. */
function center(text: string, width = WIDTH): string[] {
  return wrap(text, width).map((l) => " ".repeat(Math.floor((width - len(l)) / 2)) + l);
}

/**
 * `left` and `right` joined by a fill: "left ........ right". When they don't
 * fit on one line, the left side wraps and the fill goes on its last line (or
 * a line of its own).
 */
export function leader(left: string, right: string, fill = ".", indent = "", width = WIDTH) {
  const MIN = 3;
  const room = width - len(right) - 2 - MIN;
  const lines = wrap(left, room, indent);
  const last = lines.pop() ?? indent;
  const gap = width - len(last) - len(right) - 2;
  const filler = fill === " " ? " ".repeat(gap + 2) : ` ${fill.repeat(gap)} `;
  return [...lines, `${last}${filler}${right}`];
}

/**
 * A labeled URL: on one line if it fits, else the URL on its own line below
 * (indented when that fits, flush left when not). URLs never break.
 */
function urlLines(label: string, url: string, indent: string): string[] {
  const one = `${indent}${label} ${url}`;
  if (len(one) <= WIDTH) return [one];
  const own = `${indent}${INDENT}${url}`;
  return [`${indent}${label}`, len(own) <= WIDTH ? own : url];
}

const rule = (ch: string) => ch.repeat(WIDTH);

/** A price as printed on an order line: "13.99", "13.99 est.", or the label. */
function priceText(confirmed: number | null, estimate: number | null, label: string | null) {
  const price = resolvePrice({ confirmed, estimate });
  if (price)
    return price.estimated ? `${formatPrice(price.amount)} est.` : formatPrice(price.amount);
  return label;
}

/** "SYN 000:36 – Each", or just "Each" when the catalog number isn't known yet. */
function orderLeft(timestamp: string | null, unit: string | null) {
  if (!timestamp) return unit ?? "";
  const syn = formatCatalogNumber(timestamp);
  return unit ? `${syn} – ${unit}` : syn;
}

/** An item's block: name and page ref, order lines (variants too), and links. */
function itemLines(ctx: BookContext, item: Item, home: Page): string[] {
  const { links } = ctx.content.site;
  const out = leader(item.name.toUpperCase(), ctx.book.ref(home.slug), " ");
  const ind = INDENT;

  const main = priceText(item.price.confirmed, item.price.estimate, item.price.label);
  if (main) out.push(...leader(orderLeft(item.timestamp, item.price.unit), main, ".", ind));

  // Variants, as on the page: shown unless the item is featured elsewhere.
  if (!ctx.featuredElsewhere(item, home)) {
    for (const v of item.variants) {
      const price = priceText(v.price, null, v.priceLabel);
      if (!price) continue;
      if (v.unit !== item.price.unit) {
        out.push(...wrap(`${v.name}:`, WIDTH, ind));
        out.push(...leader(orderLeft(v.timestamp, v.unit), price, ".", ind));
      } else {
        out.push(...leader(orderLeft(v.timestamp, v.name), price, ".", ind));
      }
    }
  }

  if (item.buyLink) out.push(...urlLines(`${links.buy ?? "Buy"}:`, item.buyLink, ind));
  else if (links.missingBuy) out.push(`${ind}${links.missingBuy}`);
  return out;
}

interface Group {
  title: string;
  subtitle: string | null;
  pages: string;
  items: { item: Item; home: Page }[];
}

/** A section's pages, as its divider prints them: "pages 5 A – 14 A". */
function sectionRange(ctx: BookContext, page: Page): string {
  const range = ctx.book.rangeOf(page.section.id);
  if (!range) return "";
  if (range.first === range.last) return `page ${range.first.label}`;
  return `pages ${range.first.label} – ${range.last.label}`;
}

/** Items grouped in book order, each at its index page. */
function groups(ctx: BookContext): Group[] {
  const { book } = ctx;
  const out = new Map<string, Group>();
  const seen = new Set<string>();
  for (const bookPage of book.pages) {
    const page = ctx.pageContent(bookPage.slug);
    if (!page) continue;
    for (const { item } of page.items) {
      if (seen.has(item.slug) || ctx.indexPageOf(item)?.slug !== page.slug) continue;
      seen.add(item.slug);
      const key = item.mention ? `page:${page.slug}` : `section:${page.section.id}`;
      let group = out.get(key);
      if (!group) {
        group = item.mention
          ? {
              title: page.copy.headline ? ctx.plain(page.copy.headline) : page.title,
              subtitle: page.copy.subhead ? ctx.plain(page.copy.subhead) : null,
              pages: book.ref(page.slug),
              items: [],
            }
          : { title: page.section.name, subtitle: null, pages: sectionRange(ctx, page), items: [] };
        out.set(key, group);
      }
      group.items.push({ item, home: page });
    }
  }
  return [...out.values()];
}

/** An order line as plain text: "Call any time: 1-555-SYNTAXFM". */
function orderLineText(ctx: BookContext, line: { kicker: string | null; text: string }) {
  const text = ctx.plain(line.text);
  return line.kicker ? `${ctx.plain(line.kicker)}: ${text}` : text;
}

/**
 * The catalog as an endpoint response. The static build only keeps the body;
 * public/_headers sets the same Content-Type on the deployed files.
 */
export function catalogTextResponse(ctx: BookContext): Response {
  return new Response(formatCatalogText(ctx), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** The whole plain-text catalog for an edition. */
export function formatCatalogText(ctx: BookContext): string {
  const { content, global, edition } = ctx;
  const { site } = content;
  const out: string[] = [];
  const blank = () => out.push("");

  // Masthead
  out.push(rule("="));
  blank();
  out.push(...center(`${global.name} · ${edition}`.toUpperCase()));
  if (site.cover.tagline) out.push(...center(ctx.plain(site.cover.tagline)));
  out.push(...center(absoluteUrl(editionUrl(edition))));
  blank();
  out.push(rule("="));
  blank();

  // Order lines that work from a terminal, the episode, and the legend.
  const terminalLines = site.orderLines.filter((l) =>
    copyTokens(l.text).tokens.some((t) => t.kind === "phone" || t.kind === "catalog"),
  );
  for (const line of terminalLines) out.push(...wrap(orderLineText(ctx, line)));
  const watch = site.welcome.watch.title ?? site.episode.title;
  if (site.episode.videoUrl && watch) {
    out.push(...urlLines(`${ctx.plain(watch)}:`, site.episode.videoUrl, ""));
  }
  // The key entries that mean something in plain text.
  const legend: [string, string][] = site.key.entries.flatMap((e): [string, string][] => {
    if (!e.text) return [];
    if (e.symbol === "catalog") return [[formatCatalogNumber(0), e.text]];
    if (e.symbol === "estimate") return [["est.", e.text]];
    return [];
  });
  if (legend.length) {
    if (out.at(-1) !== "") blank();
    const pad = Math.max(...legend.map(([k]) => len(k)));
    for (const [k, text] of legend) {
      const lines = wrap(ctx.plain(text), WIDTH, " ".repeat(pad + 2));
      lines[0] = `${k.padEnd(pad)}  ${lines[0]!.trimStart()}`;
      out.push(...lines);
    }
  }

  // Items, in book order.
  for (const group of groups(ctx)) {
    blank();
    out.push(rule("-"));
    out.push(...leader(group.title.toUpperCase(), group.pages, " "));
    if (group.subtitle) out.push(...wrap(group.subtitle));
    out.push(rule("-"));
    for (const { item, home } of group.items) {
      blank();
      out.push(...itemLines(ctx, item, home));
    }
  }

  // Footer
  blank();
  out.push(rule("="));
  blank();
  const guarantee = [site.guarantee.lead, site.guarantee.text].filter(Boolean);
  const footer = [
    guarantee.length ? wrap(guarantee.map((s) => ctx.plain(s)).join(" ")) : [],
    site.links.disclosure ? wrap(ctx.plain(site.links.disclosure)) : [],
    ctx.phoneLine ? center(orderLineText(ctx, ctx.phoneLine)) : [],
  ];
  for (const paragraph of footer.filter((p) => p.length)) out.push(...paragraph, "");
  out.push(rule("="));

  return out.map((l) => l.trimEnd()).join("\n") + "\n";
}
