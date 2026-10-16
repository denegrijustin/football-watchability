import { expect, test } from "@playwright/test";
import { MIN_UPSET_GAP, buildRows, tierFor, type RankSource, type ResultLike, type SlateLike } from "../src/upsetMeter";

const team = (abbr: string, extra = {}) => ({ name: abbr, abbr, logoId: abbr.toLowerCase(), color: null, ...extra });
const RANKS: Record<string, number> = { AAA: 3, HHH: 90, BBB: 50, III: 10, LLL: 40, MMM: 42, PPP: 12, QQQ: 14, RRR: 13, SSS: 23 };
const ranks: RankSource = { of: 100, rankOf: (t) => RANKS[t.abbr] ?? null };
const game = (id: string, away: string, home: string): SlateLike => ({
  id, espnId: id, league: "CFB", date: "2026-10-17T16:00Z", teams: [team(away), team(home)],
  projected: { parts: [{ id: "line", away: 30, home: 20.04 }] },
});

test("tiers follow how far apart the ranks are, as a share of the league", () => {
  expect([0.9, 0.45, 0.449, 0.28, 0.279, 0.14, 0.139, 0.05, 0.049, 0.01].map((g) => tierFor(g).id)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("the better-ranked team is the favorite, the gap sets the tier, and the line is only shown", () => {
  const rows = buildRows({ league: "CFB", games: [game("g1", "AAA", "HHH"), game("g2", "BBB", "III"), game("g3", "LLL", "MMM")], results: [], live: {}, period: "w", ranks });
  // Most lopsided first.
  expect(rows.map((r) => [r.key, r.favorite, r.gap, r.tier.id])).toEqual([
    ["g-g1", 0, 87, 1], // the road team is #3, the home team #90
    ["g-g2", 1, 40, 2], // the home team is #10 against #50
    ["g-g3", 0, 2, 5], // #40 at #42 is a pick'em
  ]);
  expect(rows[0].line).toBe(10); // the 30-20.04 betting margin, for reference only
  expect(rows[0].teams[0].rank).toBe(3);
});

test("a team without a rank (an FCS opponent) counts as just below the field; two unranked teams are skipped", () => {
  const rows = buildRows({ league: "CFB", games: [game("g1", "AAA", "ZZZ"), game("g2", "YYY", "ZZZ")], results: [], live: {}, period: "w", ranks });
  expect(rows).toHaveLength(1);
  expect([rows[0].favorite, rows[0].gap, rows[0].tier.id]).toEqual([0, 98, 1]);
});

test("a final game is graded on rank: the lower-ranked team winning is an upset", () => {
  const res = (id: string, a: [string, number], h: [string, number], week = "w"): ResultLike => ({
    espnId: id, league: "CFB", week, date: "2026-10-15T00:00Z", teams: [{ ...team(a[0]), score: a[1] }, { ...team(h[0]), score: h[1] }], final: { detail: "Final" }, forecast: { line: "HHH -7.5 • O/U 50" },
  });
  const rows = buildRows({ league: "CFB", games: [], results: [res("r1", ["AAA", 17], ["HHH", 24]), res("r2", ["BBB", 31], ["III", 10]), res("r3", ["AAA", 30], ["HHH", 3]), res("old", ["AAA", 1], ["HHH", 2], "old")], live: {}, period: "w", ranks });
  expect(rows).toHaveLength(3); // last week's game is not on this week's meter
  const by = (k: string) => rows.find((r) => r.key === k)!;
  expect(by("r-r1").upset).toBe(true); // #90 beat #3
  expect(by("r-r2").upset).toBe(true); // #50 beat #10
  expect(by("r-r3").upset).toBe(false); // #3 beat #90
  expect(by("r-r1").line).toBe(7.5);
});

test("an upset needs the teams to be at least 10 places apart: #14 beating #12 is not one, #23 beating #13 is", () => {
  expect(MIN_UPSET_GAP).toBe(10);
  const res = (id: string, a: [string, number], h: [string, number]): ResultLike => ({
    espnId: id, league: "CFB", week: "w", date: "2026-10-15T00:00Z", teams: [{ ...team(a[0]), score: a[1] }, { ...team(h[0]), score: h[1] }], final: { detail: "Final" }, forecast: { line: null },
  });
  const rows = buildRows({ league: "CFB", games: [], results: [res("close", ["QQQ", 20], ["PPP", 17]), res("ten", ["SSS", 20], ["RRR", 17]), res("nine", ["MMM", 20], ["LLL", 17])], live: {}, period: "w", ranks });
  const by = (k: string) => rows.find((r) => r.key === k)!;
  expect([by("r-close").gap, by("r-close").upset]).toEqual([2, false]); // #14 over #12
  expect([by("r-ten").gap, by("r-ten").upset]).toEqual([10, true]); // #23 over #13: exactly 10 places
  expect(by("r-nine").upset).toBe(false); // #42 over #40
  // And a close game in progress is never "brewing".
  const live = buildRows({ league: "CFB", games: [game("g9", "QQQ", "PPP")], results: [], live: { g9: { state: "in", detail: "Q4", away: 14, home: 10 } }, period: "w", ranks })[0];
  expect(live.brewing).toBe(false);
});

test("live and just-finished slate games update from the live feed; a game in the results is not listed twice", () => {
  const g = game("g1", "AAA", "HHH");
  const live = buildRows({ league: "CFB", games: [g], results: [], live: { g1: { state: "in", detail: "Q3 4:10", away: 7, home: 14 } }, period: "w", ranks })[0];
  expect([live.status, live.brewing, live.upset]).toEqual(["live", true, false]); // #90 leads #3
  const done = buildRows({ league: "CFB", games: [g], results: [], live: { g1: { state: "post", detail: "Final", away: 7, home: 14 } }, period: "w", ranks })[0];
  expect([done.status, done.upset, done.score]).toEqual(["final", true, [7, 14]]);
  const dup = buildRows({ league: "CFB", games: [g], period: "w", live: {}, ranks, results: [{ espnId: "g1", league: "CFB", week: "w", date: "d", teams: [{ ...team("AAA"), score: 1 }, { ...team("HHH"), score: 2 }], final: { detail: "Final" }, forecast: { line: null } }] });
  expect(dup).toHaveLength(1);
});
