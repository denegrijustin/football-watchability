import { expect, test } from "./fixtures";

test("the Teams tab lists every team and opens one team's page, with its resumé, ratings and performance, and injuries", async ({ page }) => {
  await page.goto("/?league=NFL");
  await page.locator('[data-tab="teams"]').click();
  await page.getByRole("button", { name: "NFL", exact: true }).click();
  const picks = page.locator(".tm-pick");
  await expect(picks.first()).toBeVisible({ timeout: 15_000 });
  expect(await picks.count()).toBeGreaterThanOrEqual(30);
  await page.getByPlaceholder("Find a team or conference").fill("chiefs");
  await expect(picks).toHaveCount(1);
  await picks.first().click();
  const page_ = page.locator('section.tm[aria-label$="team page"]');
  await expect(page_.getByRole("heading", { name: "Kansas City Chiefs" })).toBeVisible();
  await expect(page_.locator(".rs-row")).toHaveCount(1); // the resumé
  await page_.getByRole("button", { name: "Ratings & performance" }).click();
  await expect(page.getByTestId("nfl-host")).toBeAttached();
  await page_.getByRole("button", { name: "Injuries" }).click();
  await expect(page_.locator(".ij")).toBeVisible();
  await page_.getByRole("button", { name: /All teams/ }).click();
  await expect(page.locator(".tm-pick").first()).toBeVisible();
});

test("Insanity, Resumés and Injuries are all still one tap away", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["insanity", "resumes", "injuries", "standings", "outlook"]) await expect(page.locator(`[data-tab="${tab}"]`)).toBeAttached();
});
