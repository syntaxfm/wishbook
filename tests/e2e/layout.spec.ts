import { expect, test, type Page } from "@playwright/test";

/**
 * The reading modes: the fixed page box, fit scaling, the side controls, and
 * clickable page edges (book and single modes); the readable floor under the
 * page box (tall spreads scroll, turns snap to the top); and which mode a
 * window gets (spreads, a single page, or the feed).
 */

/** Waits until no turn is running. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator(".leaf, .lift, .fade-in")).toHaveCount(0);
}

/** Geometry of the frame and the shown pages, rounded to whole pixels. */
async function frame(page: Page) {
  return page.evaluate(() => {
    // Runs in the browser: helpers must live inside the evaluated function.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
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

/* ---------- the side controls and the readable floor ---------- */

/** Opens a page with the web fonts in. */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
}

const html = (page: Page) => page.locator("html");

/** Height of the spread on screen and of the document, at the current page. */
const heights = (page: Page) =>
  page.evaluate(() => ({
    stage: Math.round(document.querySelector(".book-pages")!.getBoundingClientRect().height),
    doc: document.documentElement.scrollHeight,
  }));

/** Turns through the whole book (instantly) and returns every spread's height. */
async function everySpread(page: Page): Promise<{ stage: number; doc: number }[]> {
  const out = [await heights(page)];
  for (let i = 0; i < 60; i++) {
    if ((await page.locator(".pager .next").getAttribute("aria-disabled")) === "true") break;
    await page.keyboard.press("ArrowRight");
    out.push(await heights(page));
  }
  return out;
}

test("a window tall enough fits the spread, its arrows, and its tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, "/2026/favorites/wes/");
  await expect(html(page)).toHaveClass(/m-book/);
  const f = await frame(page);
  expect(f.docScroll).toBeLessThanOrEqual(0);
  expect(f.pages).toHaveLength(2);
  // pages at their widest
  expect(f.pages[0]![0]).toBe(780);
  for (const sel of [".pager .prev", ".pager .next", ".tabs", ".edge-next"]) {
    await expect(page.locator(sel)).toBeInViewport({ ratio: 1 });
  }
  // the tabs hang off the book's edge
  expect((await page.locator(".tabs").boundingBox())!.width).toBeLessThan(60);
  await page.locator(".pager .next").click();
  await settled(page);
  await expect(page).toHaveURL(/\/2026\/favorites\/icemag\/$/);
});

for (const [width, height] of [
  [1280, 800],
  [1360, 900],
] as const) {
  test(`a ${width}×${height} window shows a spread with arrows and tabs clear of the pages`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await open(page, "/2026/favorites/wes/");
    await expect(html(page)).toHaveClass(/m-book/);
    const f = await frame(page);
    expect(f.docScroll).toBeLessThanOrEqual(0);
    expect(f.pages).toHaveLength(2);
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const stage = await box(".book-pages");
    const prev = await box(".pager .prev");
    const next = await box(".pager .next");
    const tabs = await box(".tabs");
    for (const [name, b] of [
      ["prev", prev],
      ["next", next],
      ["tabs", tabs],
    ] as const) {
      expect(b.x, name).toBeGreaterThanOrEqual(0);
      expect(b.y, name).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, name).toBeLessThanOrEqual(width);
      expect(b.y + b.height, name).toBeLessThanOrEqual(height);
    }
    expect(prev.width).toBeGreaterThanOrEqual(44);
    expect(next.width).toBeGreaterThanOrEqual(44);
    // nothing over the pages, and the next arrow clear of the tabs
    expect(prev.x + prev.width).toBeLessThanOrEqual(stage.x);
    expect(tabs.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1);
    expect(next.x).toBeGreaterThan(tabs.x + tabs.width);
  });
}

test("every spread has the same height, fitting or scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [w, h, scrolls] of [
    [1920, 1080, false],
    [1440, 700, true],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await open(page, "/2026/");
    const all = await everySpread(page);
    expect(all.length).toBeGreaterThan(15);
    expect(new Set(all.map((s) => s.stage)).size, `${w}×${h} spread heights`).toBe(1);
    expect(new Set(all.map((s) => s.doc)).size, `${w}×${h} document heights`).toBe(1);
    expect(all[0]!.doc > h, `${w}×${h} scrolls`).toBe(scrolls);
  }
});

