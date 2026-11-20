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

test("every section path opens the section's first page, canonical at that page", () => {
  const pages = bookPages();
  const sectionOf = new Map(
    [...read("2026/index.html").matchAll(/data-slug="([^"]+)"[^>]*?data-section="([^"]+)"/g)].map(
      (m) => [m[1]!, m[2]!],
    ),
  );
  const sections = [...new Set(pages.map((p) => sectionOf.get(p.slug)!))];
  expect(sections.length).toBeGreaterThan(5);
  for (const section of sections) {
    const file = join("2026", section, "index.html");
    expect(existsSync(join(DIST, file)), file).toBe(true);
    const first = pages.find((p) => sectionOf.get(p.slug) === section)!;
    const html = read(file);
    expect(canonical(html), file).toBe(`${SITE}${first.path}`);
    expect(meta(html, "og:url"), file).toBe(`${SITE}${first.path}`);
    expect(html).toMatch(new RegExp(`class="[^"]*is-current[^"]*"[^>]*data-slug="${first.slug}"`));
    // Unless it is that page's own path (a divider, the centerfold), the
    // section path is the page's alias, so the engine routes it.
    if (first.path !== `/2026/${section}/`) {
      expect(html).toContain(`data-path="${first.path}" data-alias="/2026/${section}/"`);
    }
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

/**
 * Site-wide root files that may be linked without a year, like /_astro/ assets:
 * the icons and manifest (every document's head) and the sitemap (robots.txt).
 */
const SITE_FILES = new Set([
  "/favicon.ico",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/site.webmanifest",
  "/sitemap.xml",
]);

test("every site URL (links, meta, OG, share paths, sitemaps) is year-scoped", () => {
  // Root copies are the only year-less pages; nothing links to them.
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
    bad.push(
      ...paths
        .filter((u) => !/^\/(2026\/|_astro\/)/.test(u) && !SITE_FILES.has(u))
        .map((u) => `${file}: ${u}`),
    );
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
  // URLs never break: one longer than 80 columns sits alone on its own line.
  for (const line of edition.split("\n")) {
    if (/^https?:\/\/\S+$/.test(line)) continue;
    expect([...line].length, line).toBeLessThanOrEqual(80);
  }
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

/** A PNG's width and height, from its IHDR chunk. */
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

test("the icons and manifest are built, and every document's head links them", () => {
  // favicon.ico: PNG-in-ICO at 16, 32, and 48 px.
  const ico = readFileSync(join(DIST, "favicon.ico"));
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const entry = 6 + i * 16;
    const png = ico.subarray(ico.readUInt32LE(entry + 12));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(pngSize(png)).toEqual([ico[entry], ico[entry + 1]]);
    return ico[entry];
  });
  expect(sizes).toEqual([16, 32, 48]);
  expect(pngSize(readFileSync(join(DIST, "favicon-32.png")))).toEqual([32, 32]);
  expect(pngSize(readFileSync(join(DIST, "apple-touch-icon.png")))).toEqual([180, 180]);
  const manifest = JSON.parse(read("site.webmanifest"));
  expect(manifest.name).toBe("Syntax WishBook");
  expect(manifest.start_url).toBe("/2026/");
  for (const icon of manifest.icons) {
    const [w, h] = icon.sizes.split("x").map(Number);
    expect(pngSize(readFileSync(join(DIST, icon.src.slice(1))))).toEqual([w, h]);
  }

  const documents = distFiles().filter((f) => f.endsWith(".html"));
  expect(documents).toEqual(expect.arrayContaining(["404.html", "2026/wishlist/index.html"]));
  for (const file of documents) {
    const head = read(file).split("</head>")[0]!;
    expect(head, file).toMatch(/<link rel="icon" href="\/favicon\.ico"/);
    expect(head, file).toMatch(/<link rel="icon" href="\/favicon-32\.png" type="image\/png"/);
    expect(head, file).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(head, file).toContain('<link rel="manifest" href="/site.webmanifest"');
    expect(head, file).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}"/);
  }
  // Cached for a day, not the HTML's five minutes.
  expect(read("_headers")).toMatch(
    /^\/favicon\.ico\n\s+! Cache-Control\n\s+Cache-Control: public, max-age=86400$/m,
  );
});

test("404.html is a standalone, unindexed page that links back into the edition", async ({
  request,
}) => {
  const html = read("404.html");
  expect(title(html)).toBe("Page Not Found · Syntax WishBook");
  expect(meta(html, "robots")).toBe("noindex");
  expect(html).not.toContain("<script");
  expect(html).not.toContain('class="book');
  expect(html).toContain('href="/2026/"');
  // One link per section tab, at the section's first page.
  const tabs = [
    ...read("2026/index.html")
      .split('<nav class="tabs"')[1]!
      .split("</nav>")[0]!
      .matchAll(/href="([^"]+)"/g),
  ].map((m) => m[1]!);
  expect(tabs.length).toBeGreaterThan(3);
  for (const href of tabs) expect(html).toContain(`href="${href}"`);
  // Served for a missing path, with a 404 status.
  const res = await request.get("/2026/no-such-page/", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  expect(await res.text()).toContain("Page Not Found");
});

for (const width of [390, 820, 1440]) {
  test(`the 404 page fits ${width}px without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto("/no/such/page/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page Not Found");
    await expect(page.locator("img.nf-mascot")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the Cover" })).toHaveAttribute(
      "href",
      "/2026/",
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await context.close();
  });
}

test("the sitemap lists every built page once, at its canonical URL", () => {
  const xml = read("sitemap.xml");
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(new Set(listed).size).toBe(listed.length);
  // Every HTML file under an edition, by its canonical: section copies and the
  // pages they copy collapse into one URL.
  const canonicals = new Set(
    distFiles()
      .filter((f) => /^\d{4}\/.*index\.html$/.test(f))
      .map((f) => canonical(read(f))!),
  );
  expect(listed.toSorted()).toEqual([...canonicals].toSorted());
  for (const url of listed) {
    expect(url).toMatch(/^https:\/\/wishbook\.syntax\.fm\/\d{4}\//);
    const file = join(new URL(url).pathname.slice(1), "index.html");
    expect(canonical(read(file)), file).toBe(url);
  }
  // Every page of the book, and only pages (no root copies, 404, cards, catalog).
  for (const page of bookPages()) expect(listed).toContain(`${SITE}${page.path}`);
  expect(listed).toContain(`${SITE}/2026/wishlist/`);
  expect(listed.filter((u) => !u.endsWith("/"))).toEqual([]);
});

test("robots.txt allows crawling and points at the sitemap", () => {
  expect(read("robots.txt")).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
});
