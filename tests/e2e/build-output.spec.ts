import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test } from "@playwright/test";

// The e2e web server runs `pnpm build` first, so dist/ is fresh.
const DIST = resolve(import.meta.dirname, "../../dist");
const SITE = "https://wishbook.syntax.fm";
const read = (path: string) => readFileSync(join(DIST, path), "utf8");

const attr = (html: string, re: RegExp) => re.exec(html)?.[1] ?? null;
const meta = (html: string, key: string) =>
  attr(html, new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
const canonical = (html: string) => attr(html, /<link rel="canonical" href="([^"]*)"/);
const title = (html: string) => attr(html, /<title>([^<]*)<\/title>/);
const decode = (s: string) =>
  s.replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", '"');

/** Every file in dist/, as paths relative to it. */
const distFiles = () =>
  readdirSync(DIST, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(DIST, join(e.parentPath, e.name)));

/** Every page in the book, from the cover file's data attributes. */
function bookPages() {
  const html = read("2026/index.html");
  return [
    ...html.matchAll(
      /data-slug="([^"]+)" data-n="(\d+)"[^>]*?data-path="([^"]+)"[^>]*?data-title="([^"]*)"/g,
    ),
  ].map((m) => ({ slug: m[1]!, n: Number(m[2]), path: m[3]!, title: decode(m[4]!) }));
}

