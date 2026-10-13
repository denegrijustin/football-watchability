/** Fits the simulator's few constants to the season's played games, and tests them out of sample. Pure: takes the app's Model. */
import type { Model, Projection, GameResult } from "../data/types";
import { gameIndex } from "../data/games";
import { DEFAULT_PARAMS, expectation, type SimParams, type TeamRatings } from "./engine";
import { normCdf } from "./rng";

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sdOf = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

export function ratingsFor(model: Model, name: string, week: number): TeamRatings | null {
  const t = model.byId.get(`FBS:${name}`);
  const w = t?.weeks[week];
  if (!t || !w || w.sp == null || w.off == null || w.def == null) return null;
  return { name, sp: w.sp, off: w.off, def: w.def, st: w.st ?? 0 };
}

export function leagueAvgPts(model: Model, week: number): number {
  const v: number[] = [];
  for (const t of model.teams) { if (t.division !== "FBS") continue; const w = t.weeks[week]; if (w?.off != null && w?.def != null) v.push((w.off + w.def) / 2); }
  return v.length ? mean(v) : DEFAULT_PARAMS.leagueAvgPts;
}

export interface PlayedGame {
  week: number; date: string; home: string; away: string; neutral: boolean;
  /** Pre-game ratings (the rating table of the game's own week). */
  h: TeamRatings; a: TeamRatings; avg: number;
  homePts: number; awayPts: number;
  sheet: { margin: number | null; total: number | null; homeWinProb: number | null };
  projection: Projection;
}

/** Every FBS-vs-FBS projection that has a final in the postgame sheet. One result row is enough to know both scores. */
export function playedGames(model: Model): PlayedGame[] {
  const idx = gameIndex(model);
  const out: PlayedGame[] = [];
  for (const p of model.projections) {
    const h = ratingsFor(model, p.home, p.week), a = ratingsFor(model, p.away, p.week);
    if (!h || !a || !p.date) continue;
    const row: GameResult | undefined = idx.resultFor(p)?.winner ?? [...(idx.byTeam.get(p.home) ?? []), ...(idx.byTeam.get(p.away) ?? [])].find((r) => [p.home, p.away].includes(r.team) && [p.home, p.away].includes(r.opp) && Math.abs(Date.parse(r.date) - Date.parse(p.date!)) <= 864e5);
    if (!row || row.pts == null || row.oppPts == null) continue;
    const homePts = row.team === p.home ? row.pts : row.oppPts;
    const awayPts = row.team === p.home ? row.oppPts : row.pts;
    const [sa, sb] = (p.projScore ?? "").split("-").map(Number);
    const sheetHomeMargin = p.projMargin == null || !p.projWinner ? null : p.projWinner === p.home ? p.projMargin : -p.projMargin;
    const hw = p.winProb == null || !p.projWinner ? null : p.projWinner === p.home ? p.winProb : 1 - p.winProb;
    out.push({ week: p.week, date: p.date, home: p.home, away: p.away, neutral: p.neutral, h, a, avg: leagueAvgPts(model, p.week), homePts, awayPts, sheet: { margin: sheetHomeMargin, total: Number.isFinite(sa + sb) ? sa + sb : null, homeWinProb: hw }, projection: p });
  }
  return out;
}

interface Row { g: PlayedGame; spDiff: number; hfaOn: number; raw: number; actM: number; actT: number }
const rowsOf = (games: PlayedGame[]): Row[] => games.map((g) => ({ g, spDiff: g.h.sp - g.a.sp, hfaOn: g.neutral ? 0 : 1, raw: g.h.off + g.a.def + g.a.off + g.h.def - 2 * g.avg, actM: g.homePts - g.awayPts, actT: g.homePts + g.awayPts }));

/** The sheet's own home-field number: its projected margin minus the SP+ gap, averaged over non-neutral games. */
export function sheetHomeField(games: PlayedGame[]): number | null {
  const d = games.filter((g) => !g.neutral && g.sheet.margin != null).map((g) => g.sheet.margin! - (g.h.sp - g.a.sp));
  return d.length >= 20 ? Math.round(mean(d) * 100) / 100 : null;
}

