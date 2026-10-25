import { expect, test } from "./fixtures";
import { openSppTab } from "./helpers/spp";
import { stubFinals } from "./helpers/finals";

test.beforeEach(async ({ page }) => { await stubFinals(page); });

const open = async (page: import("@playwright/test").Page, league: "NFL" | "CFB", phone = false) => {
  await page.goto(`/?league=${league}`);
  if (phone) { await page.locator(".view-switch .tab-more").click(); await page.locator(`.view-switch [data-tab="${league === "NFL" ? "nfl" : "spplus"}"]`).click(); }
  else await page.getByRole("button", { name: league === "NFL" ? "NFL+" : "CFB SP+" }).click();
  await openSppTab(page, "Movement");
  await expect(page.locator(".spp .mv-table tbody tr").first()).toBeVisible({ timeout: 15_000 });
};

test("NFL+ movement: risers and fallers, then all 32 teams with the change and a trend", async ({ page }) => {
  await open(page, "NFL");
  const lists = page.locator(".spp .mv-list");
  await expect(lists).toHaveCount(2);
  await expect(lists.first().locator("h3")).toHaveText("Risers");
  await expect(lists.nth(1).locator("h3")).toHaveText("Fallers");
  await page.getByRole("button", { name: /Show all 32 teams/ }).click();
  await expect(page.locator(".spp .mv-table tbody tr")).toHaveCount(32);
  // every row has its rank, change, a trend line, and a compare tick
  const row = page.locator(".spp .mv-table tbody tr").first();
  await expect(row.locator("td.num").first()).toHaveText("1");
  await expect(row.locator("svg.mv-spark")).toBeVisible();
  await expect(row.locator('input[type="checkbox"]')).toBeVisible();
  // risers moved up, fallers down
  for (const t of await lists.first().locator(".delta").allInnerTexts()) expect(t).toMatch(/▲/);
  for (const t of await lists.nth(1).locator(".delta").allInnerTexts()) expect(t).toMatch(/▼/);
});

test("the window and the metric change the lists, and picked teams are compared on a chart", async ({ page }) => {
  await open(page, "NFL");
  await page.getByRole("group", { name: "Change over" }).getByRole("button", { name: "Season" }).click();
  await expect(page.getByRole("group", { name: "Change over" }).getByRole("button", { name: "Season" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Rank shown" }).getByRole("button", { name: "Defense" }).click();
  await expect(page.locator(".spp .phead .sub").first()).toContainText("defense rank");
  await expect(page.locator(".spp h2", { hasText: /^Compare$/ })).toHaveCount(0);
  const ticks = page.locator('.spp .mv-table input[type="checkbox"]');
  await ticks.nth(0).check();
  await ticks.nth(1).check();
  const chart = page.locator('.spp svg[aria-label="Line chart of defense rank by week"]');
  await expect(chart).toBeVisible();
  // a fifth tick drops the oldest: at most four teams are compared
  await ticks.nth(2).check(); await ticks.nth(3).check(); await ticks.nth(4).check();
  expect(await page.locator('.spp .mv-table input[type="checkbox"]:checked').count()).toBe(4);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(chart).toHaveCount(0);
});

test("SP+ movement lists every FBS team and sorts by change", async ({ page }) => {
  await open(page, "CFB");
  await page.getByRole("button", { name: /Show all 1\d\d teams/ }).click();
  expect(await page.locator(".spp .mv-table tbody tr").count()).toBeGreaterThan(100);
  await page.getByRole("group", { name: "Sort" }).getByRole("button", { name: "By change" }).click();
  const deltas = await page.locator(".spp .mv-table tbody tr td:nth-child(3)").allInnerTexts();
  const n = (t: string) => (t.includes("▲") ? Number(t.replace(/\D/g, "")) : t.includes("▼") ? -Number(t.replace(/\D/g, "")) : 0);
  const vals = deltas.map(n);
  expect(vals).toEqual([...vals].sort((a, b) => b - a)); // biggest riser first
});

test("@phone the movers fit a phone without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "NFL", true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
