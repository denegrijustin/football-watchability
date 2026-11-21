import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const games = slate.games.filter((g: any) => g.league === "NFL" && g.espnId);

// ESPN sometimes answers a summary request with an empty shell (no teams): the Game Center must treat that as no answer, not draw it and fall over.
test("a game summary with no teams does not crash the Game Center", async ({ page }) => {
  test.skip(games.length === 0, "no NFL game on the board");
  await stubFinals(page);
  const start = new Date(games[0].date).getTime();
  await page.clock.install({ time: start + 40 * 60e3 });
  await page.route("**/api/scores**", (r) => r.fulfill({ json: games.map((g: any) => ({ id: g.espnId, state: g === games[0] ? "in" : "pre", detail: "10:00 - 2nd", away: 7, home: 3 })) }));
  await page.route("**/api/game**", (r) => r.fulfill({ json: {} }));
  await page.route("https://site.api.espn.com/**", (r) => r.fulfill({ json: { header: { competitions: [{ competitors: [] }] } } }));
  await page.goto("/?league=NFL");
  await page.locator(`.game-card[data-game-id="${games[0].id}"]`).getByRole("button", { name: /Game Center/ }).first().click();
  const gc = page.getByRole("dialog");
  await expect(gc).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(gc.getByText("ran into a problem")).toHaveCount(0);
});
