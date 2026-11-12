import { expect, test } from "./fixtures";

const VIEWS = ["teams", "injuries", "trades", "standings", "resumes", "spplus", "nfl", "insanity", "empire", "picks", "grid", "outlook"] as const;

for (const view of VIEWS) {
  test(`${view}: a short description and related links sit under the nav row, and nothing overflows sideways @phase3`, async ({ page }) => {
    await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
    await page.goto(`/?view=${view}&league=NFL`);
    const intro = page.locator(`.feature-intro[data-feature="${view}"]`);
    await expect(intro).toBeVisible();
    await expect(intro.locator(".fi-desc")).not.toBeEmpty();
    const related = intro.locator(".fi-related button");
    if (await related.count()) await expect(related.first()).toBeVisible();
    await page.waitForTimeout(600);
    const w = page.viewportSize()!.width;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w + 1);
  });
}

test("a related link opens that section, adds a history entry, and Back returns @phase3", async ({ page }) => {
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
  await page.goto("/?view=teams&league=NFL");
  const before = await page.evaluate(() => history.length);
  await page.locator('.feature-intro[data-feature="teams"] .fi-related button', { hasText: "Standings" }).click();
  await expect(page.locator('.feature-intro[data-feature="standings"]')).toBeVisible();
  expect(new URLSearchParams(page.url().split("?")[1]).get("view")).toBe("standings");
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  await page.goBack();
  await expect(page.locator('.feature-intro[data-feature="teams"]')).toBeVisible();
});

test("the board has no section intro, and Related to Dashboard opens the board @phase3", async ({ page }) => {
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.locator(".feature-intro")).toHaveCount(0);
  await page.goto("/?view=insanity&league=NFL");
  await page.locator('.feature-intro[data-feature="insanity"] .fi-related button', { hasText: "Watchability Dashboard" }).click();
  await expect(page.locator(".game-card, .board-heading").first()).toBeVisible();
  await expect(page.locator(".feature-intro")).toHaveCount(0);
});

test("standings column headings stay in view under the sticky bars while scrolling @phase3", async ({ page }) => {
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
  await page.goto("/?view=standings&league=NFL");
  const th = page.locator(".sd-table thead th").first();
  await expect(th).toBeVisible();
  expect(await th.evaluate((e) => getComputedStyle(e).position)).toBe("sticky");
  await page.evaluate(() => scrollTo(0, 700));
  await page.waitForTimeout(300);
  const box = await th.boundingBox();
  const row = await page.locator(".view-row").boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(row!.y + row!.height - 2); // just under the nav row, not behind it
  expect(box!.y).toBeLessThan(200);
});
