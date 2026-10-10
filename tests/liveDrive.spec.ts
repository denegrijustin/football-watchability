import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const games = slate.games.filter((g: any) => g.league === "NFL");

// Game 0 is live; the summary says the away team has the ball, driving toward the home end zone.
function summary(toGo: number, text: string) {
  const [a, h] = games[0].teams;
  return {
    id: games[0].espnId,
    status: { state: "in", detail: "5:12 - 3rd", period: 3, clock: "5:12" },
    teams: [
      { id: a.espnId, abbr: a.abbr, name: a.name, homeAway: "away", score: 14, linescores: [], possession: true },
      { id: h.espnId, abbr: h.abbr, name: h.name, homeAway: "home", score: 17, linescores: [], possession: false },
    ],
    situation: { text, possession: a.espnId, toGo, redZone: toGo <= 20, lastPlay: "Pass complete" },
    drives: [
      { team: h.espnId, from: 20, to: 78, yards: 58, plays: 9, result: "Touchdown", score: true, time: "4:10", current: false },
      { team: a.espnId, from: 25, to: 100 - toGo, yards: 75 - toGo, plays: 4, result: "", score: false, time: "1:40", current: true },
    ],
    wp: [], plays: [], allOffense: [], scoring: [], teamStats: {}, players: {},
  };
}

async function open(page: import("@playwright/test").Page, state: { toGo: number; text: string }) {
  const start = Math.min(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: i === 0 ? "5:12 - 3rd" : "", away: 14, home: 17 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (route) => route.fulfill({ json: summary(state.toGo, state.text) }));
  await page.goto("/?league=NFL");
}

test("a live card shows the drive animation second, directly under the score block", async ({ page }) => {
  await open(page, { toGo: 65, text: "2nd & 7 at SEA 35" });
  const live = page.locator(".board-section.live .game-card").first();
  const drive = live.locator(".drive-live");
  await expect(drive.locator("svg.drive-svg")).toBeVisible();
  // Order inside the card: the header, the teams and scores, the drive chart, then the game info.
  const order = await live.locator(".compact-overview > *").evaluateAll((els) => els.map((e) => e.className.split(" ")[0]));
  expect(order.indexOf("drive-live")).toBe(order.indexOf("matchup") + 1);
  expect(order.indexOf("facts")).toBe(order.indexOf("drive-live") + 1);
  await expect(drive).toContainText("2nd & 7 at SEA 35");
  await expect(drive).toContainText("4 plays");
  await expect(drive.locator(".df-first")).toHaveCount(1); // first-down line
  await expect(drive.locator(".df-flow")).toHaveCount(1); // the moving dashes
  // Games that aren't live get no drive chart.
  await expect(page.locator(".board-section.upcoming .drive-live").first()).toHaveCount(0);
});

test("the ball slides to the new spot when the next update arrives", async ({ page }) => {
  const state = { toGo: 65, text: "2nd & 7 at SEA 35" };
  await page.clock.install({ time: Math.min(...games.map((g: any) => new Date(g.date).getTime())) + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: "5:12 - 3rd", away: 14, home: 17 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (route) => route.fulfill({ json: summary(state.toGo, state.text) }));
  await page.goto("/?league=NFL");
  const ball = page.locator(".board-section.live .game-card").first().locator(".df-ball");
  await expect(ball).toBeAttached();
  const x = () => ball.evaluate((e) => (e as SVGGElement).style.transform);
  expect(await x()).toBe("translateX(45px)"); // 35 yards from the away goal line, past the 10-yard end zone
  state.toGo = 40;
  state.text = "1st & 10 at SEA 40";
  await page.clock.fastForward(16_000);
  await expect.poll(x).toBe("translateX(70px)");
  await expect(page.locator(".board-section.live .game-card").first().locator(".drive-live")).toContainText("1st & 10 at SEA 40");
});

test("with reduced motion the drive stays drawn and nothing animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { toGo: 65, text: "2nd & 7 at SEA 35" });
  const live = page.locator(".board-section.live .game-card").first();
  await expect(live.locator(".drive-live svg")).toBeVisible();
  expect(await live.locator(".df-pulse").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  expect(await live.locator(".df-path").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await expect(live.locator(".df-flow")).toBeHidden();
});
