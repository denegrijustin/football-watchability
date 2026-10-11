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
  // The conference mark on the 25-yard line of each half: the away team's (NFC here) on the left, the home team's on the right.
  const marks = svg.locator("g.lf-conf");
  await expect(marks).toHaveCount(2);
  const confs = await marks.evaluateAll((els) => els.map((e) => e.getAttribute("data-conf")));
  expect(confs.every((c) => c === "AFC" || c === "NFC")).toBe(true);
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

test("an arrow shows which way the drive is headed", async ({ page }) => {
  const live = await openWith(page, () => summary(65, "2nd & 7 at SEA 35"));
  await expect(live.locator(".lf-heading")).toContainText("→"); // the away team drives toward the right
  await expect(live.locator(".lf-chev").first()).toHaveAttribute("data-dir", "1");
  await expect(live.locator(".lf-chev")).toHaveCount(3);
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
  await expect(live.locator(".lf-chev").first()).toHaveAttribute("data-dir", "-1");
});

test("inside the 20 the field's box turns red, with a RED ZONE tag; outside it does not", async ({ page }) => {
  const live = await openWith(page, () => summary(15, "1st & 10 at SEA 15"));
  await expect(live.locator(".lf.lf-red")).toHaveCount(1);
  await expect(live.locator(".lf-rz")).toContainText("RED ZONE");
  const border = await live.locator(".lf").evaluate((e) => getComputedStyle(e).borderTopColor);
  expect(border).not.toBe("rgba(0, 0, 0, 0)");
  await expect(live.locator(".lf-chev")).toHaveCount(2); // only as many as fit before the goal line
});

test("out of the red zone the box has no red border", async ({ page }) => {
  const live = await openWith(page, () => summary(65, "2nd & 7 at SEA 35"));
  await expect(live.locator(".lf")).toBeVisible();
  await expect(live.locator(".lf-red")).toHaveCount(0);
  await expect(live.locator(".lf-rz")).toHaveCount(0);
});

test("a conference mark is its official logo once ESPN's CDN answers, and the lettered badge until then or if it never does", async ({ page }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.route("https://a.espncdn.com/i/teamlogos/nfl/500/nfc.png", (r) => r.fulfill({ contentType: "image/png", body: png }));
  await page.route("https://a.espncdn.com/i/teamlogos/**/afc.png", (r) => r.fulfill({ status: 404, body: "no" }));
  const live = await openWith(page, () => summary(65, "2nd & 7 at SEA 35"));
  // Both teams in this game are NFC: their marks use the logo that loaded.
  await expect(live.locator("svg.drive-svg g.lf-conf[data-logo='official']").first()).toBeAttached();
  await expect(live.locator("svg.drive-svg g.lf-conf[data-conf='NFC'] image").first()).toHaveAttribute("href", /nfl\/500\/nfc\.png/);
});

test("with no answer from ESPN's CDN the conference mark stays a lettered badge", async ({ page }) => {
  await page.route("https://a.espncdn.com/i/teamlogos/**", (r) => r.fulfill({ status: 404, body: "no" }));
  const live = await openWith(page, () => summary(65, "2nd & 7 at SEA 35"));
  await expect(live.locator("svg.drive-svg g.lf-conf").first()).toBeAttached();
  await expect(live.locator("svg.drive-svg g.lf-conf[data-logo='official']")).toHaveCount(0);
  await expect(live.locator("svg.drive-svg g.lf-conf text.lf-conf-text").first()).toBeAttached();
});

/** A live card for NFL game 0 with these scores (state "in" or "post"); returns the card. */
async function openScores(page: import("@playwright/test").Page, away: number, home: number, state: "in" | "post" = "in") {
  const start = Math.max(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? state : "pre", detail: state === "post" ? "Final" : "5:12 - 3rd", away, home })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (route) => route.fulfill({ json: summary(65, "2nd & 7 at SEA 35") }));
  await page.goto("/?league=NFL");
  return page.locator(`.game-card[data-game-id="${games[0].id}"]`);
}
const fpi = (i: number) => games[0].teams[i].ranks.overall as number;

test("a live card whose lower FPI-ranked team is ahead gets the neon outline and an UPSET ALERT", async ({ page }) => {
  const worse = fpi(0) > fpi(1) ? 0 : 1; // the team with the bigger rank number
  const card = await openScores(page, worse === 0 ? 24 : 10, worse === 0 ? 10 : 24);
  await expect(card).toHaveClass(/upset-alert/);
  await expect(card.locator(".upset-banner")).toContainText(/upset alert/i);
  expect(await card.evaluate((e) => getComputedStyle(e).boxShadow)).toContain("57, 255, 136");
  // The strip is the first thing on the card and names who leads, with both ranks.
  const first = await card.evaluate((e) => (e.querySelector(".compact-overview")?.firstElementChild as HTMLElement).className);
  expect(first).toBe("upset-banner");
  await expect(card.locator(".upset-banner")).toContainText(new RegExp(`#${Math.max(fpi(0), fpi(1))}.*#${Math.min(fpi(0), fpi(1))}`));
});

test("no alert when the higher-ranked team is ahead, or the game is tied", async ({ page }) => {
  const better = fpi(0) < fpi(1) ? 0 : 1;
  const card = await openScores(page, better === 0 ? 24 : 10, better === 0 ? 10 : 24);
  await expect(card.locator(".gs-pill")).toBeVisible();
  await expect(card).not.toHaveClass(/upset/);
  await expect(card.locator(".upset-banner")).toHaveCount(0);
});

test("if the lower-ranked team holds on, the card becomes an upset final", async ({ page }) => {
  const worse = fpi(0) > fpi(1) ? 0 : 1;
  const card = await openScores(page, worse === 0 ? 27 : 13, worse === 0 ? 13 : 27, "post");
  await expect(card).toHaveClass(/upset-final/);
  await expect(card.locator(".upset-banner")).toContainText(/upset final/i);
});
