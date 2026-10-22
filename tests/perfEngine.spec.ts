// The shared performance calculations: definitions (scripts/perf/lib.mjs) and the one computation layer (src/perf/engine.ts).
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { isGarbage, isSuccess, fieldBand, emptyVec, addPlay, sumVec, derive, V } from "../scripts/perf/lib.mjs";
import { percentile, summarize, leagueSummaries, leagueAverage, measure, gamesFor, defenseVec, offenseVec, finishing, driveStats, PROFILE_METRICS } from "../src/perf/engine";
import { DEFAULT_SELECTION, type PerfData, type PerfSelection } from "../src/perf/types";

const nfl: PerfData = JSON.parse(readFileSync("src/data/perf-nfl.json", "utf8"));
const sel = (o: Partial<PerfSelection> = {}): PerfSelection => ({ ...DEFAULT_SELECTION, ...o });

test.describe("definitions", () => {
  test("success rate uses 40 / 60 / 100 percent of the yards to go", () => {
    expect(isSuccess(1, 10, 4)).toBe(true);
    expect(isSuccess(1, 10, 3)).toBe(false);
    expect(isSuccess(2, 10, 6)).toBe(true);
    expect(isSuccess(2, 10, 5)).toBe(false);
    expect(isSuccess(3, 4, 4)).toBe(true);
    expect(isSuccess(3, 4, 3)).toBe(false);
    expect(isSuccess(4, 1, 1)).toBe(true);
  });
  test("garbage time needs a big gap late enough, and never applies in overtime", () => {
    expect(isGarbage(1, 38)).toBe(false);
    expect(isGarbage(1, 39)).toBe(true);
    expect(isGarbage(4, 16)).toBe(false);
    expect(isGarbage(4, 17)).toBe(true);
    expect(isGarbage(5, 40)).toBe(false);
  });
  test("field position bands partition the field", () => {
    const seen = new Set<number>();
    for (let yl = 1; yl <= 99; yl++) seen.add(fieldBand(yl));
    expect(seen.size).toBeGreaterThan(1);
    expect([...seen].every((i) => Number.isInteger(i) && i >= 0)).toBe(true);
  });
  test("summing vectors is additive and an empty vector derives nulls, not zeros", () => {
    const a = emptyVec(), b = emptyVec();
    a[V.PN] = 3; b[V.PN] = 4;
    expect(sumVec(a, b)[V.PN]).toBe(7);
    const d = derive(emptyVec());
    expect(d.passEpa ?? null).toBeNull();
    expect(d.successRate ?? null).toBeNull();
  });
  test("addPlay is exported for the builders", () => { expect(typeof addPlay).toBe("function"); });
});

test.describe("percentile", () => {
  const pop = [1, 2, 3, 4, 5];
  test("higher is better ranks the largest value highest", () => {
    expect(percentile(5, pop, true)).toBeGreaterThan(percentile(1, pop, true)!);
  });
  test("lower is better inverts, so a stingy defense ranks high", () => {
    expect(percentile(1, pop, false)).toBe(percentile(5, pop, true));
    expect(percentile(5, pop, false)).toBe(percentile(1, pop, true));
  });
  test("ties count half and missing values are not zeros", () => {
    expect(percentile(3, [3, 3, 3, 3], true)).toBe(50);
    expect(percentile(null, pop, true)).toBeNull();
    expect(percentile(2, [null, null], true)).toBeNull();
    expect(percentile(2, [null, 1, 3], true)).toBe(50);
  });
});

