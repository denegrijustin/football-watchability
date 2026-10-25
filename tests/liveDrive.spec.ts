import { expect, test } from "./fixtures";
import { hasCfbGame, NO_CFB } from "./helpers/slate";
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

/** A live card's field is fetched while the card is on screen (an IntersectionObserver), and on a phone the card starts below the first screen; a tall viewport puts it in view without scrolling. */
const tall = (page: import("@playwright/test").Page) => (test.info().project.name === "mobile" ? page.setViewportSize({ width: 390, height: 1800 }) : Promise.resolve());

/** A live card for NFL game 0 with these scores (state "in" or "post"); returns the card. */
async function openScores(page: import("@playwright/test").Page, away: number, home: number, state: "in" | "post" = "in", game: any = games[0]) {
  const start = Math.max(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any) => ({ id: g.espnId, state: g.espnId === game.espnId ? state : "pre", detail: state === "post" ? "Final" : "5:12 - 3rd", away, home })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (route) => route.fulfill({ json: summary(65, "2nd & 7 at SEA 35") }));
  await tall(page);
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

