// The one place the performance tabs compute anything. Every figure on every tab comes from the same few functions here, applied to the
// same selection, so the profile, trends, situations and matchup views cannot disagree. Pure and synchronous: no fetching, no React.
import { DRIVE, RESULT, HOW, FIELD_BANDS, OPPORTUNITY, RED_ZONE, V, derive, emptyVec, sumVec, fieldBand, ddIndex, DIST_BUCKETS, type Derived } from "../../scripts/perf/lib.mjs";
import type { PerfData, PerfRow, PerfSelection, DriveTuple } from "./types";

export type { Derived };

// ---------------------------------------------------------------------------------------------------------------------
// Index and scope
// ---------------------------------------------------------------------------------------------------------------------
export interface Index {
  byTeam: Map<string, PerfRow[]>;
  byGameTeam: Map<string, PerfRow>;
  teams: string[];
}
const indexCache = new WeakMap<PerfData, Index>();
export function indexOf(data: PerfData): Index {
  let ix = indexCache.get(data);
  if (ix) return ix;
  const byTeam = new Map<string, PerfRow[]>();
  const byGameTeam = new Map<string, PerfRow>();
  for (const r of data.rows) {
    (byTeam.get(r.t) ?? byTeam.set(r.t, []).get(r.t)!).push(r);
    byGameTeam.set(`${r.g}|${r.t}`, r);
  }
  for (const list of byTeam.values()) list.sort((a, b) => a.w - b.w || a.g.localeCompare(b.g));
  ix = { byTeam, byGameTeam, teams: [...byTeam.keys()] };
  indexCache.set(data, ix);
  return ix;
}

/** Teams that are compared with each other: every NFL team, or the FBS teams (never FCS opponents) for college. */
export const inPopulation = (data: PerfData, team: string) => data.league === "nfl" || data.teams[team]?.fbs === true;

/** A team's games that count under the selection: FCS opponents left out (unless asked), then the most recent N when "recent" is chosen. */
export function gamesFor(data: PerfData, team: string, sel: Pick<PerfSelection, "window" | "recentN" | "includeFcs">): PerfRow[] {
  let rows = indexOf(data).byTeam.get(team) ?? [];
  if (data.league === "cfb" && !sel.includeFcs) rows = rows.filter((r) => data.teams[r.o]?.fbs === true);
  return sel.window === "recent" ? rows.slice(-sel.recentN) : rows;
}

/** The count vector of an offense over some games: garbage time included or not. */
export function offenseVec(rows: PerfRow[], garbage: PerfSelection["garbage"]): number[] {
  const v = emptyVec();
  for (const r of rows) { sumVec(v, r.c); if (garbage === "all") sumVec(v, r.x); }
  return v;
}

/** The count vector of a defense: what the opponents' offenses did in the same games. */
export function defenseVec(data: PerfData, rows: PerfRow[], garbage: PerfSelection["garbage"]): number[] {
  const ix = indexOf(data);
  const opp = rows.map((r) => ix.byGameTeam.get(`${r.g}|${r.o}`)).filter((r): r is PerfRow => !!r);
  return offenseVec(opp, garbage);
}

export interface TeamSummary {
  team: string;
  games: PerfRow[];
  offVec: number[];
  defVec: number[];
  off: Derived;
  def: Derived;
  /** Scrimmage plays by the offense and against the defense. */
  playsOff: number;
  playsDef: number;
  drives: ReturnType<typeof driveStats>;
  drivesAgainst: ReturnType<typeof driveStats>;
}

export function summarize(data: PerfData, team: string, sel: PerfSelection): TeamSummary {
  return summarizeGames(data, team, gamesFor(data, team, sel), sel.garbage);
}

/** The same summary over an explicit list of the team's games (one game for a per-game value, or any subset). */
export function summarizeGames(data: PerfData, team: string, games: PerfRow[], garbage: PerfSelection["garbage"]): TeamSummary {
  const offVec = offenseVec(games, garbage);
  const defVec = defenseVec(data, games, garbage);
  const ix = indexOf(data);
  const oppRows = games.map((r) => ix.byGameTeam.get(`${r.g}|${r.o}`)).filter((r): r is PerfRow => !!r);
  return {
    team, games, offVec, defVec, off: derive(offVec), def: derive(defVec),
    playsOff: offVec[V.PN] + offVec[V.RN], playsDef: defVec[V.PN] + defVec[V.RN],
    drives: driveStats(games, garbage), drivesAgainst: driveStats(oppRows, garbage),
  };
}

