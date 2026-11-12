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
  expect(box!.y).toBeLessThan(260);
});

test("standings: find a team, order a stat column with a visible direction, and restore the standings order @phase3", async ({ page }) => {
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
  await page.goto("/?view=standings&league=NFL");
  const table = page.locator(".sd-table").first();
  await expect(table).toBeVisible();
  // order by Diff: highest first, then lowest first, then back
  const diffBtn = table.locator("th button", { hasText: "Diff" });
  if (await diffBtn.isVisible()) {
    const diffs = async () => (await table.locator("tbody tr td:nth-last-child(2)").allInnerTexts()).map((t) => Number(t.replace("+", "").replace("–", "0")));
    await diffBtn.click();
    await expect(table.locator("th[aria-sort=descending]")).toHaveCount(1);
    const d = await diffs();
    expect(d).toEqual([...d].sort((a, b) => b - a));
    await diffBtn.click();
    await expect(table.locator("th[aria-sort=ascending]")).toHaveCount(1);
    await diffBtn.click();
    await expect(table.locator("th[aria-sort=descending], th[aria-sort=ascending]")).toHaveCount(0);
  }
  // search
  const name = (await page.locator(".sd-table tbody th b").first().innerText()).trim();
  await page.getByPlaceholder("Find a team").fill(name.slice(0, 4));
  await expect(page.locator(".sd-table tbody tr").first()).toContainText(name.slice(0, 4));
  await page.getByPlaceholder("Find a team").fill("zzzzzz");
  await expect(page.locator(".ol-note")).toContainText("No");
});

test("a team page opens on its upcoming games, links to related sections, and a game opens its Game Center @phase3", async ({ page }) => {
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
  await page.goto("/?view=standings&league=NFL");
  await page.locator(".sd-table tbody th b a, .sd-table tbody th b button").first().click();
  await expect(page.locator(".tm-head h2")).toBeVisible();
  await expect(page.locator(".tm-links button", { hasText: "Standings" })).toBeVisible();
  await expect(page.locator(".tm-sections button[aria-pressed=true]")).toHaveText("Upcoming games");
  const go = page.locator(".tm-games li button", { hasText: "Game Center" }).first();
  if (await go.count()) {
    await go.click();
    await expect(page.locator("dialog.gc[open]")).toBeVisible();
  } else await expect(page.locator(".rs-none")).toBeVisible();
});

test("the board's Completed holds this week's finals only; earlier weeks wait behind 'Earlier weeks' and are not counted @weekly", async ({ page }) => {
  const { readFileSync } = await import("node:fs");
  const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
  const results = JSON.parse(readFileSync("src/data/results.json", "utf8")).games as { week: string; league: string }[];
  const league = "CFB";
  const current = results.filter((r) => r.week === slate.period && r.league === league).length;
  const earlier = results.filter((r) => r.week !== slate.period && r.league === league).length;
  test.skip(earlier === 0, "no earlier-week finals in the archive");
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
  await page.goto(`/?league=${league}&status=final`);
  const weekHeads = page.locator(".board-section.final .week-block .week-head h4");
  // only this week's block is open by default
  const heads = await weekHeads.allInnerTexts();
  expect(heads.every((h) => h === slate.period)).toBe(true);
  await expect(page.locator('[data-status-chip="final"] b')).toHaveText(String(current));
  const more = page.getByRole("button", { name: /^Earlier weeks/ });
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.locator(".board-section.final .week-block .week-head h4", { hasText: /Nov\. 3/ }).first()).toBeVisible();
  await expect(page.locator('[data-status-chip="final"] b')).toHaveText(String(current)); // still not counted
});
