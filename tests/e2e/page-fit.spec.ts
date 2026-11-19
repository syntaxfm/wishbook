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
  expect(withJs.rows.length).toBe(4);
  expect(withJs.rows).toEqual(without.rows);
});

/** The centerfold in the live book: it fits, its legend isn't cut, and no hotspot hides under it. */
async function centerfold(page: Page) {
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

for (const [width, height, mode] of [
  [1920, 1080, "m-book"],
  [1440, 900, "m-book"],
  [1366, 768, "m-book"],
  [820, 1000, "m-single"],
  [700, 900, "m-single"],
] as const) {
  test(`the centerfold fits with its whole legend at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/2026/centerfold/");
    await expect(page.locator("html")).toHaveClass(new RegExp(mode));
    await page.evaluate(() => document.fonts.ready);
    const cf = await centerfold(page);
    expect(cf.fit).toBe(false);
    expect(cf.over).toBeLessThanOrEqual(1);
    expect(cf.legendCut).toBeLessThanOrEqual(1);
    expect(cf.legendOut).toBeLessThanOrEqual(1);
    expect(cf.covered).toEqual([]);
  });
}

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
