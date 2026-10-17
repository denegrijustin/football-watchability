import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));

test("the Upset Alert Meter has a Live column with the score and the game clock, and a row opens its Game Center", async ({ page }) => {
  const start = Math.max(...slate.games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  const first = slate.games.find((g: any) => g.league === "NFL");
  await page.route("**/api/scores**", (r) => r.fulfill({ json: slate.games.map((x: any) => ({ id: x.espnId, state: x.espnId === first.espnId ? "in" : "pre", detail: x.espnId === first.espnId ? "5:12 - 3rd" : "", away: 14, home: 7 })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (r) => r.fulfill({ json: { id: first.espnId, status: { state: "in", detail: "5:12 - 3rd", period: 3, clock: "5:12" }, teams: first.teams.map((t: any, i: number) => ({ id: t.espnId, abbr: t.abbr, name: t.name, homeAway: i ? "home" : "away", score: i ? 7 : 14, linescores: [], possession: false })), situation: null, drives: [], plays: [], curPlays: [], wp: [], allOffense: [], scoring: [], teamStats: {}, players: {} } }));
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "Upset Alert Meter" }).click();
  const col = page.locator(".um-col[aria-label='Live']");
  await expect(col).toBeVisible();
  await expect(col.locator(".um-row")).toHaveCount(1);
  await expect(col.locator(".um-clock")).toContainText("5:12 - 3rd");
  await expect(col.locator(".um-pts").first()).toHaveText("14");
  await expect(page.locator(".um-cols.three")).toBeVisible(); // live, completed and upcoming side by side
  await col.locator(".um-open").click();
  await expect(page.locator("dialog.gc")).toBeVisible();
});
