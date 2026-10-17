import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { choreograph, parsePlay, playDetail } from "../src/lastPlay";
import { driveHistory, driveStats } from "../src/driveHistory";
import { helmetFor, NFL_HELMETS } from "../src/helmets";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const games = slate.games.filter((g: any) => g.league === "NFL");
const P = (text: string, kind: string, yards: number, extra: object = {}) => parsePlay({ text, kind, yards, ...extra })!;

test("play text becomes the shape of the play: side, depth, gap, kick", () => {
  const a = P("Josh Allen pass deep left to Stefon Diggs for 38 yards to the KC 20", "Pass Reception", 38);
  expect(a).toMatchObject({ type: "pass", side: "left", depth: "deep", complete: true, passer: "Allen", target: "Diggs", yards: 38 });
  const b = P("Josh Allen pass incomplete short right to Dalton Kincaid", "Pass Incompletion", 0);
  expect(b).toMatchObject({ type: "pass", side: "right", depth: "short", complete: false, target: "Kincaid" });
  expect(P("Josh Allen pass intercepted deep middle INTERCEPTED by Trent McDuffie at KC 30", "Interception", 0)).toMatchObject({ intercepted: true, complete: false, defender: "McDuffie" });
  expect(P("Derrick Henry rush left end for 9 yards (Roquan Smith)", "Rush", 9)).toMatchObject({ type: "rush", side: "left", gap: "end", rusher: "Henry", yards: 9 });
  expect(P("Derrick Henry rush up the middle for 2 yards", "Rush", 2)).toMatchObject({ side: "middle", gap: "middle" });
  expect(P("Derrick Henry rush right tackle for 4 yards", "Rush", 4)).toMatchObject({ side: "right", gap: "tackle" });
  expect(P("Josh Allen sacked at BUF 22 for -8 yards (Chris Jones)", "Sack", -8)).toMatchObject({ type: "sack", yards: -8, defender: "Jones" });
  expect(P("Tyler Bass 42 yard field goal GOOD", "Field Goal Good", 0)).toMatchObject({ type: "fg", good: true, distance: 42 });
  expect(P("Tyler Bass 51 yard field goal is No Good, Wide Left", "Field Goal Missed", 0)).toMatchObject({ type: "fg", good: false });
  expect(P("Sam Martin punts 45 yards to KC 20", "Punt", 45)).toMatchObject({ type: "punt", distance: 45 });
  expect(parsePlay({ text: "PENALTY on BUF, False Start, 5 yards", kind: "Penalty", yards: 0 })).toBeNull();
});

test("different plays get different art: a deep left pass and a short right one run different routes, a run goes through its own gap", () => {
  const deepLeft = choreograph(P("A pass deep left to B Diggs for 38 yards", "Pass Reception", 38));
  const shortRight = choreograph(P("A pass short right to B Diggs for 6 yards", "Pass Reception", 6));
  const tgt = (c: ReturnType<typeof choreograph>) => c.routes.find((r) => r.hot)!.pts;
  expect(tgt(deepLeft)[tgt(deepLeft).length - 1][1]).toBeLessThan(0); // the offense's left is negative across
  expect(tgt(shortRight)[tgt(shortRight).length - 1][1]).toBeGreaterThan(0);
  expect(deepLeft.end![0]).toBe(38);
  expect(shortRight.end![0]).toBe(6);
  const left = choreograph(P("C rush left end for 7 yards", "Rush", 7));
  const mid = choreograph(P("C rush up the middle for 7 yards", "Rush", 7));
  const lastY = (c: ReturnType<typeof choreograph>) => c.routes[0].pts[2][1];
  expect(lastY(left)).toBeLessThan(-5);
  expect(Math.abs(lastY(mid))).toBeLessThan(1);
  // every player and the ball have a start and an end
  for (const c of [deepLeft, shortRight, left, mid, choreograph(P("D punts 45 yards", "Punt", 45)), choreograph(P("E 42 yard field goal GOOD", "Field Goal Good", 0)), choreograph(P("F sacked at BUF 22 for -8 yards (G H)", "Sack", -8))]) {
    expect(c.actors).toHaveLength(22);
    for (const a of c.actors) { expect(a.kf[0][0]).toBe(0); expect(a.kf[a.kf.length - 1][0]).toBe(1); }
    expect(c.ball[0][0]).toBe(0);
    expect(c.ball[c.ball.length - 1][0]).toBe(1);
  }
  // an incomplete pass has no tackle mark, a field goal has posts
  expect(choreograph(P("A pass incomplete deep right to B", "Pass Incompletion", 0)).end).toBeNull();
  expect(choreograph(P("E 42 yard field goal GOOD", "Field Goal Good", 0)).posts).toBe(35);
});

