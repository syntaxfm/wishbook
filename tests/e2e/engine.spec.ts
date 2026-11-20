import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * The book engine: reading modes, turns, jumps, history, accessibility, and
 * the promise that navigation never touches the network.
 */

const WIDTHS = [
  [1360, "m-book"],
  [820, "m-single"],
  [390, "m-scroll"],
] as const;

/** Slugs of the pages on screen (display not none and inside the viewport). */
async function onScreen(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".book-pages > [data-slug]")]
      .filter((e) => {
        if (getComputedStyle(e).display === "none") return false;
        const r = e.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight;
      })
      .map((e) => e.dataset.slug!),
  );
}

/** Waits until no turn is running (no leaf, lift, or fade on the page). */
async function settled(page: Page): Promise<void> {
  await expect(page.locator(".leaf, .lift, .fade-in")).toHaveCount(0);
}

/**
 * Collects every request made from now on. Navigation must make none: no
 * document, script, data, or style request, and nothing from another origin.
 * The only requests allowed are this site's own static images and fonts,
 * fetched as newly shown pages need them (the image loader priming the
 * neighbours of the new page, a self-hosted font used for the first time).
 */
function recordRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (r) => seen.push(r));
  return seen;
}
function disallowed(requests: Request[], origin: string): string[] {
  return requests
    .filter(
      (r) => !["image", "font"].includes(r.resourceType()) || new URL(r.url()).origin !== origin,
    )
    .map((r) => `${r.resourceType()} ${r.url()}`);
}

for (const [width, mode] of WIDTHS) {
  test(`a deep link opens at its page at ${width}px`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto("/2026/favorites/wes/");
    await expect(page.locator("html")).toHaveClass(new RegExp(mode));
    await expect(page.locator('.book-pages > [data-slug="wes"]')).toHaveClass(/is-current/);
    await expect(page.locator('.book-pages > [data-slug="wes"]')).toBeInViewport();
    if (mode === "m-book") {
      // The whole spread: page 4 (left) with page 5 (right).
      expect(await onScreen(page)).toEqual(["wes", "wes-more"]);
    } else if (mode === "m-single") {
      expect(await onScreen(page)).toEqual(["wes"]);
    } else {
      // The feed scrolled to the page: it starts at the top of the screen,
      // just below the running head.
      const top = await page
        .locator('.book-pages > [data-slug="wes"]')
        .evaluate(
          (e) => e.getBoundingClientRect().top - parseFloat(getComputedStyle(e).scrollMarginTop),
        );
      expect(Math.abs(top)).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    }
    await expect(page).toHaveTitle(/^Wes's Favorite Things · /);
    await expect(page.locator('.tabs a[data-section="favorites"]')).toHaveClass(/on/);
    await page.close();
  });
}

test("four turns and a tab jump change the URL with zero network requests", async ({
  browser,
  baseURL,
}) => {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto("/2026/favorites/wes/");
  await page.waitForLoadState("networkidle");
  const requests = recordRequests(page);
  const urls: string[] = [];

  for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft"] as const) {
    await page.keyboard.press(key);
    await settled(page);
    urls.push(new URL(page.url()).pathname);
  }
  await page.locator(".pager a.next").click();
  await settled(page);
  urls.push(new URL(page.url()).pathname);
  await page.locator('.tabs a[data-section="kitchen"]').click();
  await settled(page);
  urls.push(new URL(page.url()).pathname);

  expect(urls).toEqual([
    "/2026/favorites/icemag/",
    "/2026/favorites/randy/",
    "/2026/favorites/icemag/",
    "/2026/favorites/randy/",
    "/2026/kitchen/kitchen-picks/",
  ]);
  await expect(page.locator('.tabs a[data-section="kitchen"]')).toHaveClass(/on/);
  expect(disallowed(requests, new URL(baseURL!).origin)).toEqual([]);
  await page.close();
});

test("turns replace history; Back after a jump returns to the page before it", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/favorites/wes/");
  const start = await page.evaluate(() => history.length);
  await page.keyboard.press("ArrowRight");
  await settled(page);
  await page.keyboard.press("ArrowRight");
  await settled(page);
  await expect(page).toHaveURL(/\/2026\/favorites\/randy\/$/);
  // Turns don't stack history.
  expect(await page.evaluate(() => history.length)).toBe(start);

  await page.locator('.tabs a[data-section="tech"]').click();
  await expect(page).toHaveURL(/\/2026\/tech\/olight\/$/);
  expect(await page.evaluate(() => history.length)).toBe(start + 1);
  await expect(page.locator('.book-pages > [data-slug="olight"]')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/2026\/favorites\/randy\/$/);
  await expect(page.locator('.book-pages > [data-slug="randy"]')).toBeVisible();
  await expect(page.locator('.book-pages > [data-slug="olight"]')).toBeHidden();
  await expect(page).toHaveTitle(/^Randy/);

  await page.goForward();
  await expect(page).toHaveURL(/\/2026\/tech\/olight\/$/);
  await expect(page.locator('.book-pages > [data-slug="olight"]')).toBeVisible();
});

test("a section's own path opens its first page, and stays a route", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/tech/");
  await expect(page.locator('.book-pages > [data-slug="olight"]')).toHaveClass(/is-current/);
  await expect(page.locator('.tabs a[data-section="tech"]')).toHaveClass(/on/);
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  await page.locator('.tabs a[data-section="desk"]').click();
  await expect(page).toHaveURL(/\/2026\/desk\/desk-picks\/$/);
  // Back to the section path: the same page, without a reload.
  await page.goBack();
  await expect(page).toHaveURL(/\/2026\/tech\/$/);
  await expect(page.locator('.book-pages > [data-slug="olight"]')).toHaveClass(/is-current/);
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
});

