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
  await expect(page_.locator(".tm-sections button[aria-pressed=true]")).toHaveText("Upcoming games"); // the team page opens on its games
  await page_.getByRole("button", { name: "Résumé", exact: true }).click();
  await expect(page_.locator(".rs-row")).toHaveCount(1); // the resumé
  await page_.getByRole("button", { name: "Ratings", exact: true }).click();
  await expect(page.getByTestId("nfl-host")).toBeAttached();
  await page_.getByRole("button", { name: "Injury report" }).click();
  await expect(page_.locator(".ij")).toBeVisible();
  await page_.getByRole("button", { name: /All teams/ }).click();
  await expect(page.locator(".tm-pick").first()).toBeVisible();
});

test("Insanity, Resumés and Injuries are all still one tap away", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["insanity", "resumes", "injuries", "standings"]) await expect(page.locator(`[data-tab="${tab}"]`)).toBeAttached();
});

test("the Picks tab holds the picks and parlays, the simulator, the Upset Alert Meter and the full ATS tracker", async ({ page }) => {
  await page.goto("/?league=NFL");
  await page.locator('[data-tab="picks"]').evaluate((b) => (b as HTMLElement).click());
  const area = page.getByRole("group", { name: "Picks area" });
  await expect(area.getByRole("button")).toHaveText(["Picks & parlays", "Simulator", "Upset Alert Meter", "Full ATS tracker"]);
  await area.getByRole("button", { name: "Upset Alert Meter" }).click();
  await expect(page.locator(".um, [aria-label*='Upset']").first()).toBeVisible();
  await area.getByRole("button", { name: "Full ATS tracker" }).click();
  await expect(page.getByTestId("nfl-host")).toBeAttached();
  await page.getByRole("group", { name: "Tracker league" }).getByRole("button", { name: "College SP+" }).click();
  await expect(page.getByTestId("spplus-host")).toBeAttached({ timeout: 15_000 });
});

test("a team page has a Full Schedule: finished games with the result and score, then the games to come with the time, the network and TBD", async ({ page }) => {
  const g = (i: number, over: Record<string, unknown>) => ({ id: String(900 + i), date: `2026-09-${String(10 + i).padStart(2, "0")}T18:00Z`, week: i, venue: "vs", opp: { id: String(i), name: `Opponent ${i}`, full: `Opponent ${i} U`, abbr: `O${i}`, logo: null, rank: null }, done: true, live: false, result: "W", pts: 30, oppPts: 10, timeValid: true, network: "ESPN", detail: null, ...over });
  const games = [g(1, {}), g(2, { venue: "at", result: "L", pts: 14, oppPts: 21 }), g(3, { done: false, result: null, pts: null, oppPts: null, network: "NBC" }), g(4, { done: false, result: null, pts: null, oppPts: null, timeValid: false, network: null })];
  await page.route("**/api/team-schedule**", (r) => r.fulfill({ json: { team: { id: "16", name: "Kansas City", abbr: "KC" }, games } }));
  await page.goto("/?league=NFL");
  await page.locator('[data-tab="teams"]').click();
  await page.getByRole("button", { name: "NFL", exact: true }).click();
  await expect(page.locator(".tm-pick").first()).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("Find a team or conference").fill("chiefs");
  await page.locator(".tm-pick").first().click();
  const panel = page.locator('section.tm[aria-label$="team page"]');
  await panel.getByRole("button", { name: "Full Schedule" }).click();
  const sched = panel.locator("section.ts");
  await expect(sched.getByRole("heading", { name: /Full Schedule/ })).toContainText("4 games");
  await expect(sched).toContainText("1–1"); // the record so far
  await expect(sched.locator(".ts-row.won .ts-res")).toHaveText("W");
  await expect(sched.locator(".ts-row.lost .ts-res")).toHaveText("L");
  await expect(sched.locator(".ts-score").first()).toHaveText("30 – 10");
  await expect(sched.locator(".ts-band")).toHaveText("Upcoming games");
  await expect(sched.locator(".ts-row.next")).toContainText("NBC");
  await expect(sched.locator(".ts-row").last()).toContainText("TBD");
});