test.describe("engine on the NFL file", () => {
  const team = nfl.rows[0].t;
  test("a defense is exactly its opponents' offenses in the same games", () => {
    const rows = gamesFor(nfl, team, sel());
    const v = defenseVec(nfl, rows, "all");
    const byKey = new Map(nfl.rows.map((r) => [`${r.g}|${r.t}`, r]));
    const check = emptyVec();
    for (const r of rows) { const o = byKey.get(`${r.g}|${r.o}`)!; sumVec(check, o.c); sumVec(check, o.x); }
    expect(v).toEqual(check);
  });
  test("skipping garbage time removes plays and never adds them", () => {
    const all = summarize(nfl, team, sel({ garbage: "all" })), clean = summarize(nfl, team, sel({ garbage: "skip" }));
    expect(clean.playsOff).toBeLessThanOrEqual(all.playsOff);
    expect(clean.drives.drives).toBeLessThanOrEqual(all.drives.drives);
  });
  test("recent window keeps the latest N games in order", () => {
    const all = gamesFor(nfl, team, sel()), recent = gamesFor(nfl, team, sel({ window: "recent", recentN: 3 }));
    expect(recent).toEqual(all.slice(-3));
  });
  test("league average equals the sum of every team's offense", () => {
    const avg = leagueAverage(nfl, sel());
    const total = emptyVec();
    for (const s of leagueSummaries(nfl, sel()).values()) sumVec(total, s.offVec);
    expect(avg.offVec).toEqual(total);
  });
  test("league offense and league defense balance: plays run equal plays faced", () => {
    let off = 0, def = 0;
    for (const s of leagueSummaries(nfl, sel()).values()) { off += s.playsOff; def += s.playsDef; }
    expect(off).toBe(def);
  });
  test("measure gives a percentile per metric, with defense inverted", () => {
    const res = measure(nfl, sel(), team);
    expect(res.map((r) => r.def.id)).toEqual(PROFILE_METRICS.map((m) => m.id));
    const all = leagueSummaries(nfl, sel());
    for (const r of res) {
      if (r.value == null || r.pct == null) continue;
      expect(r.pct).toBeGreaterThanOrEqual(0); expect(r.pct).toBeLessThanOrEqual(100);
      const pop = [...all.values()].map((s) => r.def.read(s, nfl.config.hasEpa));
      expect(r.pct).toBe(percentile(r.value, pop, r.def.higherIsBetter));
      expect(r.rank).toBeGreaterThanOrEqual(1); expect(r.rank).toBeLessThanOrEqual(r.of);
    }
  });
  test("finishing denominators nest: red zone ⊆ scoring chances ⊆ all drives", () => {
    const rows = gamesFor(nfl, team, sel());
    const a = finishing(rows, "all", "all"), o = finishing(rows, "all", "opportunity"), z = finishing(rows, "all", "redzone");
    expect(z.n).toBeLessThanOrEqual(o.n); expect(o.n).toBeLessThanOrEqual(a.n);
    for (const f of [a, o, z]) expect(f.td + f.fg + f.turnover + f.empty).toBe(f.n);
  });
  test("drive points reconcile with the final score for most team-games", () => {
    let exact = 0;
    for (const r of nfl.rows) if (r.d.reduce((s, d) => s + d[7], 0) === r.pf) exact++;
    expect(exact / nfl.rows.length).toBeGreaterThan(0.6);
  });
  test("drive stats on no games return nulls instead of zeros", () => {
    const s = driveStats([], "all");
    expect(s.drives).toBe(0);
    expect(s.pointsPerDrive).toBeNull();
    expect(s.scoringRate).toBeNull();
  });
  test("an empty selection does not throw", () => {
    const s = summarize(nfl, "ZZZ", sel());
    expect(s.games).toHaveLength(0);
    expect(offenseVec([], "all")).toEqual(emptyVec());
  });
});

test("college data, when built, excludes FCS opponents by default", () => {
  test.skip(!existsSync("src/data/perf-cfb.json"), "perf-cfb.json not built");
  const cfb: PerfData = JSON.parse(readFileSync("src/data/perf-cfb.json", "utf8"));
  expect(cfb.config.hasEpa).toBe(false);
  const fbsTeam = Object.keys(cfb.teams).find((t) => cfb.teams[t].fbs)!;
  const kept = gamesFor(cfb, fbsTeam, sel());
  expect(kept.every((r) => cfb.teams[r.o]?.fbs === true)).toBe(true);
  expect(gamesFor(cfb, fbsTeam, sel({ includeFcs: true })).length).toBeGreaterThanOrEqual(kept.length);
});
