// How much to trust a pick: what picks with this size of edge have actually done, rather than what the model's bell curve says.
//
// The model turns an edge (points between its margin and the line) into a cover chance with a bell curve. That assumes the ratings are as good as the
// line, and the back-test says they are not: NFL ratings picks have covered about 49% of the time, whatever the size of the edge. So the chance shown for
// a pick is its bucket's real hit rate, pulled toward a coin flip until there is a lot of history behind it, and the model's own number is shown beside it.
import { atsGames as nflGraded } from "./nfl/model";
import type { NflData } from "./nfl/types";
import { atsGames as cfbGraded } from "./spplus/data/ats";
import type { Model } from "./spplus/data/types";

/** The break-even hit rate at the standard −110 price. */
export const BREAK_EVEN = 110 / 210;
/** How many games of "it is a coin flip" the estimate starts with. A bucket needs far more than this before its own record moves the number much. */
export const PRIOR_GAMES = 200;

export interface Bucket { label: string; lo: number; hi: number; w: number; l: number; p: number }
export interface History { league: "NFL" | "CFB"; buckets: Bucket[]; source: string }
export type Proof = "proven" | "promising" | "unproven";
export const PROOF_LABEL: Record<Proof, string> = { proven: "Proven edge", promising: "Promising", unproven: "Unproven" };

const label = (lo: number, hi: number) => (hi === Infinity ? `${lo}+` : `${lo}–${hi}`);
const empty = (edges: [number, number][]): Bucket[] => edges.map(([lo, hi]) => ({ label: label(lo, hi), lo, hi, w: 0, l: 0, p: 0 }));
const add = (b: Bucket[], edge: number, result: "win" | "loss" | "push") => {
  const k = b.find((x) => edge >= x.lo && edge < x.hi) ?? b.at(-1)!;
  if (result === "win") k.w++; else if (result === "loss") k.l++; else k.p++;
};

/** 95% Wilson interval for a hit rate. */
export function wilson(w: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const z = 1.96, p = w / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, e = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - e, c + e];
}

/** NFL: the three back-tested seasons' picks against the closing line, by size of edge, plus this season's graded picks. */
export function nflHistory(data: NflData): History {
  const edges: [number, number][] = [[0, 1.5], [1.5, 3], [3, 5], [5, Infinity]];
  const b = empty(edges);
  data.backtest.calibration.ats.byGap.forEach((g, i) => { if (b[i]) { b[i].w += g.w; b[i].l += g.l; b[i].p += g.p; } });
  for (const g of nflGraded(data)) add(b, g.edge, g.result);
  return { league: "NFL", buckets: b, source: `${data.params.trainedOn.join(", ")} back-test plus ${data.season} so far` };
}

/** College: this season's graded FBS-vs-FBS picks, by size of edge. */
export function cfbHistory(model: Model): History {
  const b = empty([[0, 2], [2, 4], [4, 7], [7, Infinity]]);
  for (const g of cfbGraded(model)) if (g.group === "fbs" && g.edge != null) add(b, g.edge, g.result);
  return { league: "CFB", buckets: b, source: "this season's graded picks" };
}

export interface Record_ { bucket: string; w: number; l: number; p: number; n: number; pct: number | null; lo95: number; hi95: number; proof: Proof }
const proofOf = (pct: number | null, lo: number): Proof => (pct == null ? "unproven" : lo > BREAK_EVEN ? "proven" : pct >= BREAK_EVEN ? "promising" : "unproven");

export function recordOf(b: Bucket): Record_ {
  const n = b.w + b.l, pct = n ? b.w / n : null, [lo95, hi95] = wilson(b.w, n);
  return { bucket: b.label, w: b.w, l: b.l, p: b.p, n, pct, lo95, hi95, proof: proofOf(pct, lo95) };
}
export const historyFor = (h: History, edge: number): Record_ => recordOf(h.buckets.find((x) => edge >= x.lo && edge < x.hi) ?? h.buckets.at(-1)!);

const shrunk = (b: Bucket) => (b.w + 0.5 * PRIOR_GAMES) / (b.w + b.l + PRIOR_GAMES);
const mid = (b: Bucket) => (b.hi === Infinity ? b.lo + 2 : (b.lo + b.hi) / 2);

/**
 * What picks like this one have really done, pulled toward 50% until there is a lot of history: (wins + half the prior) / (games + prior).
 * Each bucket's rate is anchored at the middle of its range and the chance slides between neighbouring anchors, so two picks in the same bucket
 * with different edges do not get the same number (and a stronger edge never ranks below a weaker one by accident of where the bucket edges fall).
 */
export function calibratedCover(h: History, edge: number): number {
  const b = h.buckets, m = b.map(mid);
  if (edge <= m[0]) return shrunk(b[0]);
  for (let i = 1; i < b.length; i++) {
    if (edge <= m[i]) { const t = (edge - m[i - 1]) / (m[i] - m[i - 1]); return shrunk(b[i - 1]) + t * (shrunk(b[i]) - shrunk(b[i - 1])); }
  }
  return shrunk(b[b.length - 1]);
}

export function overall(h: History): Record_ {
  return recordOf(h.buckets.reduce((a, x) => ({ ...a, w: a.w + x.w, l: a.l + x.l, p: a.p + x.p }), { label: "All", lo: 0, hi: Infinity, w: 0, l: 0, p: 0 }));
}