const leagueCache = new WeakMap<PerfData, Map<string, Map<string, TeamSummary>>>();
const keyOf = (s: PerfSelection) => `${s.window}|${s.recentN}|${s.garbage}|${s.includeFcs ? 1 : 0}`;
/** Every population team's summary under the selection (the benchmark for percentiles). Cached per dataset and selection. */
export function leagueSummaries(data: PerfData, sel: PerfSelection): Map<string, TeamSummary> {
  let perSel = leagueCache.get(data);
  if (!perSel) leagueCache.set(data, (perSel = new Map()));
  const k = keyOf(sel);
  let m = perSel.get(k);
  if (m) return m;
  m = new Map();
  for (const t of indexOf(data).teams) if (inPopulation(data, t)) { const s = summarize(data, t, sel); if (s.games.length) m.set(t, s); }
  perSel.set(k, m);
  return m;
}

/** The league as one team: every population team's games, summed. */
export function leagueAverage(data: PerfData, sel: PerfSelection): TeamSummary {
  const all = [...leagueSummaries(data, sel).values()];
  const offVec = emptyVec();
  for (const s of all) sumVec(offVec, s.offVec);
  const games = all.flatMap((s) => s.games);
  const drives = driveStats(games, sel.garbage);
  // The average team's defense faces the same offenses as the average offense produces.
  return { team: "league", games, offVec, defVec: offVec.slice(), off: derive(offVec), def: derive(offVec), playsOff: offVec[V.PN] + offVec[V.RN], playsDef: offVec[V.PN] + offVec[V.RN], drives, drivesAgainst: drives };
}

// ---------------------------------------------------------------------------------------------------------------------
// Drives
// ---------------------------------------------------------------------------------------------------------------------
export const isTD = (d: DriveTuple) => d[DRIVE.RESULT] === RESULT.TD;
export const isScoring = (d: DriveTuple) => d[DRIVE.RESULT] === RESULT.TD || d[DRIVE.RESULT] === RESULT.FG;
export const isTurnoverDrive = (d: DriveTuple) => d[DRIVE.RESULT] === RESULT.INT || d[DRIVE.RESULT] === RESULT.FUMBLE;
const counted = (d: DriveTuple, garbage: PerfSelection["garbage"]) => d[DRIVE.RESULT] !== RESULT.END && (garbage === "all" || d[DRIVE.GARBAGE] === 0);

export function drivesOf(rows: PerfRow[], garbage: PerfSelection["garbage"]): DriveTuple[] {
  return rows.flatMap((r) => r.d.filter((d) => counted(d, garbage)));
}

export function driveStats(rows: PerfRow[], garbage: PerfSelection["garbage"]) {
  const ds = drivesOf(rows, garbage);
  const n = ds.length;
  const sum = (f: (d: DriveTuple) => number) => ds.reduce((s, d) => s + f(d), 0);
  const rate = (k: number) => (n ? k / n : null);
  const td = ds.filter(isTD).length;
  const fg = ds.filter((d) => d[DRIVE.RESULT] === RESULT.FG).length;
  const threeOut = ds.filter((d) => d[DRIVE.PLAYS] <= 3 && d[DRIVE.RESULT] === RESULT.PUNT).length;
  const startYl = n ? sum((d) => d[DRIVE.START_YL]) / n : null;
  return {
    drives: n, td, fg,
    pointsPerDrive: n ? sum((d) => d[DRIVE.PTS]) / n : null,
    scoringRate: rate(td + fg), tdRate: rate(td), threeAndOutRate: rate(threeOut), threeAndOuts: threeOut,
    turnovers: ds.filter(isTurnoverDrive).length,
    /** Average start, as yards to the opponent's goal line (50 = midfield). */
    avgStartYl: startYl,
    playsPerDrive: n ? sum((d) => d[DRIVE.PLAYS]) / n : null,
    yardsPerDrive: n ? sum((d) => d[DRIVE.YARDS]) / n : null,
    secsPerDrive: n ? sum((d) => d[DRIVE.SECS]) / n : null,
  };
}

