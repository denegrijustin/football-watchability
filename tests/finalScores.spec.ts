import { expect, test } from "./fixtures";

test.describe("the final scores strip", () => {
  test("it is open by default as a grid of scores with FPI ranks, and a score opens its Game Center", async ({ page }) => {
    await page.goto("/");
    const fs = page.locator("section.fs");
    const bar = page.locator(".fs-toggle");
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-expanded", "true"); // open by default
    await expect(fs).toBeVisible();
    const tiles = fs.locator(".fs-tile");
    expect(await tiles.count()).toBeGreaterThan(0);
    await expect(tiles.first().locator(".fs-row")).toHaveCount(2);
    await tiles.first().locator(".fs-open").click({ position: { x: 3, y: 3 } });
    await expect(page.locator("dialog.gc")).toBeVisible();
  });

  test("the open or closed choice is remembered, and the page does not scroll sideways", async ({ page }) => {
    await page.goto("/");
    await page.locator(".fs-toggle").click(); // close it
    await page.reload();
    await expect(page.locator(".fs-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("it follows the league filter", async ({ page }) => {
    await page.goto("/?league=NFL");
    const n = await page.locator("section.fs .fs-tile").count();
    await page.goto("/");
    const all = await page.locator("section.fs .fs-tile").count();
    expect(all).toBeGreaterThanOrEqual(n);
  });

  test("FPI ranks are on every tile, and an upset stands out and comes first", async ({ page }) => {
    await page.goto("/");
    const tiles = page.locator("section.fs .fs-tile");
    await expect(tiles.first()).toBeVisible();
    await expect(page.locator("section.fs .fs-fpi").first()).toBeVisible();
    // an upset is a team ranked 10+ places worse by FPI beating the better one
    const info = await tiles.evaluateAll((els) => els.map((e) => ({ up: e.classList.contains("upset"), ranks: [...e.querySelectorAll(".fs-fpi")].map((x) => Number(x.textContent)), scores: [...e.querySelectorAll(".fs-row b")].map((x) => Number(x.textContent)) })));
    for (const t of info) {
      const [a, h] = t.scores, [ra, rh] = t.ranks;
      const expected = ra && rh && a !== h && (a > h ? ra - rh : rh - ra) >= 10;
      expect(t.up, JSON.stringify(t)).toBe(!!expected);
    }
    const firstPlain = info.findIndex((t) => !t.up);
    if (firstPlain >= 0) expect(info.slice(firstPlain).every((t) => !t.up)).toBe(true); // upsets lead
    if (info.some((t) => t.up)) {
      await expect(page.locator("section.fs .fs-tile.upset").first()).toHaveCSS("border-top-color", "rgb(224, 165, 38)");
      await expect(page.locator("section.fs .fs-tile.upset .fs-tag em").first()).toHaveText("Upset");
    }
  });
});
