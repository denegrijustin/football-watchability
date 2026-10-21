// Pure calculations behind the Situations tab: the down-and-distance cells, the situation splits, the benchmark differences, the per-game
// breakdown and the takeaway sentence. Everything numeric comes from engine.ts so this tab agrees with every other tab.
import { DIST_BUCKETS, V, ddIndex } from "../../scripts/perf/lib.mjs";
import { downDistanceGrid, gameSeries, gamesFor, leagueAverage, pair, smallSample, summarize, SITUATIONS, type GamePoint } from "./engine";
import type { PerfData, PerfSelection, PerfSide } from "./types";

export type SitId = (typeof SITUATIONS)[number]["id"];
export type CellSpec = { kind: "dd"; down: 1 | 2 | 3 | 4; bucket: number } | { kind: "sit"; id: SitId };

/** A gap smaller than this (in rate units, 0.03 = 3 points) is shown as "about even". */
export const EVEN_BELOW = 0.03;
/** A takeaway needs a situation with at least this many plays and a gap of at least this size. */
export const TAKE_MIN_N = 30;
export const TAKE_MIN_GAP = 0.08;

const ORD = ["", "1st", "2nd", "3rd", "4th"];
export const downName = (d: number) => `${ORD[d]} down`;

export const specKey = (s: CellSpec) => (s.kind === "dd" ? `dd:${s.down}:${s.bucket}` : `sit:${s.id}`);
/** Reads the shared sel.metric slot: anything that is not one of our keys (another tab's metric, a stale value) gives null. */
export function parseSpec(metric: string | null | undefined): CellSpec | null {
  if (!metric) return null;
  const dd = /^dd:([1-4]):([0-3])$/.exec(metric);
  if (dd) return { kind: "dd", down: Number(dd[1]) as 1 | 2 | 3 | 4, bucket: Number(dd[2]) };
  const sit = /^sit:(\w+)$/.exec(metric);
  if (sit && SITUATIONS.some((s) => s.id === sit[1])) return { kind: "sit", id: sit[1] as SitId };
  return null;
}
export const specIndex = (s: CellSpec): number => (s.kind === "dd" ? ddIndex(s.down, s.bucket) : SITUATIONS.find((x) => x.id === s.id)!.i);
export const specLabel = (s: CellSpec): string => (s.kind === "dd" ? `${downName(s.down)}, ${DIST_BUCKETS[s.bucket].label} yards to go` : SITUATIONS.find((x) => x.id === s.id)!.label);

/** Wording for each situation inside a sentence ("... at its best on third and fourth down"). */
export const SIT_PHRASE: Record<SitId, string> = { early: "on first and second down", late: "on third and fourth down", rz: "in the red zone", lead: "when leading", tied: "when tied", trail: "when trailing" };

export type Verdict = "better" | "worse" | "even" | "unsure" | "none";
export interface Cell {
  spec: CellSpec; key: string; label: string;
  n: number; succ: number; rate: number | null; small: boolean;
  benchN: number | null; benchRate: number | null;
  /** Team rate minus benchmark rate, in rate units (0.08 = 8 points); null when either side has no plays or there is no benchmark. */
  diff: number | null;
  verdict: Verdict;
}

/** Whether a gap is good or bad for the team: on offense a higher success rate is better, on defense (the opponent's rate) a lower one is. */
export function verdictOf(diff: number | null, side: PerfSide, n: number, benchN: number | null): Verdict {
  if (diff == null) return "none";
  if (smallSample(n) || benchN == null || smallSample(benchN)) return "unsure";
  if (Math.abs(diff) < EVEN_BELOW) return "even";
  return (side === "off" ? diff > 0 : diff < 0) ? "better" : "worse";
}
/** Oriented so that positive always means good for the team. */
export const oriented = (diff: number, side: PerfSide) => (side === "off" ? diff : -diff);

