import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { deserveIndex, momentumSwing } from "../src/meterMath";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const games = slate.games.filter((g: any) => g.league === "NFL");
const stat = (o: object = {}) => ({ yards: 200, ypp: 5, firstDowns: 10, turnovers: 0, top: "15:00", ...o });

test("deserve-to-win reads the box score: better yards per play, takeaways and possession tilt it", () => {
  expect(deserveIndex(stat(), stat())).toBe(50);
  expect(deserveIndex(stat(), stat({ yards: 300, ypp: 7, firstDowns: 16, top: "20:00" }))!).toBeGreaterThan(55);
  expect(deserveIndex(stat({ turnovers: 3 }), stat())!).toBeGreaterThan(55);
  expect(deserveIndex(stat({ yards: 0, top: "0:00" }), stat({ yards: 0, top: "0:00" }))).toBeNull();
  expect(deserveIndex(undefined, stat())).toBeNull();
});

test("momentum is the home win-probability change over the last 12 plays", () => {
  expect(momentumSwing([[50, 1]])).toBeNull();
  expect(momentumSwing([[50, 1], [58, 1]] as never)).toBe(8);
});

test("a live card shows three slim meters instead of the field, and is shorter than before", async ({ page }) => {
  const [a, h] = games[0].teams;
  const start = Math.min(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (r) => r.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: "5:12 - 3rd", away: 14, home: 17 })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [[50, 3, { id: "1", text: "x", clock: "9:00" }], [62, 3, { id: "2", text: "y", clock: "5:12" }]] } }));
  await page.route("**/api/game**", (r) => r.fulfill({ json: {
    id: games[0].espnId, status: { state: "in", detail: "5:12 - 3rd", period: 3, clock: "5:12" },
    teams: [{ id: a.espnId, abbr: a.abbr, name: a.name, homeAway: "away", score: 14, linescores: [] }, { id: h.espnId, abbr: h.abbr, name: h.name, homeAway: "home", score: 17, linescores: [] }],
    situation: null, drives: [], plays: [], allOffense: [], scoring: [], players: {}, wp: [],
    teamStats: { [a.espnId]: stat({ yards: 150, ypp: 4 }), [h.espnId]: stat({ yards: 300, ypp: 6.5, top: "20:00" }) },
  } }));
  if (test.info().project.name === "mobile") await page.setViewportSize({ width: 390, height: 1800 });
  await page.goto("/?league=NFL");
  const card = page.locator(".board-section.live .game-card").first();
  const meters = card.locator(".live-meters");
  await expect(async () => { await card.evaluate((el) => el.scrollIntoView({ block: "center" })); await expect(meters.locator(".lm")).toHaveCount(3); }).toPass({ timeout: 10_000 });
  await expect(meters.locator(".lm-v").first()).toContainText(`${h.abbr} 62%`);
  await expect(meters.locator(".lm").nth(1)).toHaveAttribute("aria-label", /Momentum: .* gaining/);
  await expect(meters.locator(".lm").nth(2)).toHaveAttribute("aria-label", /Deserve to win.*\d+ percent/, { timeout: 10_000 });
  await expect(card.locator(".drive-live, svg.drive-svg, .wp-bar")).toHaveCount(0);
  expect((await meters.boundingBox())!.height).toBeLessThan(40);
});