test("a spread taller than the window scrolls; turning snaps to the top", async ({ page }) => {
  // 1440×700: the window fit would make pages 513px wide, under the readable width
  await page.setViewportSize({ width: 1440, height: 700 });
  await open(page, "/2026/under-30/under-30-picks/");
  await expect(html(page)).toHaveClass(/m-book/);
  const f = await frame(page);
  expect(f.docScroll).toBeGreaterThan(20);
  expect(f.pages).toHaveLength(2);
  const before = await heights(page);

  const arrows = async () => ({
    prev: await page.locator(".pager .prev").boundingBox(),
    next: await page.locator(".pager .next").boundingBox(),
    tabs: await page.locator(".tabs").boundingBox(),
  });
  const top = await arrows();
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(20);
  // arrows and tabs don't move while the window scrolls
  expect(await arrows()).toEqual(top);

  await page.locator(".pager .next").click();
  await settled(page);
  await expect(page).toHaveURL(/\/2026\/under-30\/under-30-more\/$/);
  expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(1);
  expect(await heights(page)).toEqual(before);
  // back with the keyboard (a turn opens the spread at its left page), and a
  // jump: each opens at the top
  await page.evaluate(() => scrollTo({ top: 100, behavior: "instant" }));
  await page.keyboard.press("ArrowLeft");
  await settled(page);
  await expect(page).toHaveURL(/\/2026\/under-30\/$/);
  expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(1);
  await page.evaluate(() => scrollTo({ top: 100, behavior: "instant" }));
  await page.locator('.tabs a[data-section="desk"]').click();
  await expect(page).toHaveURL(/\/2026\/desk\/$/);
  expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(1);
  expect(await heights(page)).toEqual(before);
});

test("one page when two readable pages don't fit; the feed below that", async ({ page }) => {
  await page.setViewportSize({ width: 1240, height: 800 });
  await open(page, "/2026/favorites/wes/");
  await expect(html(page)).toHaveClass(/m-single/);
  expect((await frame(page)).pages).toHaveLength(1);

  await page.setViewportSize({ width: 680, height: 900 });
  await expect(html(page)).toHaveClass(/m-scroll/);
  await expect(page.locator('.book-pages > [data-slug="icemag"]')).toBeVisible();
});

test("a feed wider than a phone has a section rail", async ({ page }) => {
  await page.setViewportSize({ width: 680, height: 900 });
  await open(page, "/2026/favorites/wes/");
  await expect(html(page)).toHaveClass(/m-scroll/);
  await expect(page.locator(".tabs")).toBeInViewport({ ratio: 1 });
  expect((await page.locator(".tabs").boundingBox())!.x).toBe(0);
  await page.locator('.tabs a[data-section="tech"]').click();
  await expect(page).toHaveURL(/\/2026\/tech\/$/);
  await expect(page.locator('.tabs a[data-section="tech"]')).toHaveClass(/on/);
});

test("the mode holds across turns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await open(page, "/2026/favorites/wes/");
  await expect(html(page)).toHaveClass(/m-book/);
  for (let i = 0; i < 4; i++) {
    await page.locator(".pager .next").click();
    await settled(page);
    await expect(html(page)).toHaveClass(/m-book/);
  }
});

test("resizing across modes keeps the page", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, "/2026/favorites/kaitlin/");
  await expect(html(page)).toHaveClass(/m-book/);
  const current = page.locator(".book-pages > .is-current");
  for (const [w, h, mode] of [
    [1240, 800, /m-single/],
    [600, 900, /m-scroll/],
    [1440, 700, /m-book/],
    [1920, 1080, /m-book/],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await expect(html(page)).toHaveClass(mode);
    await expect(current).toHaveAttribute("data-slug", "kaitlin");
    expect(new URL(page.url()).pathname).toBe("/2026/favorites/kaitlin/");
  }
});

test("the measured readable width is remembered for the next load", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await open(page, "/2026/favorites/wes/");
  const stored = await page.evaluate(() => localStorage.getItem("wishbook:2026:readable-width"));
  expect(Number(stored)).toBeGreaterThan(400);
  expect(Number(stored)).toBeLessThan(781);
  // the head script sets it before first paint
  await page.reload();
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue("--readable-w")),
  ).toBe(`${stored}px`);
});
