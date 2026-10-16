import { expect, test } from "@playwright/test";
import { buildRows, tierFor, type ResultLike, type SlateLike } from "../src/upsetMeter";

const team = (abbr: string, extra = {}) => ({ name: abbr, abbr, logoId: abbr.toLowerCase(), color: null, ...extra });
const game = (id: string, pHome: number, away = [72, 3], home = [75, 3]): SlateLike => ({
  id, espnId: id, league: "CFB", date: "2026-10-17T16:00Z",
  teams: [team("AAA", { rankings: ["AP #7"] }), team("HHH")],
  winProb: { home: pHome },
  projected: { parts: [{ id: "line", away: 20, home: 20 + (pHome > 50 ? 10.04 : -10.04) }] },
});

test("tiers follow the underdog's chance", () => {
  expect([2, 7.9, 8, 19.9, 20, 31.9, 32, 43.9, 44, 50].map((p) => tierFor(p).id)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("the favorite, the line and the tier come from the pre-game win probability", () => {
  const rows = buildRows({ league: "CFB", games: [game("g1", 92), game("g2", 30)], results: [], live: {}, period: "w" });
  expect(rows.map((r) => [r.key, r.favorite, r.upsetPct, r.tier.id, r.line])).toEqual([
    ["g-g1", 1, 8, 2, 10], // the home team is favored; the road team has 8%
    ["g-g2", 0, 30, 3, 10], // the road team is favored; the home team has 30%
  ]);
  expect(rows[1].teams[0].rank).toBe(7); // the AP rank rides along
});

test("a final game is graded against its pre-game number and an upset is flagged", () => {
  const results: ResultLike[] = [
    { espnId: "r1", league: "CFB", week: "w", date: "2026-10-15T00:00Z", teams: [{ ...team("AAA"), score: 24 }, { ...team("HHH"), score: 17 }], final: { detail: "Final" }, forecast: { pHome: 0.8, line: "HHH -7.5 • O/U 50" } },
    { espnId: "r2", league: "CFB", week: "w", date: "2026-10-15T01:00Z", teams: [{ ...team("BBB"), score: 10 }, { ...team("III"), score: 31 }], final: { detail: "Final" }, forecast: { pHome: 80, line: "III -9" } },
    { espnId: "r3", league: "CFB", week: "old", date: "2026-10-08T01:00Z", teams: [{ ...team("CCC"), score: 1 }, { ...team("JJJ"), score: 2 }], final: { detail: "Final" }, forecast: { pHome: 50, line: null } },
  ];
  const rows = buildRows({ league: "CFB", games: [], results, live: {}, period: "w" });
  expect(rows).toHaveLength(2); // last week's game is not on this week's meter
  const up = rows.find((r) => r.key === "r-r1")!, held = rows.find((r) => r.key === "r-r2")!;
  expect([up.status, up.upset, up.line]).toEqual(["final", true, 7.5]); // the 20% road underdog won
  expect([held.upset, held.score]).toEqual([false, [10, 31]]);
});

test("live and just-finished slate games update from the live feed; a game in the results is not listed twice", () => {
  const g = game("g1", 85);
  const live = buildRows({ league: "CFB", games: [g], results: [], live: { g1: { state: "in", detail: "Q3 4:10", away: 21, home: 14 } }, period: "w" })[0];
  expect([live.status, live.brewing, live.upset]).toEqual(["live", true, false]); // the 15% underdog leads
  const done = buildRows({ league: "CFB", games: [g], results: [], live: { g1: { state: "post", detail: "Final", away: 21, home: 14 } }, period: "w" })[0];
  expect([done.status, done.upset, done.score]).toEqual(["final", true, [21, 14]]);
  const dup = buildRows({ league: "CFB", games: [g], period: "w", live: {}, results: [{ espnId: "g1", league: "CFB", week: "w", date: "d", teams: [{ ...team("AAA"), score: 1 }, { ...team("HHH"), score: 2 }], final: { detail: "Final" }, forecast: { pHome: 85, line: null } }] });
  expect(dup).toHaveLength(1);
});