test("every page has its own static file with year-scoped meta", () => {
  const pages = bookPages();
  expect(pages.length).toBeGreaterThan(30);
  for (const page of pages) {
    const file = join(page.path.slice(1), "index.html");
    expect(existsSync(join(DIST, file)), file).toBe(true);
    const html = read(file);
    const url = `${SITE}${page.path}`;
    expect(canonical(html), file).toBe(url);
    expect(meta(html, "og:url"), file).toBe(url);
    expect(meta(html, "og:image"), file).toBe(`${SITE}/2026/og/${page.slug}.png`);
    // …and that share card was emitted.
    expect(existsSync(join(DIST, "2026/og", `${page.slug}.png`)), file).toBe(true);
    expect(decode(meta(html, "og:title") ?? ""), file).toBe(decode(title(html) ?? ""));
    expect(meta(html, "description"), file).toBeTruthy();
    expect(meta(html, "og:description"), file).toBe(meta(html, "description"));
    expect(decode(title(html) ?? ""), file).toContain(
      page.slug === "cover" ? "WishBook" : page.title,
    );
    // Opened at its own page.
    expect(html).toMatch(new RegExp(`class="[^"]*is-current[^"]*"[^>]*data-slug="${page.slug}"`));
    // The whole book is in every file.
    expect(html.match(/data-slug="/g)?.length, file).toBe(pages.length);
  }
});

test("page numbers are consecutive, with the cover on 1", () => {
  const pages = bookPages();
  expect(pages[0]).toMatchObject({ slug: "cover", n: 1, path: "/2026/" });
  const ns = pages.map((p) => p.n);
  for (let i = 1; i < ns.length; i++) expect(ns[i]! - ns[i - 1]!).toBeGreaterThanOrEqual(1);
});

test("the root copy renders the cover with a canonical of /2026/", () => {
  const root = read("index.html");
  const edition = read("2026/index.html");
  expect(canonical(root)).toBe(`${SITE}/2026/`);
  expect(meta(root, "og:url")).toBe(`${SITE}/2026/`);
  expect(meta(root, "og:image")).toBe(`${SITE}/2026/og/cover.png`);
  expect(root).toMatch(/class="[^"]*is-current[^"]*"[^>]*data-slug="cover"/);
  expect(title(root)).toBe(title(edition));
  // It is the /2026/ cover file, byte for byte.
  expect(root).toBe(edition);
});

test("every site URL (links, meta, OG, share paths, sitemaps) is year-scoped", () => {
  // Root copies are the only year-less files; nothing links to them.
  const files = distFiles().filter((f) => /\.(html|xml|txt)$/.test(f));
  expect(files).toContain("2026/wishlist/index.html");
  let checked = 0;
  const bad: string[] = [];
  for (const file of files) {
    const text = read(file);
    const paths = [
      // Root-relative attribute values: href, src, data-path, data-share-path, …
      ...[...text.matchAll(/\s[\w:-]+="(\/[^"]*)"/g)].map((m) => m[1]!),
      ...[...text.matchAll(/\ssrcset="([^"]*)"/g)].flatMap((m) =>
        m[1]!.split(",").map((s) => s.trim().split(/\s+/)[0]!),
      ),
      // Absolute URLs on the site's own origin: canonical, og:url, og:image, catalog.txt…
      ...[...text.matchAll(/https?:\/\/wishbook\.syntax\.fm(\/[^\s"'<>)]*)?/g)].map(
        (m) => m[1] ?? "/",
      ),
    ].filter((u) => u.startsWith("/") && !u.startsWith("//"));
    if (file.endsWith(".html")) expect(paths.length, file).toBeGreaterThan(0);
    bad.push(...paths.filter((u) => !/^\/(2026\/|_astro\/)/.test(u)).map((u) => `${file}: ${u}`));
    checked += paths.length;
  }
  expect(bad).toEqual([]);
  expect(checked).toBeGreaterThan(1000);
});

test("pages load no resources from other origins", () => {
  const remote = /^(https?:)?\/\//;
  const bad: string[] = [];
  for (const file of distFiles().filter((f) => f.endsWith(".html"))) {
    const html = read(file);
    // Anything the browser fetches by itself: src, srcset, poster, <link href>, CSS url().
    const resources = [
      ...[...html.matchAll(/\s(?:src|poster|data-src)="([^"]*)"/g)].map((m) => m[1]!),
      ...[...html.matchAll(/\ssrcset="([^"]*)"/g)].flatMap((m) =>
        m[1]!.split(",").map((s) => s.trim().split(/\s+/)[0]!),
      ),
      ...[...html.matchAll(/<link\b[^>]*\shref="([^"]*)"/g)]
        .filter((m) => !/rel="canonical"/.test(m[0]))
        .map((m) => m[1]!),
      ...[...html.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]!),
    ];
    bad.push(...resources.filter((r) => remote.test(r)).map((r) => `${file}: ${r}`));
  }
  for (const file of distFiles().filter((f) => f.endsWith(".css"))) {
    for (const m of read(file).matchAll(/(?:url\(\s*["']?|@import\s+["'])([^"')]+)/g)) {
      if (remote.test(m[1]!)) bad.push(`${file}: ${m[1]}`);
    }
  }
  expect(bad).toEqual([]);
});

test("catalog.txt is a plain-text catalog, copied to the root", async ({ request }) => {
  const edition = read("2026/catalog.txt");
  expect(read("catalog.txt")).toBe(edition);
  expect(edition).toMatch(/ \.{3,} \d+\.\d{2}( est\.)?$/m);
  expect(edition).toContain("SYN ");
  for (const line of edition.split("\n")) expect([...line].length, line).toBeLessThanOrEqual(80);
  // Served as-is, no redirect, from the root.
  const res = await request.get("/catalog.txt", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe(edition);
  // The deployed Content-Type comes from _headers.
  expect(read("_headers")).toMatch(
    /^\/\*\/catalog\.txt\n\s+Content-Type: text\/plain; charset=utf-8$/m,
  );
});

test("_redirects sends year-less section paths to the current edition", () => {
  const rules = read("_redirects")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/));
  const sections = new Set(
    bookPages()
      .map((p) => p.path.split("/")[2]!)
      .filter(Boolean),
  );
  for (const s of sections) expect(rules).toContainEqual([`/${s}/*`, `/2026/${s}/:splat`, "302"]);
});
