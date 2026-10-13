/**
 * Matchup simulator core. Pure TypeScript: no React, no DOM, no I/O, so FB Watch can import it as is.
 *
 * Inputs per team: the sheet's SP+ components. Off = points scored against an average defense, Def = points allowed against an
 * average offense (lower is better), ST = special-teams points, and SP+ = Off - Def + ST (the sheet's own identity).
 *
 *   expected margin (A minus B) = SP+_A - SP+_B + home-field points        (the sheet's own projection formula)
 *   expected total             = alpha + beta * (Off_A + Def_B + Off_B + Def_A - 2 * leagueAvg)   (alpha, beta fitted to played games)
 *   points A = (total + margin) / 2,  points B = (total - margin) / 2
 *
 * A game is then drawn as a margin and a total from a bivariate normal whose spreads and correlation were measured on this
 * season's played games (see calibrate.ts), turned into whole-number scores, and overtime breaks any tie.
 */
import { makeRng, hashSeed, normCdf } from "./rng";

export interface TeamRatings { name: string; sp: number; off: number; def: number; st: number }
export type Venue = "a-home" | "b-home" | "neutral";

export interface SimParams {
  /** Home-field points added to the home team's margin. */
  hfa: number;
  sigmaMargin: number;
  sigmaTotal: number;
  /** Correlation between the margin error and the total error. */
  rho: number;
  totalAlpha: number;
  totalBeta: number;
  /** Mean points per team in the rating week: the baseline both offenses and defenses are measured against. */
  leagueAvgPts: number;
  /** Where these numbers came from. */
  fit: { games: number; week: number | null; source: "fit" | "default" };
}

export const DEFAULT_PARAMS: SimParams = { hfa: 2.5, sigmaMargin: 15.5, sigmaTotal: 16.4, rho: 0.07, totalAlpha: 0, totalBeta: 1, leagueAvgPts: 26.2, fit: { games: 0, week: null, source: "default" } };

export interface Expectation {
  /** Expected margin, team A minus team B. */
  margin: number;
  total: number;
  ptsA: number;
  ptsB: number;
  /** Win probability from the normal margin (overtime ignored). */
  winProbA: number;
  /** How the numbers add up, for display. */
  parts: { spDiff: number; homeField: number; rawTotal: number; calibratedTotal: number };
}

export const homeFieldFor = (venue: Venue, hfa: number) => (venue === "a-home" ? hfa : venue === "b-home" ? -hfa : 0);

export function expectation(p: SimParams, a: TeamRatings, b: TeamRatings, venue: Venue): Expectation {
  const spDiff = a.sp - b.sp;
  const homeField = homeFieldFor(venue, p.hfa);
  const margin = spDiff + homeField;
  const rawTotal = a.off + b.def + b.off + a.def - 2 * p.leagueAvgPts;
  const total = p.totalAlpha + p.totalBeta * rawTotal;
  return { margin, total, ptsA: (total + margin) / 2, ptsB: (total - margin) / 2, winProbA: normCdf(margin / p.sigmaMargin), parts: { spDiff, homeField, rawTotal, calibratedTotal: total } };
}

export interface SimOptions {
  n?: number;
  seed?: number;
  /** Spread line from A's side: positive = A favored by that many points. */
  lineA?: number | null;
  /** Over/under line. */
  totalLine?: number | null;
  /** Keep every sampled game (large). */
  keepSamples?: boolean;
}

export interface Quantiles { p5: number; p25: number; p50: number; p75: number; p95: number; mean: number }

export interface SimResult {
  n: number;
  seed: number;
  venue: Venue;
  expected: Expectation;
  /** Simulated means (a touch above the analytic ones because scores cannot go below zero). */
  meanA: number; meanB: number; meanMargin: number; meanTotal: number;
  winA: number; winB: number;
  overtime: number;
  quantiles: { a: Quantiles; b: Quantiles; margin: Quantiles; total: Quantiles };
  /** counts[m + OFFSET] = games ended with margin m (A minus B). */
  marginCounts: Map<number, number>;
  /** Joint score counts keyed "a-b". */
  scoreCounts: Map<string, number>;
  /** Most common exact finals. */
  topScores: { a: number; b: number; p: number }[];
  cover: { lineA: number; coverA: number; coverB: number; push: number } | null;
  over: { line: number; over: number; under: number; push: number } | null;
  samples?: { a: Int16Array; b: Int16Array };
}

