import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const games = slate.games.filter((g: any) => g.league === "NFL");

// Game 0 is live; the summary says the away team has the ball, driving toward the home end zone.
function summary(toGo: number | null, text: string, spotText = "") {
  const [a, h] = games[0].teams;
  return {
    id: games[0].espnId,
    status: { state: "in", detail: "5:12 - 3rd", period: 3, clock: "5:12" },
    teams: [
      { id: a.espnId, abbr: a.abbr, name: a.name, homeAway: "away", score: 14, linescores: [], possession: true },
      { id: h.espnId, abbr: h.abbr, name: h.name, homeAway: "home", score: 17, linescores: [], possession: false },
    ],
    situation: { text, possession: a.espnId, toGo, redZone: (toGo ?? 99) <= 20, lastPlay: "Pass complete", spotText },
    drives: [
      { team: h.espnId, from: 20, to: 78, yards: 58, plays: 9, result: "Touchdown", score: true, time: "4:10", current: false },
      { team: a.espnId, from: 25, to: 100 - (toGo ?? 50), yards: 75 - (toGo ?? 50), plays: 4, result: "", score: false, time: "1:40", current: true },
    ],
    curPlays: [
      { down: "1st & 10 at ATL 25", text: "Pass complete to the right for 12 yards", yards: 12, period: 3, clock: "12:30", kind: "Pass Reception", score: false, turnover: false },
      { down: "1st & 10 at ATL 37", text: "Rush up the middle for no gain", yards: 0, period: 3, clock: "11:50", kind: "Rush", score: false, turnover: false },
      { down: "2nd & 7 at SEA 35", text: "Sack for a loss of 3", yards: -3, period: 3, clock: "11:10", kind: "Sack", score: false, turnover: false },
    ],
    wp: [], plays: [], allOffense: [], scoring: [], teamStats: {}, players: {},
  };
}

