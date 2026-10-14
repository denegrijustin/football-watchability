import type { NflData, NflGame, Ratings } from "./types";
import { DEFAULT_PARAMS, simulateExpectation, type Expectation, type SimParams, type SimResult } from "../spplus/sim/engine";
import { hashSeed } from "../spplus/sim/rng";
import type { AtsResult } from "../spplus/data/ats";

/** Logo file id of a team: "Seattle Seahawks" -> "seattle-seahawks" (the board shows the Broncos as the Donkeys; the logo stays the Broncos'). */
export const logoSlug = (name: string) => name.toLowerCase().replace("donkeys", "broncos").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const shortName = (name: string) => name.split(" ").pop() ?? name;

export const ratingsAt = (d: NflData, abbr: string, week: number): Ratings | null => d.teams[abbr]?.r[String(Math.max(1, Math.min(week, d.ratingsThroughWeek)))] ?? null;

export interface TeamRow {
  abbr: string; name: string; conf: string; div: string;
  rec: { w: number; l: number; t: number };
  r: Ratings;
  rank: { sp: number; off: number; def: number; st: number };
  prev: number | null;
  confRank: number; divRank: number;
}

const rankBy = (rows: { abbr: string; v: number }[], low = false) => {
  const m = new Map<string, number>();
  [...rows].sort((a, b) => (low ? a.v - b.v : b.v - a.v)).forEach((x, i) => m.set(x.abbr, i + 1));
  return m;
};

export function recordBefore(d: NflData, abbr: string, week: number) {
  const rec = { w: 0, l: 0, t: 0 };
  for (const g of d.games) {
    if (g.type !== "REG" || g.aS == null || g.hS == null || g.week >= week) continue;
    if (g.home !== abbr && g.away !== abbr) continue;
    const mine = g.home === abbr ? g.hS : g.aS, theirs = g.home === abbr ? g.aS : g.hS;
    if (mine > theirs) rec.w++; else if (mine < theirs) rec.l++; else rec.t++;
  }
  return rec;
}

export function teamRows(d: NflData, week: number): TeamRow[] {
  const abbrs = Object.keys(d.teams).filter((a) => ratingsAt(d, a, week));
  const at = (w: number) => abbrs.map((a) => ({ abbr: a, v: ratingsAt(d, a, w)![0] }));
  const sp = rankBy(at(week)), prev = week > 1 ? rankBy(at(week - 1)) : null;
  const off = rankBy(abbrs.map((a) => ({ abbr: a, v: ratingsAt(d, a, week)![1] })));
  const def = rankBy(abbrs.map((a) => ({ abbr: a, v: ratingsAt(d, a, week)![2] })), true);
  const st = rankBy(abbrs.map((a) => ({ abbr: a, v: ratingsAt(d, a, week)![3] })));
  const rows = abbrs.map((a): TeamRow => ({
    abbr: a, name: d.teams[a].name, conf: d.teams[a].conf, div: d.teams[a].div, rec: recordBefore(d, a, week), r: ratingsAt(d, a, week)!,
    rank: { sp: sp.get(a)!, off: off.get(a)!, def: def.get(a)!, st: st.get(a)! }, prev: prev?.get(a) ?? null, confRank: 0, divRank: 0,
  }));
  for (const key of ["conf", "div"] as const) {
    for (const g of new Set(rows.map((r) => r[key]))) {
      rows.filter((r) => r[key] === g).sort((a, b) => a.rank.sp - b.rank.sp).forEach((r, i) => { if (key === "conf") r.confRank = i + 1; else r.divRank = i + 1; });
    }
  }
  return rows;
}

// ---- projection --------------------------------------------------------------------------------------------------------------------------

export type Basis = "market" | "ratings";
export type NflVenue = "a-home" | "b-home" | "neutral";

export interface NflProjection {
  away: string; home: string; neutral: boolean; week: number;
  basis: Basis;
  /** Expected margin and total used (home minus away). */
  marginHome: number; total: number;
  ratingsMarginHome: number; ratingsTotal: number;
  market: { spread: number | null; total: number | null };
  params: SimParams;
  expectation: Expectation;
  sim: SimResult;
  /** Both teams' ratings used. */
  awayR: Ratings; homeR: Ratings;
}

export const simParams = (d: NflData, basis: Basis): SimParams => ({
  ...DEFAULT_PARAMS,
  hfa: d.params.model.c0,
  sigmaMargin: basis === "market" ? d.params.market.sigmaMargin : d.params.model.sigma,
  sigmaTotal: basis === "market" ? d.params.market.sigmaTotal : d.params.total.sigma,
  rho: d.params.rho, totalAlpha: 0, totalBeta: 1, leagueAvgPts: d.params.scale.P,
  fit: { games: d.backtest.calibration.games, week: null, source: "fit" },
});

/** The ratings' own expected margin and total for any pairing (away at home, or neutral). */
export function ratingsExpectation(d: NflData, away: string, home: string, week: number, neutral: boolean) {
  const A = ratingsAt(d, away, week), H = ratingsAt(d, home, week);
  if (!A || !H) return null;
  const P = d.params.scale.P;
  const marginHome = (neutral ? 0 : d.params.model.c0) + d.params.model.c1 * (H[0] - A[0]);
  const total = d.params.total.a0 + d.params.total.a1 * (H[1] + A[2] + A[1] + H[2] - 2 * P);
  return { A, H, marginHome, total };
}

/**
 * Plays one game. With a closing line the expected margin and total are the line's (the ratings add nothing to it in the backtest);
 * without one they come from the ratings. A is the away team, B the home team (neutral games keep the schedule's order).
 */
