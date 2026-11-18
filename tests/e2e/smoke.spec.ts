import { expect, test } from "@playwright/test";

test("home page is the current edition's cover", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Syntax WishBook");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://wishbook.syntax.fm/2026/",
  );
});

test("edition cover renders at /2026/", async ({ page }) => {
  await page.goto("/2026/");
  await expect(page).toHaveTitle("Syntax WishBook");
});
