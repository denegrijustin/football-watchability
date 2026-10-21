// Pure helpers for the Finishing Drives tab. The counts come from engine.finishing; this file picks the rows to compare, finds the drives
// behind a bar segment, and writes the sentence from fixed rules.
import { DENOMINATORS, finishing, gamesFor, leagueSummaries, type Denominator } from "./engine";
import { oppRowOf, RESULT_TEXT } from "./drivesCalc";
import { DRIVE } from "../../scripts/perf/lib.mjs";
import type { DriveTuple, PerfData, PerfRow, PerfSelection } from "./types";

export type Bucket = "td" | "fg" | "turnover" | "empty";
export type Fin = ReturnType<typeof finishing>;
export const BUCKETS: { k: Bucket; label: string; short: string; plain: string }[] = [
  { k: "td", label: "Touchdowns", short: "TD", plain: "Drives that ended in an offensive touchdown." },
  { k: "fg", label: "Field goals", short: "FG", plain: "Drives that ended in a made field goal." },
  { k: "turnover", label: "Turnovers", short: "Turnover", plain: "Drives that ended in an interception or a lost fumble." },
  { k: "empty", label: "Other empty possessions", short: "Empty", plain: "Punts, turnovers on downs, missed field goals, safeties and defensive scores against: drives with no points for the offense and no interception or lost fumble." },
];

/** Fewer than this many drives in a denominator is a small sample. */
export const SMALL_N: Record<Denominator, number> = { all: 25, opportunity: 15, redzone: 10 };
export const NOUN: Record<Denominator, string> = { all: "drives", opportunity: "scoring chances", redzone: "red-zone trips" };
export const NOUN_ONE: Record<Denominator, string> = { all: "drive", opportunity: "scoring chance", redzone: "red-zone trip" };
export const denInfo = (d: Denominator) => DENOMINATORS.find((x) => x.id === d)!;

export type RowKey = "team" | "against" | "opp" | "oppAgainst" | "league";
export interface FinRow { key: RowKey; group: "off" | "def"; label: string; fin: Fin; games: number; /** The selected team's own rows can be opened in the Drives tab. */ drillable: boolean; rows: PerfRow[]; small: boolean }

export function finishingRows(data: PerfData, sel: PerfSelection, den: Denominator, names: { team: string; opp: string | null }): FinRow[] {
  const team = sel.team;
  if (!team) return [];
  const mk = (key: RowKey, group: FinRow["group"], label: string, rows: PerfRow[], drillable: boolean): FinRow => {
    const fin = finishing(rows, sel.garbage, den);
    return { key, group, label, fin, games: rows.length, drillable, rows, small: fin.n < SMALL_N[den] };
  };
  const against = (rows: PerfRow[]) => rows.map((r) => oppRowOf(data, r)).filter((r): r is PerfRow => !!r);
  const mine = gamesFor(data, team, sel);
  const out: FinRow[] = [mk("team", "off", names.team, mine, true), mk("against", "def", `Opponents against ${names.team}`, against(mine), true)];
  if (sel.bench === "opp" && sel.opp && names.opp) {
    const theirs = gamesFor(data, sel.opp, sel);
    out.push(mk("opp", "off", names.opp, theirs, false), mk("oppAgainst", "def", `Opponents against ${names.opp}`, against(theirs), false));
  } else if (sel.bench === "league") {
    const all = [...leagueSummaries(data, sel).values()].flatMap((s) => s.games);
    out.push(mk("league", "off", "League average", all, false), mk("league", "def", "League average", all, false));
  }
  return out;
}

export interface Behind { row: PerfRow; idx: number; tuple: DriveTuple }
/** The drives in one bucket of one comparison row, in game order. */
export function drivesBehind(f: FinRow, bucket: Bucket): Behind[] {
  const set = new Set(f.fin.buckets[bucket]);
  const out: Behind[] = [];
  for (const row of f.rows) row.d.forEach((tuple, idx) => { if (set.has(tuple)) out.push({ row, idx, tuple }); });
  return out;
}

/** What the "empty" drives were, by exact ending: [label, count], most common first. */
export function emptyBreakdown(drives: DriveTuple[]): [string, number][] {
  const m = new Map<string, number>();
  for (const d of drives) m.set(RESULT_TEXT[d[DRIVE.RESULT]] ?? "Other", (m.get(RESULT_TEXT[d[DRIVE.RESULT]] ?? "Other") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** The shared metric slot: "fin:<row>:<bucket>". */
export const finSlot = (row: RowKey, group: FinRow["group"], b: Bucket) => `fin:${row}:${group}:${b}`;
export function parseFinSlot(metric: string | null): { row: RowKey; group: FinRow["group"]; bucket: Bucket } | null {
  const m = /^fin:(team|against|opp|oppAgainst|league):(off|def):(td|fg|turnover|empty)$/.exec(metric ?? "");
  return m ? { row: m[1] as RowKey, group: m[2] as FinRow["group"], bucket: m[3] as Bucket } : null;
}

const pct0 = (v: number) => `${Math.round(v * 100)}%`;
/** A gap of 5 percentage points in touchdown rate is "better" or "lower"; less is "close to". */
export const TD_GAP = 0.05;

export interface FinTakeInput { name: string; den: Denominator; off: Fin; against: Fin; bench: Fin | null; benchName: string | null }
/** The sentence above the bars: the team's touchdown rate and points per chance in the chosen denominator, against the benchmark, then what opponents did. No causes. */
export function finishingTakeaway(i: FinTakeInput): { text: string; small?: string } {
  const noun = NOUN[i.den];
  if (i.off.n === 0 || i.off.tdRate == null || i.off.pointsPerOpportunity == null) return { text: `${i.name} had no ${noun} in these games, so there is nothing to compare yet.` };
  let t = `${i.name} turned ${i.off.n} ${noun} into touchdowns ${pct0(i.off.tdRate)} of the time and averaged ${i.off.pointsPerOpportunity.toFixed(2)} points each`;
  if (i.bench && i.bench.n > 0 && i.bench.tdRate != null && i.benchName) {
    const d = i.off.tdRate - i.bench.tdRate;
    t += d >= TD_GAP ? `, a better touchdown rate than ${i.benchName} (${pct0(i.bench.tdRate)}).` : d <= -TD_GAP ? `, a lower touchdown rate than ${i.benchName} (${pct0(i.bench.tdRate)}).` : `, close to ${i.benchName} (${pct0(i.bench.tdRate)} touchdowns).`;
  } else t += ".";
  if (i.against.n > 0 && i.against.tdRate != null) t += ` Opponents scored touchdowns on ${pct0(i.against.tdRate)} of their ${i.against.n} ${noun} against ${i.name}.`;
  const small = i.off.n < SMALL_N[i.den] ? `Only ${i.off.n} ${noun} so far, so a few drives can move these rates a lot.` : undefined;
  return { text: t, small };
}
