import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { parse } from "yaml";

const DIST = resolve(import.meta.dirname, "../../dist");
const CONTENT = resolve(import.meta.dirname, "../../content/2026");
const WIDTHS = [1360, 820, 390] as const;

/** Every page path in the book, from the built cover file. */
const PATHS = [
  ...readFileSync(join(DIST, "2026/index.html"), "utf8").matchAll(
    /data-slug="([^"]+)"[^>]*?data-path="([^"]+)"/g,
  ),
].map((m) => ({ slug: m[1]!, path: m[2]! }));

/**
 * The overflow check: no visible element inside an open page reaches past the
 * page's edges. Elements clipped by an inner container (a scroll strip, a
 * stage with overflow hidden) count only for the part that shows; the cover
 * art bleeds off the page by design.
 */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const p of document.querySelectorAll<HTMLElement>(
      ".book-pages > .is-current, html.m-book .book-pages > .is-shown",
    )) {
      if (getComputedStyle(p).display === "none") continue;
      const r = p.getBoundingClientRect();
      for (const el of p.querySelectorAll("*")) {
        if (el.closest(".sr-only, .cover .art-img")) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.opacity === "0" || cs.display === "none") continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        // Clip to every ancestor inside the page that hides its overflow.
        let clipped = { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
        for (let a = el.parentElement; a && a !== p; a = a.parentElement) {
          const box = getComputedStyle(a);
          if (box.overflowX !== "visible" || box.overflowY !== "visible") {
            const c = a.getBoundingClientRect();
            clipped = {
              left: Math.max(clipped.left, c.left),
              right: Math.min(clipped.right, c.right),
              top: Math.max(clipped.top, c.top),
              bottom: Math.min(clipped.bottom, c.bottom),
            };
          }
        }
        if (clipped.right <= clipped.left || clipped.bottom <= clipped.top) continue;
        if (
          clipped.right > r.right + 1 ||
          clipped.left < r.left - 1 ||
          clipped.bottom > r.bottom + 1 ||
          clipped.top < r.top - 1
        ) {
          out.push(`${p.dataset.slug}: <${el.tagName.toLowerCase()} class="${el.className}">`);
        }
      }
    }
    return out;
  });
}

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });

    for (const { slug, path } of PATHS) {
      test(`${slug} renders without overflow`, async ({ page }) => {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        const current = page.locator(`.book-pages > [data-slug="${slug}"]`);
        await expect(current).toBeVisible();
        await expect(current).toHaveClass(/is-current/);
        // Only the open page (and its spread partner in book mode) shows; the
        // phone feed shows every page.
        if (width >= 640) {
          const shown = await page
            .locator(".book-pages > [data-slug]")
            .evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length);
          expect(shown).toBeLessThanOrEqual(2);
        }
        expect(await overflowing(page)).toEqual([]);
      });
    }
  });
}

test("the reading mode follows the viewport", async ({ browser }) => {
  for (const [width, mode] of [
    [1360, "m-book"],
    [820, "m-single"],
    [390, "m-scroll"],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto("/2026/favorites/wes/");
    await expect(page.locator("html")).toHaveClass(new RegExp(mode));
    // Book mode opens the whole spread: page 4 (left) with page 5 (right);
    // single mode the page; the phone feed shows every page.
    const visible = await page
      .locator(".book-pages > .page")
      .evaluateAll((els) =>
        els.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.dataset.slug),
      );
    if (mode === "m-scroll") expect(visible.length).toBeGreaterThan(30);
    else expect(visible).toEqual(mode === "m-book" ? ["favorites", "wes"] : ["wes"]);
    await page.close();
  }
});

test("without JavaScript the current page renders and navigation is plain links", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/2026/favorites/niki/");
  await expect(page.locator('[data-slug="niki"]')).toBeVisible();
  await expect(page.locator('[data-slug="wes"]')).toBeHidden();
  await page.locator(".pager a.next").click();
  await expect(page).toHaveURL(/\/2026\/favorites\/randy\/$/);
  await expect(page.locator('[data-slug="randy"]')).toBeVisible();
  await page.locator('.tabs a[data-section="tech"]').click();
  await expect(page).toHaveURL(/\/2026\/tech\/$/);
  await context.close();
});

test("every item block carries its item id", async ({ page }) => {
  await page.goto("/2026/");
  const ids = await page
    .locator("[data-item-id]")
    .evaluateAll((els) => new Set(els.map((e) => (e as HTMLElement).dataset.itemId)).size);
  const onPages = new Set(
    (
      parse(readFileSync(join(CONTENT, "book.yaml"), "utf8")) as {
        pages: { items?: { item: string }[] }[];
      }
    ).pages.flatMap((p) => (p.items ?? []).map((i) => i.item)),
  );
  expect(ids).toBeGreaterThanOrEqual(onPages.size);
});

test.describe("purchase links", () => {
  const items = readdirSync(join(CONTENT, "items")).map(
    (f) =>
      parse(readFileSync(join(CONTENT, "items", f), "utf8")) as {
        id: number;
        name: string;
        buyLink?: string;
        makerLink?: string;
      },
  );

  test("items with a buy link render it; items without render the placeholder", async ({
    page,
  }) => {
    await page.goto("/2026/");
    let checked = 0;
    for (const item of items) {
      const blocks = page.locator(`[data-links="${item.id}"]`);
      const count = await blocks.count();
      if (count === 0) continue;
      checked++;
      for (let i = 0; i < count; i++) {
        const block = blocks.nth(i);
        if (item.buyLink) {
          const buy = block.locator("a.buy");
          await expect(buy, item.name).toHaveAttribute("href", item.buyLink);
          await expect(buy).toHaveAttribute("rel", "noopener sponsored");
          await expect(buy).toHaveAttribute("target", "_blank");
          await expect(block.locator('[data-missing="buy"]')).toHaveCount(0);
        } else {
          await expect(block.locator("a.buy"), item.name).toHaveCount(0);
          await expect(block.locator('[data-missing="buy"]')).toHaveCount(1);
        }
        if (item.makerLink) {
          const maker = block.locator("a.maker");
          await expect(maker, item.name).toHaveAttribute("href", item.makerLink);
          await expect(maker).toHaveAttribute("rel", "noopener");
          await expect(maker).toHaveAttribute("target", "_blank");
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  test("links have touch targets of at least 44px on a phone", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.goto("/2026/favorites/wes/");
    const boxes = await page
      .locator('[data-slug="wes"] .links a')
      .evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).map((r) => [r.width, r.height]),
      );
    expect(boxes.length).toBeGreaterThan(0);
    for (const [w, h] of boxes) {
      expect(w).toBeGreaterThanOrEqual(44);
      expect(h).toBeGreaterThanOrEqual(44);
    }
    await page.close();
  });

  test("the order form carries the affiliate disclosure", async ({ page }) => {
    const site = parse(readFileSync(join(CONTENT, "site.yaml"), "utf8")) as {
      links: { disclosure: string };
    };
    await page.goto("/2026/back/order-form/");
    await expect(page.locator('[data-slug="order-form"] .disclosure')).toHaveText(
      site.links.disclosure,
    );
  });
});