test("every NFL team wears its own helmet, and a college team its own colour", () => {
  const ids = new Set<string>(games.flatMap((g: any) => g.teams.map((t: any) => t.logoId)));
  for (const id of ids) expect(NFL_HELMETS[id], id).toBeTruthy();
  expect(helmetFor("buffalo-bills", "#00338d").shell).toBe("#f4f5f7"); // white with red stripe, not the blue of the jersey
  expect(helmetFor("green-bay-packers", "#203731").shell).toBe("#ffb612");
  expect(helmetFor("lsu", "#461d7c")).toMatchObject({ shell: "#fdd023", decal: { text: "LSU", color: "#461d7c" } }); // gold with purple letters
  expect(helmetFor("texas", "#bf5700").shell).toBe("#f4f5f7"); // white, not burnt orange
  expect(helmetFor("kansas-state", "#512888")).toMatchObject({ shell: "#b9bec4" }); // silver, not the purple of the jersey
  expect(helmetFor("ohio-state", "#bb0000")).toEqual({ shell: "#bb0000", stripe: "#ffffff", mask: "#aab2ba" });
});

test("the Game Center shows the last play as play art drawn from the play", async ({ page }) => {
  const [a, h] = games[0].teams;
  const start = Math.max(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) => route.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: i === 0 ? "5:12 - 3rd" : "", away: 14, home: 17 })) }));
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (route) =>
    route.fulfill({
      json: {
        id: games[0].espnId,
        status: { state: "in", detail: "5:12 - 3rd", period: 3, clock: "5:12" },
        teams: [
          { id: a.espnId, abbr: a.abbr, name: a.name, homeAway: "away", score: 14, linescores: [], possession: true },
          { id: h.espnId, abbr: h.abbr, name: h.name, homeAway: "home", score: 17, linescores: [], possession: false },
        ],
        situation: { text: "2nd & 7 at SEA 35", possession: a.espnId, toGo: 65, redZone: false, lastPlay: "x" },
        drives: [{ team: a.espnId, from: 25, to: 40, yards: 15, plays: 2, result: "", score: false, time: "1:40", current: true }],
        curPlays: [],
        plays: [
          { id: "0", team: a.espnId, period: 3, clock: "7:10", text: "Run Man rush up the middle for 3 yards", kind: "Rush", yards: 3, toGo: 60, offense: true, score: false, turnover: false },
          { id: "1", team: a.espnId, period: 3, clock: "6:00", text: "Run Man rush left end for 4 yards", kind: "Rush", yards: 4, toGo: 57, offense: true, score: false, turnover: false },
          { id: "1b", team: a.espnId, period: 3, clock: "5:55", text: "Pat Passer pass short middle to Tim End for 6 yards", kind: "Pass Reception", yards: 6, toGo: 53, offense: true, score: false, turnover: false },
          { id: "1c", team: a.espnId, period: 3, clock: "5:50", text: "PENALTY on SEA, Offside, 5 yards", kind: "Penalty", yards: 5, toGo: 47, offense: true, score: false, turnover: false },
          { id: "2", team: a.espnId, period: 3, clock: "5:40", text: "Pat Passer pass deep right to Wes Receiver for 31 yards to the SEA 35", kind: "Pass Reception", yards: 31, toGo: 42, offense: true, score: false, turnover: false },
          { id: "3", team: a.espnId, period: 3, clock: "5:12", text: "Timeout #1 by ATL", kind: "Timeout", yards: 0, toGo: null, offense: true, score: false, turnover: false },
        ],
        wp: [], allOffense: [], scoring: [], teamStats: {}, players: {},
      },
    }),
  );
  await page.goto("/?league=NFL");
  await page.clock.resume();
  await page.locator(".board-section.live .game-card").first().locator(".cc-gc").click();
  const lp = page.locator("dialog.gc .gc-lastplay figure.lp");
  await expect(lp).toBeVisible();
  await expect(lp).toHaveAttribute("data-play", "pass"); // the timeout is skipped; the pass before it is shown
  await expect(lp).toHaveAttribute("data-facing", "right"); // the away team drives to the right
  await expect(lp.locator("g.lp-p")).toHaveCount(22);
  // one field: the whole thing with the home team's end zones and a conference mark at each 25, and the drive so far as boxes (the pass is the play on the field)
  await expect(lp.locator("[data-endzones]")).toHaveCount(1);
  await expect(lp.locator("svg.lp-svg")).toHaveAttribute("viewBox", "0 0 1200 560");
  await expect(lp.locator("g.lf-conf")).toHaveCount(2);
  await expect(lp.locator("g.lp-box")).toHaveCount(4);
  expect(await lp.locator("g.lp-box").evaluateAll((els) => els.map((e) => e.getAttribute("data-box")))).toEqual(["run", "run", "pass", "penalty"]);
  await expect(page.locator("dialog.gc .gc-livefield")).toHaveCount(0);
  // the drive's stats under the field: 2 runs for 7, 2 passes for 37, 4 plays for 44 yards, one flag
  const stat = (k: string) => lp.locator(`[data-stat="${k}"] dd`);
  await expect(stat("Run plays")).toHaveText("2");
  await expect(stat("Run yards")).toHaveText("7");
  await expect(stat("Pass plays")).toHaveText("2");
  await expect(stat("Pass yards")).toHaveText("37");
  await expect(stat("Total plays")).toHaveText("4");
  await expect(stat("Total yards")).toHaveText("44");
  expect((await stat("Penalty for").textContent())! + (await stat("Penalty against").textContent())!).toMatch(/1 · 5 yds/);
  await expect(lp.locator("path.lp-route[data-route='target']")).toHaveCount(1);
  await expect(lp.locator("g.lp-p .lp-name")).toContainText(["Passer", "Receiver"]);
  await expect(lp.locator("figcaption")).toContainText("Complete for 31 yards");
  await expect(lp.locator("figcaption")).toContainText("deep right");
  await page.waitForTimeout(3600);
  await lp.scrollIntoViewIfNeeded();
  await lp.locator("svg").screenshot({ path: process.env.LP_SHOT ?? "test-results/lastplay.png" });
  await lp.getByRole("button", { name: "Replay the last play" }).click();
  await expect(lp).toHaveAttribute("data-run", "1");
});

