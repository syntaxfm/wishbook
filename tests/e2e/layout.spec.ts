import { expect, test, type Page } from "@playwright/test";

/**
 * The fixed page box, fit scaling, and clickable page edges (book and single
 * modes), plus a light check of each prototype layout variant.
 */

/** Waits until no turn is running. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator(".leaf, .lift, .fade-in")).toHaveCount(0);
}

/** Geometry of the frame and the shown pages, rounded to whole pixels. */
async function frame(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map(Math.round);
    };
    // On screen: single mode marks the spread partner shown but doesn't display it.
    const shown = [...document.querySelectorAll<HTMLElement>(".book-pages > .is-shown")].filter(
      (p) => p.getClientRects().length > 0,
    );
    const problems: string[] = [];
    for (const p of shown) {
      const pr = p.getBoundingClientRect();
      // A scaled page must not overflow its box. (Pages at scale 1 may let
      // decorative art bleed off the edge, clipped by design, like the cover.)
      if (p.classList.contains("is-fit") && p.scrollHeight > p.clientHeight + 1) {
        problems.push(`${p.dataset.slug} scrolls`);
      }
      const content = p.querySelector(":scope > .pg, :scope > .cf");
      const cr = content?.getBoundingClientRect();
      if (cr && (cr.bottom > pr.bottom + 1 || cr.top < pr.top - 1)) {
        problems.push(`${p.dataset.slug} content ${Math.round(cr.bottom - pr.bottom)}px over`);
      }
    }
    return {
      path: location.pathname,
      stage: box(document.querySelector(".book-pages")),
      prev: box(document.querySelector(".pager .prev")),
      next: box(document.querySelector(".pager .next")),
      pages: shown.filter((p) => p.classList.contains("page")).map((p) => box(p)!.slice(2)),
      docScroll: document.documentElement.scrollHeight - innerHeight,
      problems,
    };
  });
}

/**
 * A point on an edge strip with no page control under it (a click over a
 * control goes to the control instead of turning).
 */
async function clearSpot(page: Page, selector: string): Promise<{ x: number; y: number }> {
  return page.locator(selector).evaluate((edge) => {
    const r = edge.getBoundingClientRect();
    for (let y = 20; y < r.height - 20; y += 10) {
      const hit = document
        .elementsFromPoint(r.left + r.width / 2, r.top + y)
        .find((el) => !el.classList.contains("edge"));
      if (!hit?.closest("a[href], button, input, label")) return { x: r.width / 2, y };
    }
    throw new Error("no clear spot on the edge");
  });
}

const BOXED = [
  [1360, 900, "m-book"],
  [1440, 900, "m-book"],
  [820, 1000, "m-single"],
] as const;

for (const [width, height, mode] of BOXED) {
  test(`every page shares one fixed box and the controls never move at ${width}×${height}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.goto("/2026/");
    await expect(page.locator("html")).toHaveClass(new RegExp(mode));
    await page.evaluate(() => document.fonts.ready);
    const first = await frame(page);
    const sizes = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const f = await frame(page);
      expect(f.stage, f.path).toEqual(first.stage);
      expect(f.prev, f.path).toEqual(first.prev);
      expect(f.next, f.path).toEqual(first.next);
      expect(f.docScroll, f.path).toBeLessThanOrEqual(0);
      expect(f.problems, f.path).toEqual([]);
      for (const p of f.pages) sizes.add(p.join("×"));
      if (f.path.endsWith("/back-cover/")) break;
      await page.keyboard.press("ArrowRight");
      await settled(page);
    }
    expect(page.url()).toMatch(/\/back-cover\/$/);
    expect([...sizes]).toHaveLength(1);
  });
}

test("the page edges turn: right forward, left back, replacing history", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/favorites/wes/");
  const start = await page.evaluate(() => history.length);
  const next = page.locator(".edge-next");
  const prev = page.locator(".edge-prev");
  await expect(next).toHaveAttribute("tabindex", "-1");
  await expect(next).toHaveAccessibleName("Next page");
  await next.click({ position: await clearSpot(page, ".edge-next") });
  await settled(page);
  await expect(page).toHaveURL(/\/2026\/favorites\/icemag\/$/);
  await prev.click({ position: await clearSpot(page, ".edge-prev") });
  await settled(page);
  // A turn opens the spread at its left page.
  await expect(page).toHaveURL(/\/2026\/favorites\/$/);
  expect(await page.evaluate(() => history.length)).toBe(start);
});

test("the cover has no previous edge and the back cover no next edge", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/");
  await expect(page.locator(".edge-prev")).toBeHidden();
  await expect(page.locator(".edge-next")).toBeVisible();
  await page.goto("/2026/back/back-cover/");
  await expect(page.locator(".edge-next")).toBeHidden();
  await expect(page.locator(".edge-prev")).toBeVisible();
});

test("single mode has edges on the page", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto("/2026/favorites/wes/");
  await page.locator(".edge-next").click({ position: await clearSpot(page, ".edge-next") });
  await settled(page);
  await expect(page).toHaveURL(/\/2026\/favorites\/icemag\/$/);
});

test("the phone feed has no edges and pages keep their natural height", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/2026/favorites/wes/");
  await expect(page.locator(".edge-next")).toBeHidden();
  await expect(page.locator(".book-pages > .is-fit")).toHaveCount(0);
});

/* ---------- prototype layouts ---------- */

for (const layout of ["a", "b", "c", "d"]) {
  test(`layout ${layout}: the spread and its controls fit the window at 1360×900`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(`/2026/favorites/wes/?layout=${layout}`);
    await expect(page.locator("html")).toHaveAttribute("data-layout", layout);
    const f = await frame(page);
    expect(f.docScroll).toBeLessThanOrEqual(0);
    for (const sel of [
      ".pager .prev",
      ".pager .next",
      ".tabs",
      '.book-pages > [data-slug="wes"]',
    ]) {
      const b = (await page.locator(sel).boundingBox())!;
      expect(b.x, sel).toBeGreaterThanOrEqual(0);
      expect(b.y, sel).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, sel).toBeLessThanOrEqual(1360);
      expect(b.y + b.height, sel).toBeLessThanOrEqual(900);
    }
    await page.locator(".pager .next").click();
    await settled(page);
    await expect(page).toHaveURL(/\/2026\/favorites\/icemag\/$/);
  });
}

for (const layout of ["e1", "e2"]) {
  test(`layout ${layout}: a feed with a section rail at 1360×900`, async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(`/2026/favorites/wes/?layout=${layout}`);
    await expect(page.locator("html")).toHaveClass(/m-scroll/);
    await expect(page.locator(".tabs")).toBeInViewport({ ratio: 1 });
    await page.locator('.tabs a[data-section="tech"]').click();
    await expect(page).toHaveURL(/\/2026\/tech\/$/);
    await expect(page.locator('.tabs a[data-section="tech"]')).toHaveClass(/on/);
  });
}

test("the layout choice is remembered", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/?layout=d");
  await page.goto("/2026/favorites/wes/");
  await expect(page.locator("html")).toHaveAttribute("data-layout", "d");
  await page.locator(".proto-switch").hover();
  await page.locator('.proto-switch button[data-layout="a"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-layout", "a");
});
