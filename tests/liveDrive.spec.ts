import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { buildPlusRanks } from "../src/plusRanksBuild";

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
  // The Watch-now strip sits above the games, so on a phone the live card starts at the bottom of the screen; the field loads once it is on screen.
  await expect(async () => { await page.locator(".board-section.live .game-card").first().evaluate((el) => el.scrollIntoView({ block: "center" })); }).toPass({ timeout: 10_000 });
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
  await expect(drive.locator(".df-play")).toHaveCount(3); // a line for each play of the drive
  await expect(drive.locator(".lf-chev, .df-flow, .df-path")).toHaveCount(0); // no animated arrows
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
  await expect(live.locator(".df-play")).toHaveCount(3); // the plays are drawn, not animated
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

test("the Game Center no longer carries a separate live field", async ({ page }) => {
  await open(page, { toGo: 65, text: "2nd & 7 at SEA 35" }, "max"); // every game has kicked off, so the Game Center polls
  await page.clock.resume();
  await page.locator(".board-section.live .game-card").first().locator(".cc-gc").click();
  await expect(page.locator("dialog.gc .gc-livefield")).toHaveCount(0); // the separate live field is gone
  await expect(page.locator("dialog.gc")).toBeVisible();
  await expect(page.locator("dialog.gc svg.drive-svg")).toHaveCount(0); // no second field in the Game Center (the last-play field is tested in lastPlay.spec.ts)
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
  await expect(async () => { await page.locator(".board-section.live .game-card").first().evaluate((el) => el.scrollIntoView({ block: "center" })); }).toPass({ timeout: 10_000 });
  await expect(page.locator(".board-section.live .game-card").first().locator("svg.drive-svg")).toBeVisible();
  expect(asked.every((x) => x === "cfb")).toBe(true);
});

