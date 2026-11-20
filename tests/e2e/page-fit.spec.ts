import { expect, test, type Page } from "@playwright/test";

/**
 * Every page fits its fixed box (W × 1.303W) at full design scale, with room
 * to spare, so the fit safety net (src/scripts/fit.ts) never has to scale one.
 *
 * Worst case: JavaScript on (the "Circle it" toggles), fonts and images
 * loaded, and twelve items on the wish list (the order form filled). Each page
 * is cloned into a box at the page widths the book uses; its content (`.pg` at
 * its own height) must take at most 98% of the box, and nothing may stick out
 * past the page's sides or foot except elements marked `data-bleed` (art that
 * runs off the edge on purpose, clipped by the page).
 */

const WIDTHS = [560, 620, 698, 780];
const ASPECT = 1.303;
const MAX = 0.98;

/** Opens the book with twelve items circled and everything loaded. */
async function openLoaded(page: Page, path = "/2026/"): Promise<void> {
  await page.addInitScript(() => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    localStorage.setItem("wishbook:2026:wishlist", JSON.stringify(ids));
  });
  await page.goto(path);
  await expect(page.locator(".book")).toHaveClass(/is-live/);
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll("img")) img.loading = "eager";
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? null
          : new Promise((done) => {
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
            }),
      ),
    );
  });
}

interface Measured {
  slug: string;
  ratio: number;
  over: number;
  protrudes: string[];
  tallest: string[];
}

/** Clones every page (not the centerfold) into a W-wide box and measures it. */
function measureAll(page: Page, pageWidth: number): Promise<Measured[]> {
  return page.evaluate(
    ({ width, aspect }) => {
      const out: Measured[] = [];
      // Runs in the browser: helpers must live inside the evaluated function.
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const name = (el: Element) =>
        `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}`;
      for (const src of document.querySelectorAll<HTMLElement>(".book-pages > .page")) {
        const host = document.createElement("div");
        host.style.cssText = `position:fixed;top:0;left:-20000px;width:${width}px;`;
        const clone = src.cloneNode(true) as HTMLElement;
        clone.classList.remove("is-fit");
        clone.removeAttribute("style");
        for (const el of clone.querySelectorAll("[id]")) el.removeAttribute("id");
        clone.style.cssText = `display:flex;width:100%;height:${width * aspect}px;min-height:0;zoom:1;content-visibility:visible;`;
        host.append(clone);
        document.body.append(host);
        const pg = clone.querySelector<HTMLElement>(":scope > .pg")!;
        // the content at its own height, not stretched to the box
        pg.style.flex = "none";
        const cs = getComputedStyle(clone);
        const room = width * aspect - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const natural = pg.offsetHeight;
        const box = clone.getBoundingClientRect();
        const protrudes: string[] = [];
        for (const el of clone.querySelectorAll<Element>(".pg *")) {
          if (el.closest("[data-bleed], .wish-circle, .sr-only")) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const over = Math.max(r.bottom - box.bottom, box.left - r.left, r.right - box.right);
          if (over > 1) protrudes.push(`${name(el)} ${Math.round(over)}px`);
        }
        const tallest = [...pg.children]
          .map((k) => [name(k), Math.round(k.getBoundingClientRect().height)] as const)
          .toSorted((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([n, h]) => `${n} ${h}px`);
        out.push({
          slug: src.dataset.slug ?? "",
          ratio: natural / room,
          over: Math.round(natural - room * 0.98),
          protrudes: protrudes.slice(0, 3),
          tallest,
        });
        host.remove();
      }
      return out;
    },
    { width: pageWidth, aspect: ASPECT },
  );
}

test("every page fits its box at full scale, with 2% to spare", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1700, height: 1200 });
  await openLoaded(page);
  // the order form is filled (twelve rows) and every item has its toggle
  await expect(page.locator("[data-order-form] [data-order-item]:not([hidden])")).toHaveCount(12);
  expect(await page.locator(".book-pages [data-wish-toggle]").count()).toBeGreaterThan(40);

  const problems: string[] = [];
  for (const width of WIDTHS) {
    for (const m of await measureAll(page, width)) {
      if (m.ratio > MAX) {
        problems.push(
          `${m.slug} @${width}px: content ${m.ratio.toFixed(3)} of its box, ${m.over}px over; tallest: ${m.tallest.join(", ")}`,
        );
      }
      if (m.protrudes.length) {
        problems.push(`${m.slug} @${width}px: sticks out: ${m.protrudes.join(", ")}`);
      }
    }
  }
  expect(problems).toEqual([]);
});

test("each Circle it toggle sits in its item's purchase row and adds no height", async ({
  browser,
}) => {
  const heights = async (javaScriptEnabled: boolean) => {
    const context = await browser.newContext({
      javaScriptEnabled,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("/2026/favorites/wes/");
    await page.evaluate(() => document.fonts.ready);
    const rows = await page
      .locator('.book-pages > [data-slug="wes"] .links')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    const loose = await page
      .locator(".book-pages [data-wish-toggle]")
      .evaluateAll((els) => els.filter((el) => !el.closest(".links [data-wish-slot]")).length);
    await context.close();
    return { rows, loose };
  };
  const withJs = await heights(true);
  const without = await heights(false);
  expect(withJs.loose).toBe(0);
  expect(withJs.rows.length).toBe(2);
  expect(withJs.rows).toEqual(without.rows);
});

// The centerfold's fit (whole legend, no hotspot under it) is checked against
// the fixture edition in centerfold.spec.ts: 2026 has none.

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1440, 700],
  [1240, 800],
] as const) {
  test(`no page is scaled to fit at ${width}×${height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height });
    await openLoaded(page);
    const scaled = new Set<string>();
    for (let i = 0; i < 60; i++) {
      for (const slug of await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".book-pages > .is-shown")]
          .filter((p) => p.style.getPropertyValue("--fit"))
          .map((p) => p.dataset.slug ?? ""),
      )) {
        scaled.add(slug);
      }
      if ((await page.locator(".pager .next").getAttribute("aria-disabled")) === "true") break;
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(".leaf, .lift, .fade-in")).toHaveCount(0);
    }
    expect(page.url()).toMatch(/\/back-cover\/$/);
    expect([...scaled]).toEqual([]);
  });
}

// The "Order by terminal" block is pinned to the foot of its page. If anything
// between it and the page becomes positioned, it pins to that instead and
// lands on top of the items.
for (const [width, height] of [
  [1440, 900],
  [800, 1000],
] as const) {
  test(`the order block sits below every item at ${width}×${height}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height });
    await page.goto("/2026/under-30/under-30-more/");
    const pageEl = page.locator('[data-slug="under-30-more"]');
    const block = pageEl.locator(".order-block");
    await expect(block).toBeVisible();
    const { blockTop, itemsBottom } = await pageEl.evaluate((el) => {
      const items = [...el.querySelectorAll<HTMLElement>("[data-item-id]")];
      return {
        blockTop: el.querySelector(".order-block")!.getBoundingClientRect().top,
        itemsBottom: Math.max(...items.map((i) => i.getBoundingClientRect().bottom)),
      };
    });
    expect(blockTop).toBeGreaterThanOrEqual(itemsBottom);
  });
}
