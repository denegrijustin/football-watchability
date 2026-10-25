import { expect, test } from "./fixtures";

test("a team's name or logo in the resumés opens its profile, for the NFL and for college", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-tab="resumes"]').click();
  await page.getByRole("button", { name: "NFL", exact: true }).click();
  const row = page.locator(".rs-row").first();
  const nflName = (await row.locator(".rs-name b").innerText()).trim();
  await row.locator(".rs-team .team-open.img").click(); // the logo
  await expect(page.locator('.view-switch [data-tab="nfl"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: nflName }).first()).toBeVisible();
  await page.locator('[data-tab="resumes"]').click();
  await page.getByRole("button", { name: "College (all FBS)" }).click();
  const crow = page.locator(".rs-row").first();
  const cfbName = (await crow.locator(".rs-name b").innerText()).trim();
  await crow.locator(".rs-name .team-open").click(); // the name
  await expect(page.locator('.view-switch [data-tab="spplus"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: cfbName }).first()).toBeVisible();
});

test("an opponent in a resumé opens that team's profile", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-tab="resumes"]').click();
  await page.getByRole("button", { name: "NFL", exact: true }).click();
  const g = page.locator(".rs-row").first().locator(".rs-g").first();
  const opp = (await g.getAttribute("title"))!.match(/(?:vs|at) ([A-Za-z0-9. ]+?)(?: \(|,)/)![1].trim();
  await g.locator(".team-open").click();
  await expect(page.locator('.view-switch [data-tab="nfl"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: opp }).first()).toBeVisible();
});

test("a team on a final-score tile opens its profile, and the rest of the tile still opens the game", async ({ page }) => {
  await page.goto("/");
  const tile = page.locator("section.fs .fs-tile").first();
  await expect(tile).toBeVisible();
  await tile.locator(".fs-abbr").first().click();
  await expect(page.locator("dialog.gc")).toHaveCount(0);
  await expect(page.locator('.view-switch [data-tab="nfl"][aria-pressed="true"], .view-switch [data-tab="spplus"][aria-pressed="true"]')).toHaveCount(1);
  await page.locator('.view-switch [data-tab="board"]').click();
  await page.locator("section.fs .fs-tile .fs-open").first().click();
  await expect(page.locator("dialog.gc")).toBeVisible();
});

test("a team on a game card opens its profile instead of toggling the card", async ({ page }) => {
  await page.goto("/?league=NFL");
  const card = page.locator(".game-card").first();
  await expect(card).toBeVisible();
  await card.locator(".cc-team .team-open").first().click();
  await expect(page.locator('.view-switch [data-tab="nfl"]')).toHaveAttribute("aria-pressed", "true");
});