/** "Own 28" / "Opp 35" / "Midfield" for a start measured as yards to the opponent's goal line. */
export const fieldLabel = (yl: number | null) => (yl == null ? "—" : yl > 50 ? `Own ${Math.round(100 - yl)}` : yl < 50 ? `Opp ${Math.round(yl)}` : "Midfield");

export type Denominator = "all" | "redzone" | "opportunity";
export const DENOMINATORS: { id: Denominator; label: string; note: string }[] = [
  { id: "all", label: "All drives", note: "Every possession except kneel-downs at the end of a half or game." },
  { id: "opportunity", label: `Scoring chances`, note: `Drives that reached the opponent's ${OPPORTUNITY}-yard line or closer.` },
  { id: "redzone", label: "Red-zone trips", note: `Drives that reached the opponent's ${RED_ZONE}-yard line or closer.` },
];
const inDenominator = (d: DriveTuple, den: Denominator) => den === "all" || (den === "redzone" ? d[DRIVE.MIN_YL] <= RED_ZONE : d[DRIVE.MIN_YL] <= OPPORTUNITY);

/** How drives in a denominator ended: touchdowns, field goals, turnovers (interceptions and lost fumbles) and every other empty possession. */
export function finishing(rows: PerfRow[], garbage: PerfSelection["garbage"], den: Denominator) {
  const ds = drivesOf(rows, garbage).filter((d) => inDenominator(d, den));
  const buckets = { td: [] as DriveTuple[], fg: [] as DriveTuple[], turnover: [] as DriveTuple[], empty: [] as DriveTuple[] };
  for (const d of ds) {
    const r = d[DRIVE.RESULT];
    if (r === RESULT.TD) buckets.td.push(d);
    else if (r === RESULT.FG) buckets.fg.push(d);
    else if (r === RESULT.INT || r === RESULT.FUMBLE) buckets.turnover.push(d);
    else buckets.empty.push(d);
  }
  const n = ds.length;
  const points = ds.reduce((s, d) => s + d[DRIVE.PTS], 0);
  return { n, ...Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])) as Record<"td" | "fg" | "turnover" | "empty", number>, buckets, pointsPerOpportunity: n ? points / n : null, tdRate: n ? buckets.td.length / n : null, points };
}