async function open(page: import("@playwright/test").Page, state: { toGo: number; text: string }, pick: "min" | "max" = "min") {
  const start = Math[pick](...games.map((g: any) => new Date(g.date).getTime()));
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
  await expect(live.locator(".drive-live svg.drive-svg")).toBeVisible();
  expect(await live.locator(".df-pulse").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  expect(await live.locator(".df-path").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await expect(live.locator(".df-flow")).toBeHidden();
});

test("the live field names who has the ball, where it is, where the drive started, and lists the drive's plays", async ({ page }) => {
  await open(page, { toGo: 65, text: "2nd & 7 at SEA 35" });
  const live = page.locator(".board-section.live .game-card").first();
  const drive = live.locator(".drive-live");
  await expect(drive.locator(".lf-ball-team")).toContainText("have the ball");
  await expect(drive.locator(".lf-ball-team .ball-icon")).toHaveCount(1);
  await expect(drive.locator(".lf-start")).toContainText("START");
  await expect(drive).toContainText("drive started");
  await expect(drive.locator(".lf-tagtext.ball")).toContainText("35"); // the ball's spot on the field
  // Plays of the drive are folded away on the card and open one tap away.
  const more = drive.locator("details.lf-drive");
  await expect(more.locator("summary")).toContainText("Plays in this drive (3)");
  await more.locator("summary").click();
  await expect(more.locator(".lf-plays li")).toHaveCount(3);
  await expect(more.locator(".lf-plays li.latest")).toContainText("Sack for a loss of 3");
  await expect(more.locator(".lf-yds.neg")).toContainText("-3 yds");
});

test("the Game Center carries the same live field, with the plays open", async ({ page }) => {
  await open(page, { toGo: 65, text: "2nd & 7 at SEA 35" }, "max"); // every game has kicked off, so the Game Center polls
  await page.clock.resume();
  await page.locator(".board-section.live .game-card").first().locator(".cc-gc").click();
  const panel = page.locator("dialog.gc .gc-livefield");
  await expect(panel.locator(".lf-ball-team")).toContainText("have the ball");
  await expect(panel.locator("svg.drive-svg")).toBeVisible();
  await expect(panel.locator(".lf-plays li")).toHaveCount(3);
});

test("when ESPN gives no yards-to-end-zone figure, the ball is placed from its own spot text", async ({ page }) => {
  const start = Math.max(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: "5:12 - 3rd", away: 14, home: 17 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  // The away team has the ball at the HOME team's 35: 65 yards from its own goal line.
  const [, h] = games[0].teams;
  await page.route("**/api/game**", (route) => route.fulfill({ json: summary(null, `2nd & 7 at ${h.abbr} 35`) }));
  await page.goto("/?league=NFL");
  const live = page.locator(".board-section.live .game-card").first();
  await expect(live.locator(".df-ball")).toBeAttached();
  expect(await live.locator(".df-ball").evaluate((e) => (e as SVGGElement).style.transform)).toBe("translateX(75px)");
  await expect(live.locator(".lf-ball-team")).toContainText("have the ball");
  // ... and the same from ESPN's separate spot text when the down text has none.
  await page.route("**/api/game**", (route) => route.fulfill({ json: summary(null, "2nd & 7", `${h.abbr} 35`) }));
  await page.clock.fastForward(16_000);
  await expect.poll(() => live.locator(".df-ball").evaluate((e) => (e as SVGGElement).style.transform)).toBe("translateX(75px)");
});

test("with no situation spot at all, the ball comes from the latest snap in the play data", async ({ page }) => {
  const start = Math.max(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: "5:12 - 3rd", away: 14, home: 17 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  const [a, h] = games[0].teams;
  const base = summary(null, "");
  // No situation block: the ball is 40 yards from the home team's goal line, measured for the HOME team (so 60 from the away team's).
  await page.route("**/api/game**", (route) => route.fulfill({ json: { ...base, situation: null, ball: { team: h.espnId, own: 40 } } }));
  await page.goto("/?league=NFL");
  const live = page.locator(".board-section.live .game-card").first();
  await expect(live.locator(".df-ball")).toBeAttached();
  // The away team (a) has the ball; 40 from the home goal line = 60 yards from a's own goal line, plus the 10-yard end zone.
  expect(await live.locator(".df-ball").evaluate((e) => (e as SVGGElement).style.transform)).toBe("translateX(70px)");
});

test("a college card asks the game feed for league=cfb, and shows the field", async ({ page }) => {
  const cfb = slate.games.filter((g: any) => g.league === "CFB");
  const start = Math.max(...cfb.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: cfb.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: "5:12 - 3rd", away: 14, home: 17 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  const asked: string[] = [];
  const [a, h] = cfb[0].teams;
  await page.route("**/api/game**", (route) => {
    asked.push(new URL(route.request().url()).searchParams.get("league") ?? "");
    return route.fulfill({
      json: {
        ...summary(60, "2nd & 7 at " + h.abbr + " 40"),
        id: cfb[0].espnId,
        teams: [
          { id: a.espnId, abbr: a.abbr, name: a.name, homeAway: "away", score: 14, linescores: [], possession: true },
          { id: h.espnId, abbr: h.abbr, name: h.name, homeAway: "home", score: 17, linescores: [], possession: false },
        ],
        situation: { text: "2nd & 7 at " + h.abbr + " 40", possession: a.espnId, toGo: 60, redZone: false, lastPlay: "x" },
        drives: [{ team: a.espnId, from: 25, to: 40, yards: 15, plays: 4, result: "", score: false, time: "1:40", current: true }],
      },
    });
  });
  await page.goto("/?league=CFB");
  await expect(page.locator(".board-section.live .game-card").first().locator("svg.drive-svg")).toBeVisible();
  expect(asked.every((x) => x === "cfb")).toBe(true);
});

test("the ball marker is the offense's team logo, and the field carries end-zone, midfield and conference art", async ({ page }) => {
  await open(page, { toGo: 65, text: "2nd & 7 at SEA 35" });
  const svg = page.locator(".board-section.live .game-card").first().locator("svg.drive-svg");
  await expect(svg.locator(".df-ball image.lf-ball-logo")).toHaveCount(1);
  await expect(svg.locator(".df-ball .df-pigskin")).toHaveCount(0); // no football drawn when the team has a logo
  await expect(svg.locator("image.lf-mid")).toHaveCount(1); // the home logo at midfield
  await expect(svg.locator("text.lf-ez")).toHaveCount(2); // team names in the end zones
  await expect(svg.locator("g > image")).not.toHaveCount(0); // end-zone logos
  await expect(svg.locator("text.lf-conf").first()).toBeAttached(); // conference painted on the sideline
});

test("a live game with rain and wind in its forecast shows them over the field, and says so in the caption", async ({ page }) => {
  const weather = {
    icon: "🌧️", title: "Rain likely", detail: "x", impact: "high impact", level: "high", effects: [],
    factors: [{ key: "rain", level: 3 }, { key: "wind", level: 3 }],
    hours: [0, 1, 2, 3].map((i) => ({ label: "Q" + (i + 1), time: "", at: "", icon: "🌧️", tempF: 60, feelsF: 58, precip: 80, windMph: 18, gustMph: 38, dir: "E" })),
  };
  const start = Math.max(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: "5:12 - 3rd", away: 14, home: 17 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (route) => route.fulfill({ json: summary(65, "2nd & 7 at SEA 35") }));
  // Give the first card the stormy forecast.
  await page.route("**/data/slate.json", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const g = body.games.find((x: any) => x.espnId === games[0].espnId);
    g.weather = weather;
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/?league=NFL");
  const live = page.locator(".board-section.live .game-card").first();
  await expect(live.locator("svg.drive-svg .wx-drop").first()).toBeAttached();
  await expect(live.locator("svg.drive-svg .wx-gust").first()).toBeAttached();
  await expect(live.locator(".lf-wx")).toContainText("heavy rain");
  await expect(live.locator(".lf-wx")).toContainText("wind E 38 mph");
  // A card without weather impact draws none.
  await expect(page.locator(".board-section.live .game-card").nth(1).locator(".wx")).toHaveCount(0);
});