test("the drive history is the plays of the drive in progress, and a punt, a score, a turnover or a new possession clears it", () => {
  const A = "1", B = "2";
  const p = (id: string, team: string, text: string, kind: string, yards: number, toGo: number, extra: object = {}) => ({ id, team, text, kind, yards, toGo, ...extra });
  const plays = [
    p("a", B, "Z rush for 3 yards", "Rush", 3, 70),
    p("b", A, "X rush up the middle for 4 yards", "Rush", 4, 70),
    p("c", A, "Q pass short left to R for 12 yards", "Pass Reception", 12, 66),
    p("d", A, "PENALTY on ATL, holding, 10 yards", "Penalty", -10, 54),
    p("e", A, "Q pass incomplete deep right", "Pass Incompletion", 0, 64),
    p("f", A, "S punts 40 yards", "Punt", 40, 64),
    p("g", B, "Z pass short right to Y for 8 yards", "Pass Reception", 8, 70),
  ];
  // the away team (A) drives right: from its own 30 the first run goes 4 yards
  expect(driveHistory(plays, 4, A)).toEqual([
    { type: "run", from: 30, to: 34, yards: 4 },
    { type: "pass", from: 34, to: 46, yards: 12 },
    { type: "penalty", from: 46, to: 36, yards: -10 },
  ]);
  expect(driveHistory(plays, 5, A)).toEqual([]); // the punt clears the field
  expect(driveHistory(plays, 6, A)).toEqual([]); // the other team's first play after it: the earlier plays are not its drive
  expect(driveHistory(plays, 1, A)).toEqual([]); // a change of possession before it
  expect(driveHistory([p("t", A, "Q pass to R for 20 yards, TOUCHDOWN", "Passing Touchdown", 20, 20, { score: true })], 0, A)).toEqual([]);
  expect(driveHistory([p("i", A, "Q pass intercepted", "Pass Interception Return", 0, 40, { turnover: true })], 0, A)).toEqual([]);
});