export const pts = (v: number, d = 0) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d)}`;

export function makeCell(spec: CellSpec, vec: number[], bench: number[] | null, side: PerfSide): Cell {
  const i = specIndex(spec);
  const p = pair(vec, i);
  const b = bench ? pair(bench, i) : null;
  const diff = p.rate != null && b?.rate != null ? p.rate - b.rate : null;
  return { spec, key: specKey(spec), label: specLabel(spec), n: p.n, succ: p.succ, rate: p.rate, small: smallSample(p.n), benchN: b ? b.n : null, benchRate: b?.rate ?? null, diff, verdict: verdictOf(diff, side, p.n, b ? b.n : null) };
}

export interface SituationModel {
  side: PerfSide;
  grid: Cell[][];
  sits: Cell[];
  overall: { n: number; succ: number; rate: number | null };
  benchOverall: { n: number; rate: number | null } | null;
  benchLabel: string | null;
  games: number;
  hasBench: boolean;
}

const overallOf = (vec: number[]) => { const n = vec[V.PN] + vec[V.RN], succ = vec[V.PSUC] + vec[V.RSUC]; return { n, succ, rate: n ? succ / n : null }; };

/** The benchmark vector on the same side: the league as one team, or the comparison team's own offense/defense. */
export function benchVec(data: PerfData, sel: PerfSelection, side: PerfSide, short: (id: string) => string): { vec: number[]; label: string } | null {
  if (sel.bench === "none") return null;
  if (sel.bench === "opp" && sel.opp) {
    const o = summarize(data, sel.opp, sel);
    if (!o.games.length) return null;
    return { vec: side === "off" ? o.offVec : o.defVec, label: short(sel.opp) };
  }
  const lg = leagueAverage(data, sel);
  return lg.games.length ? { vec: lg.offVec, label: "league average" } : null;
}

export function situationModel(data: PerfData, sel: PerfSelection, team: string, short: (id: string) => string): SituationModel {
  const s = summarize(data, team, sel);
  const side = sel.side;
  const vec = side === "off" ? s.offVec : s.defVec;
  const bench = benchVec(data, sel, side, short);
  const grid = downDistanceGrid(vec).map((row) => row.map((c) => makeCell({ kind: "dd", down: c.down as 1 | 2 | 3 | 4, bucket: c.bucket }, vec, bench?.vec ?? null, side)));
  const sits = SITUATIONS.map((x) => makeCell({ kind: "sit", id: x.id }, vec, bench?.vec ?? null, side));
  const bo = bench ? overallOf(bench.vec) : null;
  return { side, grid, sits, overall: overallOf(vec), benchOverall: bo ? { n: bo.n, rate: bo.rate } : null, benchLabel: bench?.label ?? null, games: s.games.length, hasBench: !!bench };
}

// ---------------------------------------------------------------------------------------------------------------------
// Per-game breakdown of one cell or situation
// ---------------------------------------------------------------------------------------------------------------------
export interface GameLine { id: string; week: number; opp: string; home: number; result: "W" | "L" | "T"; pf: number; pa: number; n: number; succ: number; rate: number | null }
export interface Breakdown { lines: GameLine[]; total: { n: number; succ: number; rate: number | null }; /** Games that had no plays in this spot. */ empty: number }

export function breakdown(data: PerfData, sel: PerfSelection, team: string, spec: CellSpec): Breakdown {
  const inScope = new Set(gamesFor(data, team, sel).map((r) => r.g));
  const i = specIndex(spec);
  const lines = gameSeries(data, team, sel).filter((g: GamePoint) => inScope.has(g.row.g)).map((g) => {
    const p = pair(sel.side === "off" ? g.offVec : g.defVec, i);
    return { id: g.row.g, week: g.week, opp: g.opp, home: g.row.h, result: g.result, pf: g.scoreFor, pa: g.scoreAgainst, n: p.n, succ: p.succ, rate: p.rate } as GameLine;
  });
  const n = lines.reduce((a, l) => a + l.n, 0), succ = lines.reduce((a, l) => a + l.succ, 0);
  return { lines, total: { n, succ, rate: n ? succ / n : null }, empty: lines.filter((l) => l.n === 0).length };
}

// ---------------------------------------------------------------------------------------------------------------------
// Takeaway
// ---------------------------------------------------------------------------------------------------------------------
const pc = (v: number) => `${Math.round(v * 100)}%`;
const gap = (v: number) => `${Math.round(Math.abs(v) * 100)}`;

/**
 * One or two sentences from fixed rules over the six situation splits (early, late, red zone, leading, tied, trailing):
 *  - only situations with at least TAKE_MIN_N plays count, and only gaps of at least TAKE_MIN_GAP (8 points) are called a strength or weakness;
 *  - the baseline is the benchmark (league or comparison team) in the same situation, or, with no benchmark, the team's own overall rate;
 *  - the best and worst qualifying situations are named; if none qualifies the team is called close to its baseline;
 *  - a small caveat is returned whenever the sample is thin (three games or fewer, or under 150 plays).
 * Wording only ever describes what happened ("succeeded on 41%"), never why.
 */
export function situationTakeaway(m: SituationModel, name: string): { text: string | null; small?: string } {
  const off = m.side === "off";
  const unit = off ? `${name} offense` : `${name} defense`;
  if (!m.games || !m.overall.n) return { text: null };
  const baseName = m.hasBench ? (m.benchLabel === "league average" ? "the league average" : m.benchLabel!) : "its own overall rate";
  const baseRate = (c: Cell) => (m.hasBench ? c.benchRate : m.overall.rate);
  const cands = m.sits.filter((c) => c.n >= TAKE_MIN_N && c.rate != null && baseRate(c) != null).map((c) => ({ c, o: oriented(c.rate! - baseRate(c)!, m.side), d: c.rate! - baseRate(c)! }));
  const best = cands.filter((x) => x.o >= TAKE_MIN_GAP).sort((a, b) => b.o - a.o)[0];
  const worst = cands.filter((x) => x.o <= -TAKE_MIN_GAP).sort((a, b) => a.o - b.o)[0];
  const sit = (x: typeof best) => SIT_PHRASE[(x.c.spec as { id: SitId }).id];
  const sub = m.games <= 3 || m.overall.n < 150 ? `This rests on ${m.games} game${m.games === 1 ? "" : "s"} and ${m.overall.n} plays, so treat it as an early read.` : undefined;
  if (!cands.length) return { text: `There are not yet enough plays in any one situation (${TAKE_MIN_N} or more) to say where ${name} is strong or weak.`, small: sub };
  const bit = (x: typeof best, good: boolean) => {
    const r = x.c.rate!;
    if (off) return `${good ? "is at its best" : "has struggled"} ${sit(x)} (${pc(r)} of plays successful, ${gap(x.d)} points ${x.d >= 0 ? "above" : "below"} ${baseName})`;
    return `${good ? "holds opponents down most" : "has had the most trouble"} ${sit(x)} (opponents succeeded on ${pc(r)}, ${gap(x.d)} points ${x.d >= 0 ? "above" : "below"} ${baseName})`;
  };
  let text: string;
  if (best && worst) text = `${unit} ${bit(best, true)}, but ${bit(worst, false)}.`;
  else if (best) text = `${unit} ${bit(best, true)}; no other situation is ${gap(TAKE_MIN_GAP)} or more points from ${baseName}.`;
  else if (worst) text = `${unit} ${bit(worst, false)}; no other situation is ${gap(TAKE_MIN_GAP)} or more points from ${baseName}.`;
  else text = `${unit} is within ${gap(TAKE_MIN_GAP)} points of ${baseName} in every situation with enough plays.`;
  return { text, small: sub };
}
