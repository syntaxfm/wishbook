import { expect, test, type Page } from "@playwright/test";
import { encodeWishlist } from "../../src/lib/wishlist-codec";

/**
 * The wish list (circle toggles, order form, share links, the shared-list
 * page), ⌘K search, and the printed order form.
 */

const KEY = "wishbook:2026:wishlist";
// Content ids: 1 Silicone USB-C Cables (no buy link yet), 3 USB Power Meter,
// 36 AGRO jerky (has a buy link), 49 the grouse (no price).
const JERKY_BUY = "https://link.amazon/B0hR52fk5";

/** Starts a page with this edition's wish list already set. */
async function withList(page: Page, ids: number[]): Promise<void> {
  await page.addInitScript(
    ([key, list]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key as string, JSON.stringify(list));
        sessionStorage.setItem("seeded", "1");
      }
    },
    [KEY, ids] as const,
  );
}

const shownOrderIds = (page: Page) =>
  page
    .locator("[data-order-item]:not([hidden])")
    .evaluateAll((rows) => rows.map((r) => Number((r as HTMLElement).dataset.orderItem)));

test("circle 3 items, share the link, and the same 3 open in a new browser", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await page.goto("/2026/favorites/wes/");
  const toggles = page.locator('.book-pages > [data-slug="wes"] [data-wish-toggle]');
  await expect(toggles.first()).toBeVisible();
  const ids: number[] = [];
  for (const i of [0, 1, 3]) {
    const toggle = toggles.nth(i);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    ids.push(Number(await toggle.getAttribute("data-wish-toggle")));
  }
  await expect(page.locator('.book-pages > [data-slug="wes"] .is-wished')).toHaveCount(3);
  await expect(page.locator("[data-wish-count]")).toHaveText("3");
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)).toEqual(ids);

  // The count links to the order form (a jump), which lists them in order.
  await page.locator("[data-wish-link]").click();
  await expect(page).toHaveURL(/\/2026\/back\/order-form\/$/);
  expect(await shownOrderIds(page)).toEqual(ids);
  await expect(page.locator("[data-order-total]")).toContainText("est.");

  await page.locator("[data-share]").click();
  await expect(page.locator("[data-share-copied]")).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/2026\/wishlist\/\?w=[A-Za-z0-9_-]+$/);
  await context.close();

  const other = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const shared = await other.newPage();
  await shared.goto(url);
  const cards = shared.locator("[data-wl-item]:not([hidden])");
  await expect(cards).toHaveCount(3);
  const shown = await cards.evaluateAll((els) =>
    els.map((e) => Number((e as HTMLElement).dataset.wlItem)),
  );
  expect(shown.toSorted((a, b) => a - b)).toEqual(ids.toSorted((a, b) => a - b));
  // The visitor's own list is untouched until they add these.
  expect(await shared.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  await other.close();
});

test("a 2026 code at /2026/wishlist/ shows those 2026 items and can be added", async ({ page }) => {
  await page.goto(`/2026/wishlist/?w=${encodeWishlist([1, 49])}`);
  await expect(page.locator("html")).toHaveAttribute("data-edition", "2026");
  await expect(page.locator("[data-wl-item]:not([hidden]) .itemname")).toHaveText([
    "Silicone USB-C Cables",
    "A Taxidermied Grouse",
  ]);
  await expect(page.locator("[data-wl-empty]")).toBeHidden();
  await page.locator("[data-wl-add]").click();
  await expect(page.locator("[data-wl-added]")).toBeVisible();
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)).toEqual([1, 49]);
  await expect(page.locator("[data-wl-start]")).toHaveAttribute("href", "/2026/");
});

test("the wish-list page has its own meta and ignores unknown or broken codes", async ({
  page,
}) => {
  await page.goto(`/2026/wishlist/?w=${encodeWishlist([3, 999])}`);
  await expect(page.locator("[data-wl-item]:not([hidden])")).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://wishbook.syntax.fm/2026/wishlist/",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://wishbook.syntax.fm/2026/og/wishlist.png",
  );

  for (const code of ["", "%%%not-a-code", "B"]) {
    await page.goto(`/2026/wishlist/?w=${code}`);
    await expect(page.locator("[data-wl-item]:not([hidden])")).toHaveCount(0);
    await expect(page.locator("[data-wl-empty]")).toBeVisible();
    await expect(page.locator("[data-wl-add]")).toBeHidden();
  }
});

test("order form rows and wish-list cards show Buy links or the placeholder", async ({ page }) => {
  await withList(page, [36, 1]);
  await page.goto("/2026/back/order-form/");
  expect(await shownOrderIds(page)).toEqual([36, 1]);
  await expect(page.locator('[data-order-item="36"] a.buy')).toHaveAttribute("href", JERKY_BUY);
  await expect(page.locator('[data-order-item="1"] .tba[data-missing="buy"]')).toBeVisible();

  await page.goto(`/2026/wishlist/?w=${encodeWishlist([36, 1])}`);
  await expect(page.locator('[data-wl-item="36"] a.buy')).toHaveAttribute("href", JERKY_BUY);
  await expect(page.locator('[data-wl-item="1"] .tba[data-missing="buy"]')).toBeVisible();
});

