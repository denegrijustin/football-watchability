/** Calibration and the Monte Carlo forecast. Pure functions over the engine. */
import { playGame, type GameCfg, type GameResult } from "./engine";
import { hashSeed } from "../spplus/sim/rng";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Adjust both teams' efficiency until the simulated averages match `target` (points per game). Common seeds make this converge. */
export function calibrate(cfg: GameCfg, target: [number, number], opts: { games?: number; iters?: number; seed?: number } = {}): { cfg: GameCfg; mean: [number, number] } {
  const games = opts.games ?? 400, iters = opts.iters ?? 6, seed = opts.seed ?? 7;
  let ea = cfg.away.eff, eh = cfg.home.eff;
  let mean: [number, number] = [0, 0];
  let cur = cfg;
  for (let it = 0; it < iters; it++) {
    cur = { ...cfg, away: { ...cfg.away, eff: ea }, home: { ...cfg.home, eff: eh } };
    let sa = 0, sh = 0;
    for (let i = 0; i < games; i++) {
      const r = playGame(cur, seed + i * 7919);
      sa += r.score[0]; sh += r.score[1];
    }
    mean = [sa / games, sh / games];
    if (it === iters - 1) break;
    ea = clamp(ea * clamp(Math.pow(target[0] / Math.max(mean[0], 1), 0.8), 0.75, 1.3), 0.5, 1.9);
    eh = clamp(eh * clamp(Math.pow(target[1] / Math.max(mean[1], 1), 0.8), 0.75, 1.3), 0.5, 1.9);
  }
  return { cfg: cur, mean };
}

export interface Forecast {
  n: number;
  winAway: number;
  winHome: number;
  tie: number;
  overtime: number;
  meanAway: number;
  meanHome: number;
  /** Margin (home minus away) at the 10th, 25th, 50th, 75th and 90th percentile. */
  marginPct: [number, number, number, number, number];
  totalPct: [number, number, number];
  /** Histogram of the margin in 3-point bins from -30 to +30 (first and last bins hold the tails). */
  hist: { lo: number; hi: number; count: number }[];
  /** Share of games where the home team covers `spreadHome` (negative = favorite) and where the total goes over. */
  cover: number | null;
  over: number | null;
  /** The seed of the game closest to the average score, with the favorite winning: the "most likely game". */
  typicalSeed: number;
  typical: [number, number];
  /** Every game's score, away then home (for downstream charts). */
  scores: [number, number][];
  baseSeed: number;
}

export function forecast(cfg: GameCfg, n: number, baseSeed: number, line?: { spreadHome: number | null; total: number | null }): Forecast {
  const scores: [number, number][] = [];
  let wa = 0, wh = 0, ties = 0, ot = 0, sa = 0, sh = 0, cover = 0, covered = 0, over = 0, overed = 0;
  const margins: number[] = [], totals: number[] = [];
  const seeds: number[] = [];
  for (let i = 0; i < n; i++) {
    const seed = (baseSeed + Math.imul(i + 1, 2654435761)) >>> 0;
    const r: GameResult = playGame(cfg, seed);
    const [a, h] = r.score;
    scores.push([a, h]); seeds.push(seed);
    sa += a; sh += h;
    if (a > h) wa++; else if (h > a) wh++; else ties++;
    if (r.overtime) ot++;
    margins.push(h - a); totals.push(a + h);
    if (line?.spreadHome != null) { const c = h - a + line.spreadHome; if (c !== 0) { covered++; if (c > 0) cover++; } }
    if (line?.total != null) { const t = a + h - line.total; if (t !== 0) { overed++; if (t > 0) over++; } }
  }
  const pct = (arr: number[], p: number) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const hist: Forecast["hist"] = [];
  for (let lo = -30; lo < 30; lo += 3) hist.push({ lo, hi: lo + 3, count: 0 });
  for (const m of margins) hist[clamp(Math.floor((m + 30) / 3), 0, hist.length - 1)].count++;
  const ma = sa / n, mh = sh / n;
  const favHome = mh >= ma;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const [a, h] = scores[i];
    if (a === h || (h > a) !== favHome) continue;
    const d = (a - ma) ** 2 + (h - mh) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return {
    n, winAway: wa / n, winHome: wh / n, tie: ties / n, overtime: ot / n, meanAway: ma, meanHome: mh,
    marginPct: [pct(margins, 0.1), pct(margins, 0.25), pct(margins, 0.5), pct(margins, 0.75), pct(margins, 0.9)],
    totalPct: [pct(totals, 0.25), pct(totals, 0.5), pct(totals, 0.75)],
    hist,
    cover: covered ? cover / covered : null, over: overed ? over / overed : null,
    typicalSeed: seeds[best] ?? baseSeed, typical: scores[best] ?? [Math.round(ma), Math.round(mh)], scores, baseSeed,
  };
}

export const seedFor = (text: string) => hashSeed(text);