/** Starting field position: drives and points per drive in each band, and the takeaway/giveaway split. */
export function fieldPosition(rows: PerfRow[], garbage: PerfSelection["garbage"]) {
  const ds = drivesOf(rows, garbage);
  const bands = FIELD_BANDS.map((b, i) => {
    const inBand = ds.filter((d) => fieldBand(d[DRIVE.START_YL]) === i);
    const pts = inBand.reduce((s, d) => s + d[DRIVE.PTS], 0);
    return { ...b, drives: inBand.length, share: ds.length ? inBand.length / ds.length : null, pointsPerDrive: inBand.length ? pts / inBand.length : null, tdRate: inBand.length ? inBand.filter(isTD).length / inBand.length : null };
  });
  const afterTakeaway = ds.filter((d) => d[DRIVE.HOW] === HOW.INT || d[DRIVE.HOW] === HOW.FUMBLE);
  return {
    drives: ds.length, bands,
    avgStartYl: ds.length ? ds.reduce((s, d) => s + d[DRIVE.START_YL], 0) / ds.length : null,
    favorableShare: ds.length ? ds.filter((d) => d[DRIVE.START_YL] <= 40).length / ds.length : null,
    giveaways: ds.filter(isTurnoverDrive).length,
    takeaways: afterTakeaway.length,
    pointsAfterTakeaways: afterTakeaway.reduce((s, d) => s + d[DRIVE.PTS], 0),
    scoredAfterTakeaway: afterTakeaway.filter((d) => d[DRIVE.PTS] > 0).length,
    afterTakeaway,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Metrics and percentiles
// ---------------------------------------------------------------------------------------------------------------------
export interface MetricDef {
  id: string;
  label: string;
  /** Plain-language version of the label for casual fans. */
  plain: string;
  side: "off" | "def";
  unit: "pct" | "yds" | "epa" | "pts";
  /** Whether a larger raw value is better for the team being rated (false for what a defense allows). */
  higherIsBetter: boolean;
  /** Which derive() field (or drive stat) it reads. */
  read: (s: TeamSummary, hasEpa: boolean) => number | null;
  /** Plays (or drives) behind the figure, for the sample-size note. */
  sample: (s: TeamSummary) => number;
  sampleUnit: "plays" | "dropbacks" | "rushes" | "drives";
  definition: (hasEpa: boolean) => string;
  /** The underlying number in words: "0.12 expected points per dropback". */
  describe: (v: number, hasEpa: boolean) => string;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const epaTxt = (v: number, per: string) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} expected points per ${per}`;
const passEff = (d: Derived, hasEpa: boolean) => (hasEpa ? d.passEpa : d.passSuccess);
const rushEff = (d: Derived, hasEpa: boolean) => (hasEpa ? d.rushEpa : d.rushSuccess);

export const PROFILE_METRICS: MetricDef[] = [
  { id: "passOff", label: "Passing offense", plain: "Moving the ball through the air", side: "off", unit: "epa", higherIsBetter: true, read: (s, e) => passEff(s.off, e), sample: (s) => s.offVec[V.PN], sampleUnit: "dropbacks",
    definition: (e) => `How well the offense's dropbacks (passes and sacks) work. ${e ? "Measured as EPA per dropback: how much each dropback changes the team's scoring outlook." : "Measured as the share of dropbacks that are successful plays (college data has no EPA)."}`,
    describe: (v, e) => (e ? epaTxt(v, "dropback") : `${pct(v)} of dropbacks were successful`) },
  { id: "rushOff", label: "Rushing offense", plain: "Moving the ball on the ground", side: "off", unit: "epa", higherIsBetter: true, read: (s, e) => rushEff(s.off, e), sample: (s) => s.offVec[V.RN], sampleUnit: "rushes",
    definition: (e) => `How well designed runs and scrambles work. ${e ? "Measured as EPA per rush." : "Measured as the share of rushes that are successful plays."}`,
    describe: (v, e) => (e ? epaTxt(v, "rush") : `${pct(v)} of rushes were successful`) },
  { id: "passDef", label: "Passing defense", plain: "Stopping the pass", side: "def", unit: "epa", higherIsBetter: false, read: (s, e) => passEff(s.def, e), sample: (s) => s.defVec[V.PN], sampleUnit: "dropbacks",
    definition: (e) => `What opponents' dropbacks did against this defense (lower is better for the defense). ${e ? "EPA per dropback allowed." : "Share of opposing dropbacks that were successful."}`,
    describe: (v, e) => (e ? `opponents averaged ${epaTxt(v, "dropback")}` : `${pct(v)} of opposing dropbacks were successful`) },
  { id: "rushDef", label: "Rushing defense", plain: "Stopping the run", side: "def", unit: "epa", higherIsBetter: false, read: (s, e) => rushEff(s.def, e), sample: (s) => s.defVec[V.RN], sampleUnit: "rushes",
    definition: (e) => `What opponents' runs did against this defense (lower is better for the defense). ${e ? "EPA per rush allowed." : "Share of opposing rushes that were successful."}`,
    describe: (v, e) => (e ? `opponents averaged ${epaTxt(v, "rush")}` : `${pct(v)} of opposing rushes were successful`) },
  { id: "success", label: "Success rate", plain: "Staying on schedule", side: "off", unit: "pct", higherIsBetter: true, read: (s) => s.off.successRate, sample: (s) => s.playsOff, sampleUnit: "plays",
    definition: () => "The share of offensive plays that gain enough yards to keep the offense on schedule (40% of the yards to go on 1st down, 60% on 2nd, all of them on 3rd and 4th).",
    describe: (v) => `${pct(v)} of plays were successful` },
  { id: "scoring", label: "Scoring efficiency", plain: "Turning possessions into points", side: "off", unit: "pts", higherIsBetter: true, read: (s) => s.drives.pointsPerDrive, sample: (s) => s.drives.drives, sampleUnit: "drives",
    definition: () => "Offensive points per drive (touchdowns with the points after, and field goals). Defensive and special-teams scores are not included.",
    describe: (v) => `${v.toFixed(2)} points per drive` },
];

export const metricById = (id: string) => PROFILE_METRICS.find((m) => m.id === id);