export function projectNfl(d: NflData, away: string, home: string, week: number, opts: { neutral?: boolean; spread?: number | null; total?: number | null; basis?: Basis | "auto"; n?: number; seed?: number; lineHome?: number | null; totalLine?: number | null } = {}): NflProjection | null {
  const neutral = !!opts.neutral;
  const rx = ratingsExpectation(d, away, home, week, neutral);
  if (!rx) return null;
  const hasMarket = opts.spread != null && opts.total != null;
  const basis: Basis = opts.basis === "ratings" ? "ratings" : opts.basis === "market" ? (hasMarket ? "market" : "ratings") : hasMarket ? "market" : "ratings";
  const marginHome = basis === "market" ? (opts.spread as number) : rx.marginHome;
  const total = basis === "market" ? (opts.total as number) : rx.total;
  const params = simParams(d, basis);
  const e: Expectation = { margin: -marginHome, total, ptsA: (total - marginHome) / 2, ptsB: (total + marginHome) / 2, winProbA: 0, parts: { spDiff: rx.A[0] - rx.H[0], homeField: 0, rawTotal: rx.total, calibratedTotal: total } };
  const seed = opts.seed ?? hashSeed(`${away}|${home}|${week}|${basis}|${neutral}`);
  const sim = simulateExpectation(params, e, neutral ? "neutral" : "b-home", seed, { n: opts.n ?? 6000, lineA: opts.lineHome == null ? null : -opts.lineHome, totalLine: opts.totalLine ?? null });
  return { away, home, neutral, week, basis, marginHome, total, ratingsMarginHome: rx.marginHome, ratingsTotal: rx.total, market: { spread: opts.spread ?? null, total: opts.total ?? null }, params, expectation: e, sim, awayR: rx.A, homeR: rx.H };
}

export const projectGameRow = (d: NflData, g: NflGame, o: { basis?: Basis | "auto"; n?: number } = {}) => projectNfl(d, g.away, g.home, g.week, { neutral: !!g.neutral, spread: g.spread, total: g.total, basis: o.basis, n: o.n });

// ---- against the spread ------------------------------------------------------------------------------------------------------------------

export interface NflAtsGame {
  id: string; week: number; date: string; game: string; away: string; home: string;
  pick: string; pickIsHome: boolean;
  /** The line from the pick's side, e.g. "DEN +2.5". */
  line: string;
  /** Points the ratings like the pick more than the line does. */
  edge: number;
  margin: number; coverBy: number; result: AtsResult; final: string;
}

/** A ratings pick for a game: the side the ratings like better than the closing spread does (null when they agree exactly). */
export function pickFor(g: NflGame) {
  if (g.spread == null || g.mm == null) return null;
  const e = g.mm - g.spread;
  if (e === 0) return null;
  const pickIsHome = e > 0;
  const pick = pickIsHome ? g.home : g.away;
  const lineForPick = pickIsHome ? -g.spread : g.spread; // spread number as written for that team (negative = favorite)
  const fmtLine = lineForPick === 0 ? "PK" : `${lineForPick > 0 ? "+" : "−"}${Math.abs(lineForPick)}`;
  return { pick, pickIsHome, edge: Math.abs(e), line: `${pick} ${fmtLine}` };
}

export function atsGames(d: NflData): NflAtsGame[] {
  const out: NflAtsGame[] = [];
  for (const g of d.games) {
    if (g.type !== "REG" || g.aS == null || g.hS == null) continue;
    const p = pickFor(g);
    if (!p) continue;
    const homeCover = g.hS - g.aS - (g.spread as number); // positive: home covered
    const coverBy = p.pickIsHome ? homeCover : -homeCover;
    out.push({
      id: g.id, week: g.week, date: g.date, game: `${g.away} @ ${g.home}`, away: g.away, home: g.home, pick: p.pick, pickIsHome: p.pickIsHome, line: p.line, edge: Math.round(p.edge * 10) / 10,
      margin: p.pickIsHome ? g.hS - g.aS : g.aS - g.hS, coverBy: Math.round(coverBy * 10) / 10, result: coverBy > 0 ? "win" : coverBy < 0 ? "loss" : "push", final: `${g.away} ${g.aS}, ${g.home} ${g.hS}`,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.game.localeCompare(b.game));
}

export function pendingPicks(d: NflData) {
  return d.games.filter((g) => g.type === "REG" && g.aS == null && g.spread != null).map((g) => ({ g, p: pickFor(g) })).filter((x): x is { g: NflGame; p: NonNullable<ReturnType<typeof pickFor>> } => !!x.p)
    .sort((a, b) => a.g.date.localeCompare(b.g.date) || (a.g.time ?? "").localeCompare(b.g.time ?? ""));
}

/** The current season's out-of-sample numbers for the played games (the constants were fitted on earlier seasons only). */
export function seasonCheck(d: NflData) {
  const pl = d.games.filter((g) => g.type === "REG" && g.aS != null && g.hS != null && g.mm != null);
  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const withLine = pl.filter((g) => g.spread != null && g.total != null);
  const hs = (g: NflGame) => (g.hS as number) - (g.aS as number), tot = (g: NflGame) => (g.hS as number) + (g.aS as number);
  return {
    games: pl.length, withLine: withLine.length,
    marginModel: mean(pl.map((g) => Math.abs(hs(g) - (g.mm as number)))),
    marginMarket: mean(withLine.map((g) => Math.abs(hs(g) - (g.spread as number)))),
    marginModelOnLined: mean(withLine.map((g) => Math.abs(hs(g) - (g.mm as number)))),
    totalModel: mean(withLine.map((g) => Math.abs(tot(g) - (g.mt as number)))),
    totalMarket: mean(withLine.map((g) => Math.abs(tot(g) - (g.total as number)))),
  };
}