export function fit(games: PlayedGame[], week: number | null, hfa?: number): SimParams {
  if (games.length < 60) return { ...DEFAULT_PARAMS, fit: { games: games.length, week, source: "default" } };
  const hf = hfa ?? sheetHomeField(games) ?? DEFAULT_PARAMS.hfa;
  const rows = rowsOf(games);
  const resM = rows.map((r) => r.actM - (r.spDiff + hf * r.hfaOn));
  // Total: least squares of the real total on the rating-implied total.
  const mx = mean(rows.map((r) => r.raw)), my = mean(rows.map((r) => r.actT));
  let sxy = 0, sxx = 0;
  for (const r of rows) { sxy += (r.raw - mx) * (r.actT - my); sxx += (r.raw - mx) ** 2; }
  const beta = sxx > 0 ? Math.min(1.2, Math.max(0, sxy / sxx)) : 1;
  const alpha = my - beta * mx;
  const resT = rows.map((r) => r.actT - (alpha + beta * r.raw));
  const mM = mean(resM), mT = mean(resT);
  const rho = mean(resM.map((x, i) => (x - mM) * (resT[i] - mT))) / (sdOf(resM) * sdOf(resT) || 1);
  return {
    hfa: hf, sigmaMargin: Math.sqrt(mean(resM.map((x) => x * x))), sigmaTotal: sdOf(resT), rho: Math.max(-0.5, Math.min(0.5, rho)),
    totalAlpha: alpha, totalBeta: beta, leagueAvgPts: DEFAULT_PARAMS.leagueAvgPts, fit: { games: games.length, week, source: "fit" },
  };
}

const cache = new WeakMap<Model, Map<number, SimParams>>();
/** Parameters for ratings taken from `week`, fitted to every game played so far. */
export function paramsFor(model: Model, week: number): SimParams {
  let m = cache.get(model);
  if (!m) { m = new Map(); cache.set(model, m); }
  let p = m.get(week);
  if (!p) { p = { ...fit(playedGames(model), week), leagueAvgPts: leagueAvgPts(model, week) }; m.set(week, p); }
  return p;
}

export interface Backtest {
  games: number;
  weeks: number[];
  /** Out of sample: every week is predicted from constants fitted on the other weeks. */
  margin: { mae: number; rmse: number; bias: number; biasSe: number; sheetMae: number | null };
  total: { maeCalibrated: number; maeRaw: number; maeSheet: number | null };
  winProb: { brier: number; sheetBrier: number | null; logLoss: number; sheetLogLoss: number | null; baselineBrier: number; accuracy: number };
  coverage: { margin50: number; margin80: number; total50: number; total80: number };
  buckets: { lo: number; hi: number; n: number; predicted: number; actual: number }[];
  tendency: { rmseWithout: number; rmseWith: number } | null;
  params: SimParams;
}