/** Share of the population this value beats (ties count half), 0 to 100. Always "higher is better": a defense allowing less ranks higher. */
export function percentile(value: number | null, population: (number | null)[], higherIsBetter: boolean): number | null {
  if (value == null) return null;
  const vals = population.filter((v): v is number => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  let worse = 0, same = 0;
  for (const v of vals) { if (v === value) same++; else if (higherIsBetter ? v < value : v > value) worse++; }
  return Math.round(((worse + same / 2) / vals.length) * 100);
}

export interface MetricResult {
  def: MetricDef;
  value: number | null;
  /** Percentile among the league's teams; higher is always better. */
  pct: number | null;
  /** 1 = best. */
  rank: number | null;
  of: number;
  sample: number;
  /** Small-sample warning: fewer than this many plays/drives. */
  small: boolean;
  leagueValue: number | null;
}
const SMALL: Record<MetricDef["sampleUnit"], number> = { plays: 150, dropbacks: 90, rushes: 60, drives: 25 };

export function measure(data: PerfData, sel: PerfSelection, team: string): MetricResult[] {
  const all = leagueSummaries(data, sel);
  const s = all.get(team) ?? summarize(data, team, sel);
  const avg = leagueAverage(data, sel);
  const hasEpa = data.config.hasEpa;
  return PROFILE_METRICS.map((def) => {
    const value = def.read(s, hasEpa);
    const pop = [...all.values()].map((x) => def.read(x, hasEpa));
    const p = percentile(value, pop, def.higherIsBetter);
    const vals = pop.filter((v): v is number => v != null);
    const better = value == null ? 0 : vals.filter((v) => (def.higherIsBetter ? v > value : v < value)).length;
    const sample = def.sample(s);
    return { def, value, pct: p, rank: value == null ? null : better + 1, of: vals.length, sample, small: sample < SMALL[def.sampleUnit], leagueValue: def.read(avg, hasEpa) };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Per-game series (trends), situations and explosive plays
// ---------------------------------------------------------------------------------------------------------------------
export interface GamePoint { row: PerfRow; week: number; opp: string; result: "W" | "L" | "T"; scoreFor: number; scoreAgainst: number; off: Derived; def: Derived; offVec: number[]; defVec: number[] }
export function gameSeries(data: PerfData, team: string, sel: PerfSelection): GamePoint[] {
  const ix = indexOf(data);
  return gamesFor(data, team, { ...sel, window: "season" }).map((row) => {
    const offVec = offenseVec([row], sel.garbage);
    const oppRow = ix.byGameTeam.get(`${row.g}|${row.o}`);
    const defVec = oppRow ? offenseVec([oppRow], sel.garbage) : emptyVec();
    return { row, week: row.w, opp: row.o, result: row.pf > row.pa ? "W" : row.pf < row.pa ? "L" : "T", scoreFor: row.pf, scoreAgainst: row.pa, off: derive(offVec), def: derive(defVec), offVec, defVec };
  });
}

/** Down-and-distance grid: for each down (1-4) and distance bucket, plays and successes. */
export function downDistanceGrid(vec: number[]) {
  return [1, 2, 3, 4].map((down) => DIST_BUCKETS.map((b, bi) => { const i = ddIndex(down, bi); return { down, bucket: bi, label: b.label, n: vec[i], succ: vec[i + 1], rate: vec[i] ? vec[i + 1] / vec[i] : null }; }));
}

/** Sample-size guard for a single cell or situation. */
export const smallSample = (n: number) => n < 20;

/** Sum of the counts in `situation` (an [n, succ] pair index in the vector). */
export const pair = (vec: number[], i: number): { n: number; succ: number; rate: number | null } => ({ n: vec[i], succ: vec[i + 1], rate: vec[i] ? vec[i + 1] / vec[i] : null });

export const SITUATIONS = [
  { id: "early", label: "Early downs (1st and 2nd)", i: V.EARLY },
  { id: "late", label: "Third and fourth down", i: V.LATE },
  { id: "rz", label: `Red zone (inside the ${RED_ZONE})`, i: V.RZ },
  { id: "lead", label: "When leading", i: V.LEAD },
  { id: "tied", label: "When tied", i: V.TIED },
  { id: "trail", label: "When trailing", i: V.TRAIL },
] as const;