test("punts, kickoffs, field goals and extra points are drawn, with their detail", () => {
  const punt = P("Sam Martin punts 52 yards to KC 20, returned by Marcus Jones for 8 yards to the KC 28", "Punt", 52);
  expect(punt).toMatchObject({ type: "punt", distance: 52, ret: { kind: "return", by: "Jones", yards: 8 }, kicker: "Martin" });
  expect(playDetail(punt)).toEqual(["Martin · punt of 52 yards", "Jones returns it 8 yards"]);
  const c = choreograph(punt);
  expect(c.end![0]).toBe(44); // 52 yards out, then 8 back
  expect(c.headline).toBe("Punt, 52 yards, returned 8 yards");
  expect(P("Sam Martin punts 40 yards to KC 20, fair catch by Marcus Jones", "Punt", 40).ret).toMatchObject({ kind: "fair", by: "Jones" });
  expect(P("Sam Martin punts 60 yards, Touchback", "Punt", 60).ret.kind).toBe("touchback");
  const ko = P("Cam Little kicks off 65 yards, returned by Khalil Herbert for 24 yards to the CHI 24", "Kickoff", 0);
  expect(ko).toMatchObject({ type: "kickoff", distance: 65, ret: { kind: "return", yards: 24 } });
  expect(choreograph(ko).actors).toHaveLength(22);
  expect(choreograph(ko).end![0]).toBe(41);
  const xp = P("Tyler Bass extra point is GOOD", "Extra Point Good", 0);
  expect(xp).toMatchObject({ type: "fg", xp: true, good: true });
  expect(choreograph(xp).headline).toBe("Extra point is good");
  expect(choreograph(P("Tyler Bass 51 yard field goal is No Good, Blocked", "Field Goal Missed", 0)).headline).toBe("51-yard field goal is blocked");
  expect(parsePlay({ text: "Team converts the two-point conversion", kind: "Two-Point Pass", yards: 0 })).toBeNull();
});

test("drive stats: runs, passes, flags for and against, totals", () => {
  const p = (id: string, team: string, text: string, kind: string, yards: number, toGo: number) => ({ id, team, text, kind, yards, toGo });
  const plays = [
    p("1", "1", "A rush left end for 5 yards", "Rush", 5, 70),
    p("2", "1", "B pass short right to C for 11 yards", "Pass Reception", 11, 65),
    p("3", "1", "PENALTY on KC, Offside, 5 yards", "Penalty", 5, 54),
    p("4", "1", "PENALTY on ATL, False Start, 5 yards", "Penalty", -5, 49),
    p("5", "1", "B sacked at ATL 40 for -7 yards (D E)", "Sack", -7, 54),
    p("6", "1", "S punts 41 yards to KC 19", "Punt", 41, 61),
  ];
  expect(driveStats(plays, 5, "ATL")).toEqual({
    runPlays: 1, runYards: 5, passPlays: 2, passYards: 4,
    penaltiesFor: { n: 1, yards: 5 }, penaltiesAgainst: { n: 1, yards: 5 },
    totalPlays: 3, totalYards: 9,
  });
  expect(driveStats(plays, 1, "ATL").totalPlays).toBe(2);
});
