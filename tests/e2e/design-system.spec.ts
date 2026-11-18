import { expect, test } from "@playwright/test";

test("the dev-only design showcase is not in the production build", async ({ page }) => {
  const response = await page.goto("/dev/design-system/");
  expect(response?.status()).toBe(404);
});

test("a page loads only same-origin resources and the self-hosted fonts", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://localhost").origin;
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.origin !== origin) foreign.push(request.url());
  });

  await page.goto("/2026/");
  await page.evaluate(() => document.fonts.ready);

  expect(foreign).toEqual([]);
  const preloads = page.locator('link[rel="preload"][as="font"]');
  await expect(preloads).not.toHaveCount(0);
  for (const href of await preloads.evaluateAll((links) =>
    links.map((l) => (l as HTMLLinkElement).href),
  )) {
    expect(new URL(href).origin).toBe(origin);
  }
  await expect(page.locator("#inkbleed")).toHaveCount(1);
});
