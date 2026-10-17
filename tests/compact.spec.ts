import { expect, test } from "./fixtures";

// The top of the page is mostly controls; keep them to a few slim rows so the games start high on a phone.
test("@phone on a phone the controls take few rows and the first game starts high", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?league=CFB");
  const card = page.locator(".game-card").first();
  await expect(card).toBeVisible();
  const top = await card.evaluate((e) => Math.round(e.getBoundingClientRect().top));
  expect(top, "the first card should begin within the top third of the screen").toBeLessThan(330);
  // Filters are one scrolling row, not three wrapped ones.
  const dock = await page.locator(".filter-dock").boundingBox();
  expect(dock!.height).toBeLessThan(72);
  // The sections live in a tab bar fixed to the bottom of the screen, four tabs and More.
  const bar = await page.locator(".view-switch").boundingBox();
  expect(Math.round(bar!.y + bar!.height)).toBeGreaterThan(844 - 4);
  await expect(page.locator(".view-switch button:visible")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  // Every filter is still reachable, in the Filters sheet.
  await page.getByRole("button", { name: /^Filters/ }).click();
  for (const name of ["League", "Status", "Day", "Watchability", "Conference"]) await expect(page.getByLabel(name, { exact: true })).toBeAttached();
  await expect(page.getByLabel("Search teams, channels or locations")).toBeAttached();
});

test("How to read a card is a button in the header that opens its guide over the page", async ({ page }) => {
  await page.goto("/?league=NFL");
  const help = page.locator(".site-header .how-to");
  await expect(help).toBeVisible();
  const guide = help.locator(".how-pop");
  await expect(guide).toBeHidden();
  await help.getByLabel("How to read a card").click();
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("Rank line");
  await expect(guide).toContainText("Must watch");
  // It floats over the board instead of pushing it down.
  const before = await page.locator(".filter-dock").evaluate((e) => Math.round(e.getBoundingClientRect().top));
  expect(before).toBeLessThan(140);
  await help.getByLabel("How to read a card").click();
  await expect(guide).toBeHidden();
});

test("on a desktop the first game starts in the upper third of the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?league=CFB");
  const card = page.locator(".game-card").first();
  await expect(card).toBeVisible();
  expect(await card.evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBeLessThan(300);
});
