import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * The centerfold template, against the fixture edition.
 *
 * The 2026 book has no centerfold, but the template and its engine support
 * (hotspots, the legend, fade turns, the phone swipe strip) stay for future
 * editions. This builds the fixture content (tests/fixtures: its 2026 edition
 * has a three-hotspot centerfold) as a site of its own in a temporary
 * directory, serves its dist/ on a free port, and checks the centerfold there.
 * The real content and dist/ are never touched.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const FIXTURES = join(ROOT, "tests/fixtures");
const PROJECT_FILES = [
  "astro.config.mjs",
  "keystatic.config.ts",
  "package.json",
  "tsconfig.json",
  "src",
  "public",
];
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

/** The centerfold in the live book: it fits, its legend isn't cut, and no hotspot hides under it. */
function measure(page: Page) {
  return page.evaluate(() => {
    const cf = document.querySelector<HTMLElement>(".cf-page.is-current")!;
    const legend = cf.querySelector<HTMLElement>(".cf-legend")!;
    const lr = legend.getBoundingClientRect();
    const covered = [...cf.querySelectorAll<HTMLElement>(".hot")]
      .filter((h) => {
        const r = h.getBoundingClientRect();
        return r.right > lr.left && r.left < lr.right && r.bottom > lr.top && r.top < lr.bottom;
      })
      .map((h) => h.dataset.i);
    const content = cf.querySelector<HTMLElement>(":scope > .cf")!.getBoundingClientRect();
    const box = cf.getBoundingClientRect();
    return {
      fit: cf.classList.contains("is-fit"),
      over: Math.round(content.bottom - box.bottom),
      legendCut: legend.scrollHeight - legend.clientHeight,
      legendOut: Math.round(lr.bottom - box.bottom),
      covered,
    };
  });
}

test.describe.configure({ mode: "serial" });

test.describe("the centerfold (fixture edition)", () => {
  let tmp = "";
  let server: Server | null = null;
  let base = "";
  let path = "";

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    tmp = mkdtempSync(join(tmpdir(), "wishbook-centerfold-"));
    for (const f of PROJECT_FILES) cpSync(join(ROOT, f), join(tmp, f), { recursive: true });
    cpSync(join(FIXTURES, "content"), join(tmp, "content"), { recursive: true });
    cpSync(join(FIXTURES, "assets"), join(tmp, "assets"), { recursive: true });
    // The share cards draw the real brand art.
    cpSync(join(ROOT, "assets/brand"), join(tmp, "assets/brand"), { recursive: true });
    symlinkSync(join(ROOT, "node_modules"), join(tmp, "node_modules"), "dir");
    execFileSync(process.execPath, [join(ROOT, "node_modules/astro/bin/astro.mjs"), "build"], {
      cwd: tmp,
      stdio: "pipe",
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    });
    const dist = join(tmp, "dist");
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      let file = normalize(join(dist, decodeURIComponent(url.pathname)));
      if (!file.startsWith(dist)) file = dist;
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const html = readFileSync(join(dist, "2026/index.html"), "utf8");
    path = /data-slug="centerfold"[^>]*data-path="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(path).toMatch(/^\/2026\/.+\/centerfold\/$/);
  });

  test.afterAll(async () => {
    if (server) await new Promise((done) => server!.close(done));
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  test("legend and hotspots light each other", async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(base + path);
    const entry = page.locator(".cf-legend li a").nth(1);
    const i = await entry.getAttribute("data-i");
    await entry.hover();
    await expect(page.locator(`.hot[data-i="${i}"]`)).toHaveClass(/lit/);
    const hot = page.locator(".hot").nth(2);
    const j = await hot.getAttribute("data-i");
    await hot.hover();
    await expect(page.locator(`.cf-legend a[data-i="${j}"]`)).toHaveClass(/lit/);
  });

  test("on a phone a legend tap scrolls the strip to its hotspot; a second tap opens it", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(base + path);
    const strip = page.locator(".cf-scroll");
    // The hotspot furthest right, so the strip has to scroll to it.
    const entry = page.locator('.cf-legend li a:has-text("power bank")');
    const before = await strip.evaluate((s) => s.scrollLeft);
    await entry.tap();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect.poll(() => strip.evaluate((s) => s.scrollLeft)).not.toBe(before);
    const href = await entry.getAttribute("href");
    await entry.tap();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await context.close();
  });

  test("hotspots stay links, without wish-list toggles", async ({ page }) => {
    await page.goto(base + path);
    await expect(page.locator(".book")).toHaveClass(/is-live/);
    // Three hotspots; the fixture grouse has no page of its own, so its isn't a link.
    await expect(page.locator(".hot")).toHaveCount(3);
    await expect(page.locator("a.hot")).toHaveCount(2);
    await expect(page.locator("a.hot [data-wish-toggle]")).toHaveCount(0);
    await expect(page.locator("a.hot.wishable")).toHaveCount(0);
  });

  for (const [width, height, mode] of [
    [1920, 1080, "m-book"],
    [1440, 900, "m-book"],
    [1366, 768, "m-book"],
    [820, 1000, "m-single"],
    [700, 900, "m-single"],
  ] as const) {
    test(`fits with its whole legend at ${width}×${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(base + path);
      await expect(page.locator("html")).toHaveClass(new RegExp(mode));
      await page.evaluate(() => document.fonts.ready);
      const cf = await measure(page);
      expect(cf.fit).toBe(false);
      expect(cf.over).toBeLessThanOrEqual(1);
      expect(cf.legendCut).toBeLessThanOrEqual(1);
      expect(cf.legendOut).toBeLessThanOrEqual(1);
      expect(cf.covered).toEqual([]);
    });
  }

  test("turns into and out of the centerfold fade instead of turning a leaf", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // The spread before it (the fixture's centerfold is its last page).
    await page.goto(`${base}/2026/favorites/power-bank/`);
    await expect(page.locator(".book")).toHaveClass(/is-live/);
    await expect(page.locator(".cf-page")).not.toHaveClass(/is-current/);
    // Records which turn classes appear (the fade is too quick to poll for).
    const watch = () =>
      page.evaluate(() => {
        const seen = new Set<string>();
        (window as unknown as { seen: Set<string> }).seen = seen;
        new MutationObserver((records) => {
          for (const r of records) {
            const el = r.target as Element;
            for (const c of ["fade-in", "leaf-front", "leaf-rear"]) {
              if (el.classList?.contains(c)) seen.add(c);
            }
          }
        }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
      });
    const seen = () => page.evaluate(() => [...(window as unknown as { seen: Set<string> }).seen]);
    await watch();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".cf-page")).toHaveClass(/is-current/);
    await expect(page.locator(".leaf, .lift, .fade-in")).toHaveCount(0);
    expect(await seen()).toEqual(["fade-in"]);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await watch();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".cf-page")).not.toHaveClass(/is-current/);
    await expect(page.locator(".leaf, .lift, .fade-in")).toHaveCount(0);
    expect(await seen()).toEqual(["fade-in"]);
  });
});