export function backtest(model: Model): Backtest | null {
  const all = playedGames(model);
  const weeks = [...new Set(all.map((g) => g.week))].sort((a, b) => a - b);
  if (all.length < 60 || weeks.length < 3) return null;
  const pm: { p: number; y: number; sheetP: number | null; hit: boolean }[] = [];
  const errM: number[] = [], errT: number[] = [], errTraw: number[] = [], sheetErrM: number[] = [], sheetErrT: number[] = [];
  const c = { m50: 0, m80: 0, t50: 0, t80: 0 };
  for (const w of weeks) {
    const train = all.filter((g) => g.week !== w), test = all.filter((g) => g.week === w);
    const par = fit(train, w);
    for (const g of test) {
      const e = expectation({ ...par, leagueAvgPts: g.avg }, g.a, g.h, g.neutral ? "neutral" : "b-home"); // A = away, B = home
      const muHome = -e.margin;
      const actM = g.homePts - g.awayPts, actT = g.homePts + g.awayPts;
      errM.push(actM - muHome); errT.push(actT - e.total); errTraw.push(actT - e.parts.rawTotal);
      if (g.sheet.margin != null) sheetErrM.push(actM - g.sheet.margin);
      if (g.sheet.total != null) sheetErrT.push(actT - g.sheet.total);
      const p = normCdf(muHome / par.sigmaMargin);
      pm.push({ p, y: actM > 0 ? 1 : actM < 0 ? 0 : 0.5, sheetP: g.sheet.homeWinProb, hit: actM === 0 ? false : (p >= 0.5) === (actM > 0) });
      if (Math.abs(actM - muHome) <= 0.674 * par.sigmaMargin) c.m50++;
      if (Math.abs(actM - muHome) <= 1.282 * par.sigmaMargin) c.m80++;
      if (Math.abs(actT - e.total) <= 0.674 * par.sigmaTotal) c.t50++;
      if (Math.abs(actT - e.total) <= 1.282 * par.sigmaTotal) c.t80++;
    }
  }
  const N = errM.length;
  const brier = (f: (x: typeof pm[number]) => number | null) => { const v = pm.map((x) => { const q = f(x); return q == null ? null : (q - x.y) ** 2; }).filter((x): x is number => x != null); return v.length ? mean(v) : null; };
  const ll = (f: (x: typeof pm[number]) => number | null) => { const v = pm.map((x) => { const q = f(x); if (q == null) return null; const qq = Math.min(0.999, Math.max(0.001, q)); return -(x.y * Math.log(qq) + (1 - x.y) * Math.log(1 - qq)); }).filter((x): x is number => x != null); return v.length ? mean(v) : null; };
  const buckets = Array.from({ length: 10 }, (_, i) => {
    const lo = i / 10, hi = (i + 1) / 10;
    const s = pm.filter((x) => x.p >= lo && (x.p < hi || (i === 9 && x.p <= 1)));
    return { lo, hi, n: s.length, predicted: mean(s.map((x) => x.p)), actual: mean(s.map((x) => x.y)) };
  }).filter((b) => b.n > 0);
  // Test whether a team's own scoring tendency (actual total minus expected, using only earlier games) helps predict totals.
  const tendency = (() => {
    const sorted = [...all].sort((a, b) => a.date.localeCompare(b.date));
    const par = fit(all, null);
    const hist = new Map<string, { n: number; s: number }>();
    const without: number[] = [], withT: number[] = [];
    for (const g of sorted) {
      const e = par.totalAlpha + par.totalBeta * (g.h.off + g.a.def + g.a.off + g.h.def - 2 * g.avg);
      const ta = hist.get(g.away) ?? { n: 0, s: 0 }, th = hist.get(g.home) ?? { n: 0, s: 0 };
      const adj = ta.s / (ta.n + 4) + th.s / (th.n + 4);
      const act = g.homePts + g.awayPts;
      without.push(act - e); withT.push(act - (e + adj));
      const r = (act - e) / 2;
      hist.set(g.away, { n: ta.n + 1, s: ta.s + r }); hist.set(g.home, { n: th.n + 1, s: th.s + r });
    }
    return { rmseWithout: Math.sqrt(mean(without.map((x) => x * x))), rmseWith: Math.sqrt(mean(withT.map((x) => x * x))) };
  })();
  const seM = sdOf(errM) / Math.sqrt(N);
  return {
    games: N, weeks,
    margin: { mae: mean(errM.map(Math.abs)), rmse: Math.sqrt(mean(errM.map((x) => x * x))), bias: mean(errM), biasSe: seM, sheetMae: sheetErrM.length ? mean(sheetErrM.map(Math.abs)) : null },
    total: { maeCalibrated: mean(errT.map(Math.abs)), maeRaw: mean(errTraw.map(Math.abs)), maeSheet: sheetErrT.length ? mean(sheetErrT.map(Math.abs)) : null },
    winProb: { brier: brier((x) => x.p)!, sheetBrier: brier((x) => x.sheetP), logLoss: ll((x) => x.p)!, sheetLogLoss: ll((x) => x.sheetP), baselineBrier: 0.25, accuracy: mean(pm.map((x) => (x.hit ? 1 : 0))) },
    coverage: { margin50: c.m50 / N, margin80: c.m80 / N, total50: c.t50 / N, total80: c.t80 / N },
    buckets, tendency, params: fit(all, null),
  };
}