test("an in-book cross-reference is a jump without a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/favorites/icemag/");
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  await page.locator('[data-slug="icemag"] a[href="/2026/favorites/wes/"]').first().click();
  await expect(page).toHaveURL(/\/2026\/favorites\/wes\/$/);
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  await expect(page.locator('.book-pages > [data-slug="wes"]')).toHaveClass(/is-current/);
});

test("focus lands on the page heading and the live region announces the page", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/favorites/wes/");
  await page.locator(".pager a.next").click();
  await settled(page);
  await expect(page.locator("#title-icemag")).toBeFocused();
  const live = page.locator("[data-live]");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText(/ICEMAG 3.*, Our Favorite Things$/);

  await page.locator('.tabs a[data-section="desk"]').click();
  await expect(page.locator("#title-desk-picks")).toBeFocused();
  await expect(live).toHaveText("On Our Desks, Your Desk");
});

test("single mode turns one page at a time", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto("/2026/favorites/wes/");
  await page.locator(".pager a.next").click();
  await settled(page);
  await expect(page).toHaveURL(/\/2026\/favorites\/wes-more\/$/);
  expect(await onScreen(page)).toEqual(["wes-more"]);
  await expect(page.locator("#title-wes-more")).toBeFocused();
  await page.locator(".pager a.prev").click();
  await settled(page);
  await expect(page).toHaveURL(/\/2026\/favorites\/wes\/$/);
});

test("reduced motion swaps pages instantly", async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1360, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("/2026/favorites/wes/");
  // No leaf is ever created, and the next spread shows in the same task.
  const result = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    return {
      leaves: document.querySelectorAll(".leaf, .lift, .fade-in").length,
      path: location.pathname,
      current: document.querySelector(".book-pages > .is-current")?.getAttribute("data-slug"),
    };
  });
  expect(result).toEqual({ leaves: 0, path: "/2026/favorites/icemag/", current: "icemag" });
  await context.close();
});

test("with JavaScript disabled the deep-linked page is visible", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1360, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("/2026/tech/xteink/");
  await expect(page.locator('.book-pages > [data-slug="xteink"]')).toBeVisible();
  await expect(page.locator('.book-pages > [data-slug="olight"]')).toBeHidden();
  await context.close();
});

test("from / the first turn moves the address into the edition, and a reload keeps the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  await settled(page);
  await expect(page).toHaveURL(/\/2026\/front\/welcome\/$/);
  const path = new URL(page.url()).pathname;
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.locator('.book-pages > [data-slug="welcome"]')).toHaveClass(/is-current/);
  await expect(page.locator('.book-pages > [data-slug="welcome"]')).toBeVisible();
});

test("a jump from / pushes a year-scoped URL", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/");
  await page.locator('.tabs a[data-section="favorites"]').click();
  await expect(page).toHaveURL(/\/2026\/favorites\/wes\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.book-pages > [data-slug="cover"]')).toBeVisible();
});

test("the feed's URL follows the reading position", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/2026/favorites/wes/");
  const start = await page.evaluate(() => history.length);
  await page.locator('.book-pages > [data-slug="niki"]').evaluate((e) => e.scrollIntoView());
  await expect(page).toHaveURL(/\/2026\/favorites\/niki\/$/);
  await expect(page).toHaveTitle(/^Niki/);
  expect(await page.evaluate(() => history.length)).toBe(start);
  // Off-screen pages in the feed skip rendering.
  expect(
    await page
      .locator('.book-pages > [data-slug="back-cover"]')
      .evaluate((e) => getComputedStyle(e).contentVisibility),
  ).toBe("auto");
});

test("resizing switches modes and keeps the page", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/favorites/niki/");
  await page.setViewportSize({ width: 820, height: 900 });
  await expect(page.locator("html")).toHaveClass(/m-single/);
  expect(await onScreen(page)).toEqual(["niki"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveClass(/m-scroll/);
  await expect(page.locator('.book-pages > [data-slug="niki"]')).toBeInViewport();
  await page.setViewportSize({ width: 1360, height: 900 });
  await expect(page.locator("html")).toHaveClass(/m-book/);
  await expect(page).toHaveURL(/\/2026\/favorites\/niki\/$/);
  expect(await onScreen(page)).toEqual(["icemag", "niki"]);
});

test("images load for the current spread and its neighbours only", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/favorites/wes/");
  const loading = (slug: string) =>
    page
      .locator(`.book-pages > [data-slug="${slug}"] img`)
      .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).loading));
  // Neighbouring spreads (2–3 and 6–7) are eager; far pages stay lazy.
  expect(new Set(await loading("icemag"))).toEqual(new Set(["eager"]));
  expect(await loading("shoppers")).not.toContain("lazy");
  expect(await loading("olight")).toContain("lazy");
});

// The centerfold (legend and hotspots, the phone strip, fade turns) is checked
// against the fixture edition in centerfold.spec.ts: 2026 has none.

test("every page change emits wishbook:navigate", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/");
  const events = await page.evaluate(async () => {
    const seen: unknown[] = [];
    document.addEventListener("wishbook:navigate", (e) => seen.push((e as CustomEvent).detail));
    const link = document.querySelector<HTMLAnchorElement>('.tabs a[data-section="tech"]')!;
    link.click();
    return seen;
  });
  expect(events).toEqual([
    { slug: "olight", path: "/2026/tech/olight/", kind: "jump", mode: "book" },
  ]);
});