test("an unpriced item stars the total and shows the footnote", async ({ page }) => {
  await withList(page, [49, 3]);
  await page.goto("/2026/back/order-form/");
  await expect(page.locator("[data-order-total]")).toHaveText(/^\d+\.\d\dest\.\*$/);
  await expect(page.locator("[data-order-unpriced]")).toBeVisible();
});

test("circle toggles work from the keyboard and sync every copy of an item", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto("/2026/favorites/wes/");
  const toggle = page.locator('.book-pages > [data-slug="wes"] [data-wish-toggle]').first();
  const id = await toggle.getAttribute("data-wish-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveAccessibleName(/^My Wish List: /);
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText("Want!!");
  // Every other copy of the item (other pages) is circled too.
  for (const other of await page.locator(`[data-wish-toggle="${id}"]`).all()) {
    await expect(other).toHaveAttribute("aria-pressed", "true");
  }
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-wish-count]")).toBeHidden();
});

test("centerfold hotspots stay links, without toggles", async ({ page }) => {
  await page.goto("/2026/centerfold/");
  await expect(page.locator("a.hot [data-wish-toggle]")).toHaveCount(0);
  await expect(page.locator("a.hot.wishable")).toHaveCount(0);
});

test("lists are kept per edition", async ({ page }) => {
  await page.goto("/2026/favorites/wes/");
  await page.locator('.book-pages > [data-slug="wes"] [data-wish-toggle]').first().click();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual([KEY]);
});

for (const width of [1360, 390]) {
  test(`⌘K search for "grouse" opens the grouse page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/2026/back/order-form/");
    const dialog = page.locator("dialog[data-search]");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(dialog).toBeVisible();
    const input = page.locator("[data-search-input]");
    await expect(input).toBeFocused();
    await input.fill("grouse");
    const first = page.locator('[role="option"]').first();
    await expect(first).toContainText("A Taxidermied Grouse");
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(input).toHaveAttribute("aria-activedescendant", "search-opt-0");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/2026\/wild-card\/grouse\/$/);
    await expect(page.locator('.book-pages > [data-slug="grouse"]')).toHaveClass(/is-current/);
  });
}

test("search is fully keyboard driven", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/");
  const opener = page.locator("[data-search-open]");
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog[data-search]");
  await expect(dialog).toBeVisible();
  await page.keyboard.type("anker");
  const options = page.locator('[role="option"]');
  expect(await options.count()).toBeGreaterThan(1);
  const input = page.locator("[data-search-input]");
  await page.keyboard.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", "search-opt-1");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(options.last()).toHaveAttribute("aria-selected", "true");
  // Nothing found: a message, no options.
  await input.fill("zzzzqqq");
  await expect(options).toHaveCount(0);
  await expect(page.locator("[data-search-none]")).toBeVisible();
  // Esc closes and focus returns to the opener; the page didn't change.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(/\/2026\/$/);
});

test("print shows only the paper order form, with buy URLs written out", async ({ page }) => {
  await withList(page, [36, 1]);
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/2026/favorites/wes/");
  await page.emulateMedia({ media: "print" });
  const sheet = page.locator("[data-print-sheet]");
  await expect(sheet).toBeVisible();
  await expect(page.locator(".book")).toBeHidden();
  await expect(page.locator(".wishtools")).toBeHidden();
  const rows = sheet.locator("[data-print-rows] tr:not(.blank)");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("AGRO POWER Vegan Jerky Sticks");
  await expect(rows.nth(0)).toContainText(JERKY_BUY);
  await expect(rows.nth(1)).toContainText("Silicone USB-C Cables");
  await expect(rows.nth(1)).toContainText("Buy link TBA");
  await expect(sheet.locator("[data-print-total]")).toContainText("est.");
  await expect(sheet).toContainText("SANTA CLAUS");
  await expect(sheet.locator("[data-print-url]")).toContainText("/2026/wishlist/?w=");
  // Only the sheet is visible: every other body child is hidden.
  const visible = await page.evaluate(() =>
    [...document.body.children]
      .filter((el) => el.checkVisibility())
      .map((el) => el.getAttribute("class") ?? el.tagName),
  );
  expect(visible).toEqual(["print-sheet"]);
  await page.emulateMedia({ media: "screen" });
  await expect(sheet).toBeHidden();
});

test("the print button prints the order form", async ({ page }) => {
  await page.goto("/2026/back/order-form/");
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => (window as unknown as { printed: number }).printed++;
  });
  await page.locator("[data-print]").click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});
