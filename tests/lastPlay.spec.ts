import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { choreograph, parsePlay } from "../src/lastPlay";
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
          { id: "1", team: a.espnId, period: 3, clock: "6:00", text: "Run Man rush left end for 4 yards", kind: "Rush", yards: 4, toGo: null, offense: true, score: false, turnover: false },
          { id: "2", team: a.espnId, period: 3, clock: "5:40", text: "Pat Passer pass deep right to Wes Receiver for 31 yards to the SEA 35", kind: "Pass Reception", yards: 31, toGo: null, offense: true, score: false, turnover: false },
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
