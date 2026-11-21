import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const games = slate.games.filter((g: any) => g.league === "NFL");

test("a live card shows the down and distance from the live feed", async ({ page }) => {
  const start = Math.min(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (r) => r.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i < 2 ? "in" : "pre", detail: "8:54 - 4th", away: 21, home: 21, dd: i === 0 ? "2nd & 7 at KC 35" : "" })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [[44, 4, { id: "1", text: "x", clock: "9:00" }], [56, 4, { id: "2", text: "y", clock: "8:54" }]] } }));
  await page.goto("/?league=NFL");
  const dd = page.locator(".board-section.live .gs-dd");
  await expect(dd).toHaveCount(1, { timeout: 10_000 });
  await expect(dd).toHaveText("2nd & 7 at KC 35");
  // the pill sits under the live status, never on top of it (a phone keeps the status row on one line)
  const st = (await page.locator(".board-section.live .game-status").first().boundingBox())!, pill = (await dd.boundingBox())!;
  expect(pill.y).toBeGreaterThanOrEqual(st.y + st.height - 1);
});
