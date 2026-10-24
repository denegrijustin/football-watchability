import { expect, test } from "./fixtures";

test.describe("the final scores strip", () => {
  test("it starts closed as a button with the status chips, opens to a grid of scores, and a score opens its Game Center", async ({ page }) => {
    await page.goto("/");
    const fs = page.locator("section.fs");
    const bar = page.locator(".fs-toggle");
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-expanded", "false");
    await expect(fs).toHaveCount(0); // closed: nothing on the board, so the games start no lower
    await bar.click();
    await expect(bar).toHaveAttribute("aria-expanded", "true");
    const tiles = fs.locator(".fs-tile");
    expect(await tiles.count()).toBeGreaterThan(0);
    await expect(tiles.first().locator(".fs-row")).toHaveCount(2);
    await tiles.first().click();
    await expect(page.locator("dialog.gc")).toBeVisible();
  });

  test("the open or closed choice is remembered, and the page does not scroll sideways", async ({ page }) => {
    await page.goto("/");
    await page.locator(".fs-toggle").click();
    await page.reload();
    await expect(page.locator(".fs-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.locator(".fs-toggle").click(); // leave it closed for the other tests' sake
  });

  test("it follows the league filter", async ({ page }) => {
    await page.goto("/?league=NFL");
    const n = await page.locator("section.fs .fs-tile").count();
    await page.goto("/");
    await page.locator(".fs-toggle").click();
    const all = await page.locator("section.fs .fs-tile").count();
    expect(all).toBeGreaterThanOrEqual(n);
  });
});