const quant = (sorted: Float64Array | number[], mean: number): Quantiles => {
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95), mean };
};

/** One drawn final score. Exposed so callers can reuse the exact game-level rules. */
export function drawGame(p: SimParams, e: Expectation, rng: { normal: () => number; uniform: () => number }): { a: number; b: number; ot: boolean } {
  const z1 = rng.normal(), z2 = rng.normal();
  const m = e.margin + p.sigmaMargin * z1;
  const t = e.total + p.sigmaTotal * (p.rho * z1 + Math.sqrt(1 - p.rho * p.rho) * z2);
  let a = Math.max(0, Math.round((t + m) / 2));
  let b = Math.max(0, Math.round((t - m) / 2));
  // One point is not a football score.
  if (a === 1) a = rng.uniform() < 0.5 ? 0 : 2;
  if (b === 1) b = rng.uniform() < 0.5 ? 0 : 2;
  let ot = false;
  if (a === b) {
    ot = true;
    const pA = 0.5 + 0.5 * Math.tanh(e.margin / (2 * p.sigmaMargin) * 1.6);
    const gain = rng.uniform() < 0.6 ? 7 : 3;
    if (rng.uniform() < pA) a += gain; else b += gain;
  }
  return { a, b, ot };
}

export function simulate(p: SimParams, a: TeamRatings, b: TeamRatings, venue: Venue, opts: SimOptions = {}): SimResult {
  return simulateExpectation(p, expectation(p, a, b, venue), venue, opts.seed ?? hashSeed(`${a.name}|${b.name}|${venue}`), opts);
}

/**
 * Plays a game from any expected margin and total (A minus B): the SP+ formula above, or something else entirely, such as a betting
 * line. Only `sigmaMargin`, `sigmaTotal` and `rho` of the params are used.
 */
export function simulateExpectation(p: SimParams, e: Expectation, venue: Venue, seed: number, opts: SimOptions = {}): SimResult {
  const n = Math.max(1, Math.floor(opts.n ?? 10000));
  const rng = makeRng(seed);
  const A = new Int16Array(n), B = new Int16Array(n);
  const marginCounts = new Map<number, number>();
  const scoreCounts = new Map<string, number>();
  let winA = 0, ot = 0, sA = 0, sB = 0;
  let c = { cover: 0, coverB: 0, push: 0, over: 0, under: 0, tpush: 0 };
  const lineA = opts.lineA ?? null, totalLine = opts.totalLine ?? null;
  for (let i = 0; i < n; i++) {
    const g = drawGame(p, e, rng);
    A[i] = g.a; B[i] = g.b;
    const m = g.a - g.b;
    if (m > 0) winA++;
    if (g.ot) ot++;
    sA += g.a; sB += g.b;
    marginCounts.set(m, (marginCounts.get(m) ?? 0) + 1);
    const k = `${g.a}-${g.b}`;
    scoreCounts.set(k, (scoreCounts.get(k) ?? 0) + 1);
    if (lineA != null) { if (m > lineA) c.cover++; else if (m < lineA) c.coverB++; else c.push++; }
    if (totalLine != null) { const t = g.a + g.b; if (t > totalLine) c.over++; else if (t < totalLine) c.under++; else c.tpush++; }
  }
  const sortedOf = (f: (i: number) => number) => { const arr = new Float64Array(n); for (let i = 0; i < n; i++) arr[i] = f(i); arr.sort(); return arr; };
  const mA = sA / n, mB = sB / n;
  const top = [...scoreCounts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => { const [x, y] = k.split("-").map(Number); return { a: x, b: y, p: v / n }; });
  return {
    n, seed, venue, expected: e, meanA: mA, meanB: mB, meanMargin: mA - mB, meanTotal: mA + mB,
    winA: winA / n, winB: 1 - winA / n, overtime: ot / n,
    quantiles: { a: quant(sortedOf((i) => A[i]), mA), b: quant(sortedOf((i) => B[i]), mB), margin: quant(sortedOf((i) => A[i] - B[i]), mA - mB), total: quant(sortedOf((i) => A[i] + B[i]), mA + mB) },
    marginCounts, scoreCounts, topScores: top,
    cover: lineA != null ? { lineA, coverA: c.cover / n, coverB: c.coverB / n, push: c.push / n } : null,
    over: totalLine != null ? { line: totalLine, over: c.over / n, under: c.under / n, push: c.tpush / n } : null,
    samples: opts.keepSamples ? { a: A, b: B } : undefined,
  };
}
