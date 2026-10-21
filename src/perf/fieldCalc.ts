// Pure helpers for the Field Position & Turnovers tab. Counting rules are engine.fieldPosition's; this file arranges them for the charts and
// writes the sentences from fixed rules.
import { DRIVE, FIELD_BANDS, fieldBand } from "../../scripts/perf/lib.mjs";
import { drivesOf, fieldPosition, gamesFor, leagueAverage } from "./engine";
import { oppRowOf, poss } from "./drivesCalc";
import type { DriveTuple, PerfData, PerfRow, PerfSelection } from "./types";
import type { Bucket } from "./finishingCalc";

export type FP = ReturnType<typeof fieldPosition>;
export const BIN = 5;
export const NBINS = 20;

/** Drives by starting yard line in 5-yard bins. Bin 0 is the 1 to 5 yards from the opponent's goal line (the best fields); bin 19 is 96 to 99. */
export function histogram(rows: PerfRow[], garbage: PerfSelection["garbage"]): number[] {
  const bins = new Array<number>(NBINS).fill(0);
  for (const d of drivesOf(rows, garbage)) bins[Math.max(0, Math.min(NBINS - 1, Math.floor((d[DRIVE.START_YL] - 1) / BIN)))]++;
  return bins;
}
export const binBand = (bin: number) => fieldBand(bin * BIN + 3);
export const binLabel = (bin: number) => {
  const lo = bin * BIN + 1, hi = Math.min(99, bin * BIN + BIN);
  const f = (yl: number) => (yl > 50 ? `own ${100 - yl}` : yl < 50 ? `opp ${yl}` : "midfield");
  return lo === hi ? f(lo) : `${f(hi)} to ${f(lo)}`;
};

export interface BandDrive { row: PerfRow; idx: number; tuple: DriveTuple }
export function bandDrives(rows: PerfRow[], garbage: PerfSelection["garbage"], band: number): BandDrive[] {
  const set = new Set(drivesOf(rows, garbage).filter((d) => fieldBand(d[DRIVE.START_YL]) === band));
  const out: BandDrive[] = [];
  for (const row of rows) row.d.forEach((tuple, idx) => { if (set.has(tuple)) out.push({ row, idx, tuple }); });
  return out;
}

/** The ending buckets (as in the Finishing tab) for a set of drives. */
export function mix(ds: DriveTuple[]): Record<Bucket, number> {
  const m: Record<Bucket, number> = { td: 0, fg: 0, turnover: 0, empty: 0 };
  for (const d of ds) { const r = d[DRIVE.RESULT]; m[r === 0 ? "td" : r === 1 ? "fg" : r === 3 || r === 4 ? "turnover" : "empty"]++; }
  return m;
}

export interface TurnoverGame { row: PerfRow; week: number; opp: string; gives: number; takes: number; margin: number; running: number; fp: FP }
export function turnoversByGame(games: PerfRow[], garbage: PerfSelection["garbage"]): TurnoverGame[] {
  let run = 0;
  return games.map((row) => {
    const fp = fieldPosition([row], garbage);
    const margin = fp.takeaways - fp.giveaways;
    run += margin;
    return { row, week: row.w, opp: row.o, gives: fp.giveaways, takes: fp.takeaways, margin, running: run, fp };
  });
}

export interface FieldData {
  rows: PerfRow[];
  fp: FP;
  hist: number[];
  /** The benchmark's numbers (league average or the comparison team), or null. */
  bench: { name: string; fp: FP; hist: number[]; games: number } | null;
  /** League numbers always (the yardstick for "points per drive from this field"). */
  league: FP;
}
export function fieldData(data: PerfData, sel: PerfSelection, benchName: (id: string) => string): FieldData | null {
  if (!sel.team) return null;
  const rows = gamesFor(data, sel.team, sel);
  const lg = leagueAverage(data, sel);
  const league = fieldPosition(lg.games, sel.garbage);
  let bench: FieldData["bench"] = null;
  if (sel.bench === "league") bench = { name: "the league average", fp: league, hist: histogram(lg.games, sel.garbage), games: lg.games.length };
  else if (sel.bench === "opp" && sel.opp) { const o = gamesFor(data, sel.opp, sel); bench = { name: benchName(sel.opp), fp: fieldPosition(o, sel.garbage), hist: histogram(o, sel.garbage), games: o.length }; }
  return { rows, fp: fieldPosition(rows, sel.garbage), hist: histogram(rows, sel.garbage), bench, league };
}

/** What a drive starting at these spots scores league-wide, on average, whatever way the drive began. Null when a band has no league drives. */
export function expectedFromField(starts: DriveTuple[], league: FP): number | null {
  if (!starts.length) return null;
  let s = 0, n = 0;
  for (const d of starts) { const b = league.bands[fieldBand(d[DRIVE.START_YL])]?.pointsPerDrive; if (b != null) { s += b; n++; } }
  return n ? s / n : null;
}

