import { expect, test, type Page } from "@playwright/test";

/**
 * Scrolling feel: the feed scrolls freely (no snapping), deep links land once
 * and stay put, page keys step page by page, far jumps are instant, and the
 * fitted book (book and single modes) never scrolls the document.
 */

/** The page with this slug's top, relative to where the feed lands a page. */
async function offset(page: Page, slug: string): Promise<number> {
  return page.locator(`.book-pages > [data-slug="${slug}"]`).evaluate((el) => {
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    return el.getBoundingClientRect().top - margin;
  });
}

/** Waits until the document stops scrolling (scrollY unchanged for 300ms). */
async function scrollSettled(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let last = scrollY;
        let still = performance.now();
        const tick = () => {
          if (scrollY !== last) {
            last = scrollY;
            still = performance.now();
          }
          if (performance.now() - still > 300) resolve(scrollY);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** Waits until no turn is running. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator(".leaf, .lift, .fade-in")).toHaveCount(0);
}

const VIEWS = [
  ["a", 1360, 900],
  ["b", 1360, 900],
  ["c", 1360, 900],
  ["d", 1360, 900],
  ["e1", 1360, 900],
  ["e2", 1360, 900],
  ["a", 820, 1000],
  ["e1", 390, 844],
] as const;

for (const [layout, width, height] of VIEWS) {
  test(`layout ${layout} at ${width}×${height}: nothing snaps`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/2026/favorites/wes/?layout=${layout}`);
    await expect(page.locator(".book")).toHaveClass(/is-live/);
    const snapping = await page.evaluate(() =>
      [document.documentElement, ...document.querySelectorAll("*")]
        .filter((el) => getComputedStyle(el).scrollSnapType !== "none")
        .map((el) => el.tagName + (el.className ? `.${String(el.className)}` : "")),
    );
    expect(snapping).toEqual([]);
  });
}

const FEEDS = [
  ["e1", 1360, 900],
  ["e2", 1360, 900],
  ["e1", 390, 844],
] as const;

for (const [layout, width, height] of FEEDS) {
  for (const path of ["/2026/under-30/under-30-picks/", "/2026/kids-pets/pets/"]) {
    test(`layout ${layout} at ${width}px: a deep link to ${path} lands once and stays put`, async ({
      page,
    }) => {
      const slug = path.split("/").at(-2)!;
      await page.setViewportSize({ width, height });
      await page.goto(`${path}?layout=${layout}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".book")).toHaveClass(/is-live/);
      const samples: number[] = [];
      for (let i = 0; i < 30; i++) {
        samples.push(await offset(page, slug));
        await page.waitForTimeout(100);
      }
      // The page sits at the top of the feed from the start, for 3s, with no input.
      for (const s of samples) expect(Math.abs(s), samples.join(",")).toBeLessThanOrEqual(2);
      await expect(page).toHaveURL(new RegExp(`${path}\\?layout=${layout}$`));
    });
  }
}

for (const [layout, width, height] of [
  ["e1", 1360, 900],
  ["e1", 390, 844],
] as const) {
  test(`layout ${layout} at ${width}px: Page Down steps one page; the wheel is never adjusted`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/2026/favorites/wes/?layout=${layout}`);
    await expect(page.locator(".book")).toHaveClass(/is-live/);
    expect(Math.abs(await offset(page, "wes"))).toBeLessThanOrEqual(2);
    await page.keyboard.press("PageDown");
    await scrollSettled(page);
    expect(Math.abs(await offset(page, "icemag"))).toBeLessThanOrEqual(2);
    await page.keyboard.press("PageUp");
    await scrollSettled(page);
    expect(Math.abs(await offset(page, "wes"))).toBeLessThanOrEqual(2);

    // Free scrolling: wherever the wheel leaves the feed, it stays.
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, 517);
    const after = await scrollSettled(page);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => scrollY)).toBe(after);
    expect(Math.abs(await offset(page, "wes"))).toBeGreaterThan(100);
  });
}

test("layout e1: a far tab jump is instant and highlights the page", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/favorites/wes/?layout=e1");
  await expect(page.locator(".book")).toHaveClass(/is-live/);
  const start = await page.evaluate(() => history.length);
  await page.locator('.tabs a[data-section="wild-card"]').click();
  // Already there in the next frame: no smooth scroll across the book.
  const top = await page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>('.book-pages > [data-slug="wild-card"]')!;
          resolve(
            el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).scrollMarginTop),
          );
        }),
      ),
  );
  expect(Math.abs(top)).toBeLessThanOrEqual(2);
  await expect(page.locator('.book-pages > [data-slug="wild-card"]')).toHaveClass(/flash/);
  await expect(page).toHaveURL(/\/2026\/wild-card\/$/);
  expect(await page.evaluate(() => history.length)).toBe(start + 1);
});

test("the feed's running head names the section and folio being read", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/2026/favorites/wes/");
  const head = page.locator(".run-head");
  await expect(head).toBeVisible();
  await expect(head).toHaveAttribute("aria-hidden", "true");
  const label = await page.locator('.book-pages > [data-slug="wes"]').getAttribute("data-label");
  await expect(head).toHaveText(new RegExp(`Favorite Things.*page ${label}$`, "i"));
  await page.locator('.book-pages > [data-slug="niki"]').evaluate((e) => e.scrollIntoView());
  const niki = await page.locator('.book-pages > [data-slug="niki"]').getAttribute("data-label");
  await expect(head).toHaveText(new RegExp(`page ${niki}$`));
});

test("layout a: turning the book never scrolls the document", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/favorites/wes/?layout=a");
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("ArrowRight");
    await settled(page);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  }
  await expect(page).toHaveURL(/\/2026\/favorites\/cj\/$/);
  await expect(page.locator(".run-head")).toBeHidden();
});

for (const path of ["/2026/favorites/wes/", "/2026/under-30/under-30-picks/"]) {
  test(`layout a: the fit scale on ${path} settles and stays`, async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(`${path}?layout=a`);
    const fits = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".book-pages > .is-shown")].map(
          (p) => `${p.dataset.slug}=${p.style.getPropertyValue("--fit") || "1"}`,
        ),
      );
    await page.waitForTimeout(500);
    const early = await fits();
    await page.waitForTimeout(2000);
    expect(await fits()).toEqual(early);
  });
}