test("the ball marker is the offense's team logo, and the field carries end-zone, midfield and conference art", async ({ page }) => {
  await open(page, { toGo: 65, text: "2nd & 7 at SEA 35" });
  const svg = page.locator(".board-section.live .game-card").first().locator("svg.drive-svg");
  await expect(svg.locator(".df-ball image.lf-ball-logo")).toHaveCount(1);
  await expect(svg.locator(".df-ball .lf-mark")).toHaveCount(1); // the offense's logo marks the ball
  await expect(svg.locator(".df-ball .lf-mark")).toHaveAttribute("data-facing", /^(left|right)$/);
  await expect(svg.locator("image.lf-mid")).toHaveCount(1); // the home logo at midfield
  await expect(svg.locator("[data-endzone]")).toHaveCount(2); // the home team's end zone design at both ends
  await expect(svg.locator("[data-endzones] text").first()).toBeAttached(); // lettered with the team's name
  // The conference mark on the 25-yard line of each half: the NFL's shield for an NFL game, upright on the left and upside down on the right.
  const marks = svg.locator("g.lf-conf");
  await expect(marks).toHaveCount(2);
  const confs = await marks.evaluateAll((els) => els.map((e) => e.getAttribute("data-conf")));
  expect(confs).toEqual(["NFL", "NFL"]);
  // The 25 from the left goal line is x=35 and from the right goal line x=85 (the 10-yard end zones put the goal lines at 10 and 110).
  const centers = await marks.evaluateAll((els) => els.map((e) => { const b = (e as unknown as SVGGraphicsElement).getBBox(); return Math.round(b.x + b.width / 2); }));
  expect(centers).toEqual([35, 85]);
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

async function openWith(page: import("@playwright/test").Page, make: () => any) {
  const start = Math.max(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: "5:12 - 3rd", away: 14, home: 17 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (route) => route.fulfill({ json: make() }));
  await page.goto("/?league=NFL");
  return page.locator(".board-section.live .game-card").first();
}

test("the heading says which way the drive is headed", async ({ page }) => {
  const live = await openWith(page, () => summary(65, "2nd & 7 at SEA 35"));
  await expect(live.locator(".lf-heading")).toContainText("→"); // the away team drives toward the right
  await expect(live.locator(".lf-plays-chart")).toHaveAttribute("data-dir", "1");
  await expect(live.locator(".lf-chev")).toHaveCount(0); // the heading says it; nothing animates
});

test("a home-team drive points the other way", async ({ page }) => {
  const live = await openWith(page, () => {
    const sm = summary(70, "1st & 10 at SF 30");
    const h = sm.teams[1].id;
    sm.situation.possession = h;
    sm.drives[1].team = h;
    return sm;
  });
  await expect(live.locator(".lf-heading")).toContainText("←");
  await expect(live.locator(".lf-plays-chart")).toHaveAttribute("data-dir", "-1");
});

test("inside the 20 the field's box turns red, with a RED ZONE tag; outside it does not", async ({ page }) => {
  const live = await openWith(page, () => summary(15, "1st & 10 at SEA 15"));
  await expect(live.locator(".lf.lf-red")).toHaveCount(1);
  await expect(live.locator(".lf-rz")).toContainText("RED ZONE");
  const border = await live.locator(".lf").evaluate((e) => getComputedStyle(e).borderTopColor);
  expect(border).not.toBe("rgba(0, 0, 0, 0)");
});

test("out of the red zone the box has no red border", async ({ page }) => {
  const live = await openWith(page, () => summary(65, "2nd & 7 at SEA 35"));
  await expect(live.locator(".lf")).toBeVisible();
  await expect(live.locator(".lf-red")).toHaveCount(0);
  await expect(live.locator(".lf-rz")).toHaveCount(0);
});

test("a conference mark is its official logo once ESPN's CDN answers, and the lettered badge until then or if it never does", async ({ page }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.route("https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png", (r) => r.fulfill({ contentType: "image/png", body: png }));
  const live = await openWith(page, () => summary(65, "2nd & 7 at SEA 35"));
  // The marks on an NFL field are the NFL's shield: they use the logo that loaded.
  await expect(live.locator("svg.drive-svg g.lf-conf[data-logo='official']").first()).toBeAttached();
  await expect(live.locator("svg.drive-svg g.lf-conf[data-conf='NFL'] image").first()).toHaveAttribute("href", /leagues\/500\/nfl\.png/);
});

test("with no answer from ESPN's CDN the conference mark stays a lettered badge", async ({ page }) => {
  await page.route("https://a.espncdn.com/i/teamlogos/**", (r) => r.fulfill({ status: 404, body: "no" }));
  const live = await openWith(page, () => summary(65, "2nd & 7 at SEA 35"));
  await expect(live.locator("svg.drive-svg g.lf-conf").first()).toBeAttached();
  await expect(live.locator("svg.drive-svg g.lf-conf[data-logo='official']")).toHaveCount(0);
  await expect(live.locator("svg.drive-svg g.lf-conf text.lf-conf-text").first()).toBeAttached();
});

/** A live card for NFL game 0 with these scores (state "in" or "post"); returns the card. */
async function openScores(page: import("@playwright/test").Page, away: number, home: number, state: "in" | "post" = "in", game: any = games[0]) {
  const start = Math.max(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any) => ({ id: g.espnId, state: g.espnId === game.espnId ? state : "pre", detail: state === "post" ? "Final" : "5:12 - 3rd", away, home })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (route) => route.fulfill({ json: summary(65, "2nd & 7 at SEA 35") }));
  await page.goto("/?league=NFL");
  return page.locator(`.game-card[data-game-id="${game.id}"]`);
}
// The upset is decided by the NFL+ rankings, the same ones shown beside the team names.
const plusRanks = buildPlusRanks(JSON.parse(readFileSync("src/data/spplus.json", "utf8")), JSON.parse(readFileSync("src/data/nfl.json", "utf8")), JSON.parse(readFileSync("src/data/team-ids.json", "utf8")));
const fpi = (i: number, g: any = games[0]) => plusRanks.nfl.byAbbr[g.teams[i].abbr as string];
// An upset needs the two teams at least 10 places apart (#12 against #14 is a toss-up), so the upset tests use a game that qualifies.
const wide = games.find((g: any) => Math.abs(fpi(0, g) - fpi(1, g)) >= 10) ?? games[0];

test("a live card whose lower NFL+-ranked team is ahead gets the neon outline and an UPSET ALERT", async ({ page }) => {
  const worse = fpi(0, wide) > fpi(1, wide) ? 0 : 1; // the team with the bigger rank number
  const card = await openScores(page, worse === 0 ? 24 : 10, worse === 0 ? 10 : 24, "in", wide);
  await expect(card).toHaveClass(/upset-alert/);
  await expect(card.locator(".upset-banner")).toContainText(/upset alert/i);
  expect(await card.evaluate((e) => getComputedStyle(e).boxShadow)).toContain("57, 255, 136");
  // The strip is the first thing on the card and names who leads, with both ranks.
  const first = await card.evaluate((e) => (e.querySelector(".compact-overview")?.firstElementChild as HTMLElement).className);
  expect(first).toBe("upset-banner");
  // It is flush with the card's edges (clear of the 3px colour bar) and its text is not clipped at the top or sides.
  const fit = await card.evaluate((e) => {
    const c = e.getBoundingClientRect();
    const b = (e.querySelector(".upset-banner") as HTMLElement).getBoundingClientRect();
    return { top: b.top - c.top, left: b.left - c.left, right: c.right - b.right };
  });
  expect(fit.top).toBeLessThanOrEqual(2);
  expect(Math.abs(fit.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(fit.right)).toBeLessThanOrEqual(2);
  await expect(card.locator(".upset-banner")).toContainText(new RegExp(`#${Math.max(fpi(0, wide), fpi(1, wide))}.*#${Math.min(fpi(0, wide), fpi(1, wide))}`));
});

test("no alert when the higher-ranked team is ahead, or the game is tied", async ({ page }) => {
  const better = fpi(0) < fpi(1) ? 0 : 1;
  const card = await openScores(page, better === 0 ? 24 : 10, better === 0 ? 10 : 24);
  await expect(card.locator(".gs-pill")).toBeVisible();
  await expect(card).not.toHaveClass(/upset/);
  await expect(card.locator(".upset-banner")).toHaveCount(0);
});

test("if the lower-ranked team holds on, the card becomes an upset final", async ({ page }) => {
  const worse = fpi(0, wide) > fpi(1, wide) ? 0 : 1;
  const card = await openScores(page, worse === 0 ? 27 : 13, worse === 0 ? 13 : 27, "post", wide);
  await expect(card).toHaveClass(/upset-final/);
  await expect(card.locator(".upset-banner")).toContainText(/upset final/i);
});

test("no alert when the lower-ranked team leads but the two are fewer than 10 places apart", async ({ page }) => {
  const close = games.find((g: any) => Math.abs(fpi(0, g) - fpi(1, g)) < 10 && fpi(0, g) !== fpi(1, g));
  test.skip(!close, "no NFL game this week has teams that close");
  const worse = fpi(0, close) > fpi(1, close) ? 0 : 1;
  const card = await openScores(page, worse === 0 ? 24 : 10, worse === 0 ? 10 : 24, "in", close);
  await expect(card.locator(".gs-pill")).toBeVisible();
  await expect(card).not.toHaveClass(/upset/);
  await expect(card.locator(".upset-banner")).toHaveCount(0);
});

// ---------- run / pass colours on the field ----------
test("the drive on the field is a line per play, from the top down: red for runs, blue for passes, dashed where yards were lost", async ({ page }) => {
  const live = await openWith(page, () => summary(65, "2nd & 7 at SEA 35"));
  await expect(live.locator(".lf")).toBeVisible();
  const plays = live.locator(".df-play");
  // The mocked drive: a completed pass for 12, a run for no gain, a sack for -3 (a pass play).
  await expect(plays).toHaveCount(3);
  expect(await plays.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).toEqual(["pass", "run", "pass"]);
  expect(await live.locator(".df-seg.run").first().evaluate((e) => getComputedStyle(e).stroke)).toBe("rgb(255, 77, 79)");
  expect(await live.locator(".df-seg.pass").first().evaluate((e) => getComputedStyle(e).stroke)).toBe("rgb(59, 157, 255)");
  // Each play has its own row, one below the other, and the ball sits on the row after the last.
  const ys = await live.locator(".df-seg").evaluateAll((els) => els.map((e) => Number(e.getAttribute("y1"))));
  expect(ys[1]).toBeGreaterThan(ys[0]);
  expect(ys[2]).toBeGreaterThan(ys[1]);
  // They follow the ball down the field: each starts where the last ended.
  const xs = await live.locator(".df-seg").evaluateAll((els) => els.map((e) => [Number(e.getAttribute("x1")), Number(e.getAttribute("x2"))]));
  expect(xs[0][1]).toBeCloseTo(xs[1][0], 1);
  expect(xs[1][1]).toBeCloseTo(xs[2][0], 1);
  expect(xs[2][1]).toBeLessThan(xs[2][0]); // the sack went backwards
  // The sack is dashed, a loss; the gain is solid. Each has its yards written beside it.
  await expect(live.locator(".df-seg.loss")).toHaveCount(1);
  await expect(plays.nth(0).locator(".df-play-label")).toHaveText("+12");
  await expect(plays.nth(1).locator(".df-play-label")).toHaveText("0");
  await expect(plays.nth(2).locator(".df-play-label")).toHaveText("\u22123");
  // The key says which colour is which.
  await expect(live.locator(".lf-key")).toContainText("run");
  await expect(live.locator(".lf-key")).toContainText("pass");
  await expect(live.locator(".lf-key")).toContainText("punt / FG");
});

test("a punt and a field goal are on the drive too: a gold line for the kick, with its distance, and a good or missed mark", async ({ page }) => {
  const live = await openWith(page, () => {
    const sm = summary(40, "4th & 3 at SEA 40");
    sm.curPlays = [
      { down: "1st & 10 at ATL 25", text: "D.Henry up the middle for 6 yards", yards: 6, period: 3, clock: "12:30", kind: "Rush", score: false, turnover: false },
      { down: "2nd & 4 at ATL 31", text: "J.Allen pass incomplete", yards: 0, period: 3, clock: "12:00", kind: "Pass Incompletion", score: false, turnover: false },
      { down: "3rd & 4 at ATL 31", text: "J.Allen pass short for 5 yards", yards: 5, period: 3, clock: "11:30", kind: "Pass Reception", score: false, turnover: false },
      { down: "4th & 3 at SEA 40", text: "T.Bass 57 yard field goal is No Good", yards: 57, period: 3, clock: "11:00", kind: "Field Goal Missed", score: false, turnover: false },
    ];
    return sm;
  });
  const plays = live.locator(".df-play");
  await expect(plays).toHaveCount(4);
  expect(await plays.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).toEqual(["run", "pass", "pass", "fg"]);
  await expect(plays.nth(1).locator(".df-play-label")).toHaveText("inc"); // an incomplete pass
  await expect(plays.nth(3).locator(".df-play-label")).toHaveText("FG 57 \u2717");
  expect(await live.locator(".df-seg.fg").first().evaluate((e) => getComputedStyle(e).stroke)).toBe("rgb(242, 201, 76)");
  await expect(plays.nth(3).locator(".df-kick-mark.post")).toHaveCount(1); // the uprights it was kicked at
});

test("a play is a run or a pass from its type, or its text when the type doesn't say", async () => {
  const { playKind, driveSegments } = await import("../src/driveKinds");
  expect(playKind("Rush", "")).toBe("run");
  expect(playKind("Rushing Touchdown", "")).toBe("run");
  expect(playKind("Pass Reception", "")).toBe("pass");
  expect(playKind("Passing Touchdown", "")).toBe("pass");
  expect(playKind("Pass Incompletion", "")).toBe("pass");
  expect(playKind("Sack", "")).toBe("pass");
  expect(playKind("Penalty", "False start")).toBeNull();
  expect(playKind("Punt", "")).toBe("punt");
  expect(playKind("Field Goal Good", "")).toBe("fg");
  expect(playKind("", "B.Pinion punts 45 yards to the SEA 20")).toBe("punt");
  expect(playKind("Kickoff", "")).toBeNull();
  expect(playKind("Extra Point Good", "")).toBeNull();
  expect(playKind("", "J.Allen pass short left to S.Diggs for 7 yards")).toBe("pass");
  expect(playKind("", "D.Henry up the middle for 4 yards")).toBe("run");
  expect(playKind("", "Timeout #1")).toBeNull();
  // Runs and passes follow from the start and the last one ends at the ball: a 12-yard pass, a 4-yard run, a 3-yard pass, for the team going right (away).
  const plays = [
    { yards: 12, kind: "Pass Reception", text: "" },
    { yards: 4, kind: "Rush", text: "" },
    { yards: 3, kind: "Pass Reception", text: "" },
  ];
  const segs = driveSegments(plays, { ball: 50 }, true);
  expect(segs.map((s) => [s.from, s.to, s.kind])).toEqual([[31, 43, "pass"], [43, 47, "run"], [47, 50, "pass"]]);
  // With no ball, the drive starts where it said it did.
  expect(driveSegments(plays, { start: 25 }, true).map((s) => s.from)).toEqual([25, 37, 41]);
  // The team going the other way (home): the stretches run toward 0.
  const back = driveSegments([{ yards: 6, kind: "Rush", text: "" }], { ball: 40 }, false);
  expect([back[0].from, back[0].to]).toEqual([46, 40]);
  // An incomplete pass is a ring, not a stretch.
  expect(driveSegments([{ yards: 0, kind: "Pass Incompletion", text: "" }], { ball: 30 }, true)[0].incomplete).toBe(true);
  // A punt starts where the drive got to and goes as far as it was kicked; a field goal goes from there to the posts, and says if it was good.
  const kicks = driveSegments(
    [{ yards: 8, kind: "Rush", text: "" }, { yards: 44, kind: "Punt", text: "B.Pinion punts 44 yards" }],
    { start: 20 },
    true,
  );
  expect([kicks[1].kind, kicks[1].from, kicks[1].to]).toEqual(["punt", 28, 72]);
  const fg = driveSegments([{ yards: 30, kind: "Rush", text: "" }, { yards: 41, kind: "Field Goal Good", text: "T.Bass 41 yard field goal is GOOD" }], { start: 55 }, true);
  expect([fg[1].kind, fg[1].from, fg[1].to, fg[1].good]).toEqual(["fg", 85, 106, true]);
  expect(driveSegments([{ yards: 51, kind: "Field Goal Missed", text: "T.Bass 51 yard field goal is No Good" }], { start: 60 }, true)[0].good).toBe(false);
  // Going the other way the posts are at the left, and a score is carried through.
  const home = driveSegments([{ yards: 20, kind: "Rushing Touchdown", text: "", score: true }], { ball: 0 }, false);
  expect([home[0].to, home[0].score]).toEqual([0, true]);
});

test("a live card's field wears the home team's end zones and a conference mark at each 25, the far one upside down", async ({ page }) => {
  await open(page, { toGo: 40, text: "2nd & 7 at SEA 35" });
  const card = page.locator(".board-section.live .game-card").first();
  await expect(card.locator(".drive-svg [data-endzones]")).toHaveCount(1);
  await expect(card.locator(".drive-svg [data-endzone]")).toHaveCount(2); // both ends are the home team's
  await expect(card.locator(".drive-svg .lf-conf")).toHaveCount(2);
  await expect(card.locator(".drive-svg .lf-conf").first()).toHaveAttribute("data-conf", "NFL"); // the NFL's shield for an NFL game
  expect(await card.locator(".drive-svg g[transform^='rotate(180']").count()).toBe(1);
});