export interface FumbleStats { ours: { fumbles: number; lost: number }; theirs: { fumbles: number; lost: number }; league: { fumbles: number; lost: number } }
/** Fumbles on pass and run plays (row.fu = [fumbles, lost]). `theirs` are the opponents' fumbles in the same games, so their "lost" is what this defense recovered. */
export function fumbleStats(data: PerfData, games: PerfRow[], leagueRows: PerfRow[]): FumbleStats {
  const sum = (rs: PerfRow[]) => rs.reduce((a, r) => ({ fumbles: a.fumbles + r.fu[0], lost: a.lost + r.fu[1] }), { fumbles: 0, lost: 0 });
  return { ours: sum(games), theirs: sum(games.map((g) => oppRowOf(data, g)).filter((r): r is PerfRow => !!r)), league: sum(leagueRows) };
}
/** Fumble data counts only when the source says it is trustworthy and the league has some. */
export const fumblesSupported = (data: PerfData, f: FumbleStats) => data.config.hasFumbles && f.league.fumbles > 0;

const pct0 = (v: number) => `${Math.round(v * 100)}%`;
export const FAVORABLE_GAP = 0.03;
export const SMALL_FIELD_DRIVES = 25;

export interface FieldTakeInput { name: string; benchName: string | null; fp: FP; bench: FP | null; games: number }
/** Two sentences from fixed rules: how often drives start at the opponent's 40 or closer against the benchmark (a gap under 3 points is "about as often"), then the turnover margin. */
export function fieldTakeaway(i: FieldTakeInput): { text: string; small?: string } {
  const f = i.fp;
  if (!f.drives || f.favorableShare == null) return { text: `There are no drives to summarize for ${i.name} yet.` };
  let t = `${poss(i.name)} drives started at the opponent's 40 or closer ${pct0(f.favorableShare)} of the time`;
  if (i.bench?.favorableShare != null && i.benchName) {
    const d = f.favorableShare - i.bench.favorableShare;
    t += d >= FAVORABLE_GAP ? `, more often than ${i.benchName} (${pct0(i.bench.favorableShare)}).` : d <= -FAVORABLE_GAP ? `, less often than ${i.benchName} (${pct0(i.bench.favorableShare)}).` : `, about as often as ${i.benchName} (${pct0(i.bench.favorableShare)}).`;
  } else t += ".";
  const m = f.takeaways - f.giveaways;
  t += ` The turnover margin is ${m > 0 ? "+" : m < 0 ? "−" : ""}${Math.abs(m)} (${f.takeaways} takeaway${f.takeaways === 1 ? "" : "s"}, ${f.giveaways} giveaway${f.giveaways === 1 ? "" : "s"}) over ${i.games} game${i.games === 1 ? "" : "s"}.`;
  return { text: t, small: f.drives < SMALL_FIELD_DRIVES || i.games < 4 ? `Only ${f.drives} drives in ${i.games} game${i.games === 1 ? "" : "s"} so far: turnovers are rare, so one game can swing these numbers.` : undefined };
}

export const AFTER_GAP = 0.3;
export const SMALL_AFTER = 8;
/** The line about points after takeaways: what they scored, what a start in the same spots is worth league-wide, and a reminder that the two are not the same thing as "caused by the turnover". */
export function afterTakeawayLine(name: string, f: FP, expected: number | null): { text: string; small?: string } {
  if (!f.takeaways) return { text: `${name} had no takeaways in these games, so there are no drives that began after one.` };
  const ppd = f.pointsAfterTakeaways / f.takeaways;
  let t = `After ${f.takeaways} takeaway${f.takeaways === 1 ? "" : "s"}, ${name} scored on ${f.scoredAfterTakeaway} of those drives (${f.pointsAfterTakeaways} points, ${ppd.toFixed(2)} per drive).`;
  if (expected != null) {
    const d = ppd - expected;
    t += ` Drives that start in those same spots average ${expected.toFixed(2)} league-wide, whatever way they began, so this is ${d >= AFTER_GAP ? "above" : d <= -AFTER_GAP ? "below" : "in line with"} what the field position alone suggests.`;
  }
  return { text: t, small: f.takeaways < SMALL_AFTER ? `Only ${f.takeaways} takeaways, so this says little yet.` : undefined };
}

export { FIELD_BANDS };
export const fieldSlot = (band: number) => `fld:band:${band}`;
export function parseFieldSlot(metric: string | null): number | null {
  const m = /^fld:band:(\d)$/.exec(metric ?? "");
  const b = m ? Number(m[1]) : null;
  return b != null && b < FIELD_BANDS.length ? b : null;
}
