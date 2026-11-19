import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// The e2e web server runs `pnpm build` first, so dist/ is fresh.
const COVER = readFileSync(resolve(import.meta.dirname, "../../dist/2026/index.html"), "utf8");
const PATHS = [
  "/",
  ...new Set([...COVER.matchAll(/\sdata-path="([^"]+)"/g)].map((m) => m[1]!)),
  "/2026/wishlist/?w=BgI",
];

test("the dev-only design showcase is not in the production build", async ({ page }) => {
  const response = await page.goto("/dev/design-system/");
  expect(response?.status()).toBe(404);
});

test("a page preloads only self-hosted fonts and renders the print filters", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://localhost").origin;
  await page.goto("/2026/");
  const preloads = page.locator('link[rel="preload"][as="font"]');
  await expect(preloads).not.toHaveCount(0);
  for (const href of await preloads.evaluateAll((links) =>
    links.map((l) => (l as HTMLLinkElement).href),
  )) {
    expect(new URL(href).origin).toBe(origin);
  }
  await expect(page.locator("#inkbleed")).toHaveCount(1);
});

for (const width of [1360, 390]) {
  test(`no page requests another origin at ${width}px`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    expect(PATHS.length).toBeGreaterThan(30);
    const origin = new URL(baseURL ?? "http://localhost").origin;
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const foreign: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol !== "data:" && url.protocol !== "blob:" && url.origin !== origin) {
        foreign.push(`${page.url()} → ${request.url()}`);
      }
    });
    for (const path of PATHS) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
    }
    expect(foreign).toEqual([]);
    await context.close();
  });
}
