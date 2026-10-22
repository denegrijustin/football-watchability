// Pure helpers for the Drives tab (no React, no fetching): what a game's drives look like on a field, the filters over them, the plays
// that belong to a drive, and the sentence on top. Counting rules live in engine.ts; this file only arranges what the engine returns.
import { DRIVE, RESULT, HOW } from "../../scripts/perf/lib.mjs";
import { driveStats, drivesOf, indexOf } from "./engine";
import type { BigPlay, DriveTuple, PerfData, PerfRow, PerfSelection } from "./types";

export type DriveStats = ReturnType<typeof driveStats>;

// ---------------------------------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------------------------------
export type OutcomeKind = "td" | "fg" | "punt" | "turnover" | "downs" | "missed" | "against" | "other";

export const OUTCOMES: { kind: OutcomeKind; label: string; short: string; plain: string }[] = [
  { kind: "td", label: "Touchdown", short: "TD", plain: "The offense scored a touchdown." },
  { kind: "fg", label: "Field goal", short: "FG", plain: "The offense kicked a field goal." },
  { kind: "punt", label: "Punt", short: "Punt", plain: "The drive stalled and the team punted." },
  { kind: "turnover", label: "Turnover", short: "Turnover", plain: "An interception or a lost fumble." },
  { kind: "downs", label: "Turned over on downs", short: "Downs", plain: "The team went for it on fourth down and did not get it." },
  { kind: "missed", label: "Missed field goal", short: "Missed FG", plain: "The kick missed or was blocked." },
  { kind: "against", label: "Scored on (pick-six, return or safety)", short: "Scored on", plain: "The other side scored during this possession: an interception or fumble returned for a touchdown, or a safety. These are not offensive touchdowns." },
  { kind: "other", label: "Other", short: "Other", plain: "Any other ending." },
];
export const outcomeInfo = (k: OutcomeKind) => OUTCOMES.find((o) => o.kind === k)!;

export function kindOf(result: number): OutcomeKind {
  switch (result) {
    case RESULT.TD: return "td";
    case RESULT.FG: return "fg";
    case RESULT.PUNT: return "punt";
    case RESULT.INT: case RESULT.FUMBLE: return "turnover";
    case RESULT.DOWNS: return "downs";
    case RESULT.MISSED_FG: return "missed";
    case RESULT.SAFETY: case RESULT.DEF_SCORE: return "against";
    default: return "other";
  }
}

/** Exact ending, by RESULT code. */
export const RESULT_TEXT = ["Touchdown", "Field goal", "Punt", "Interception", "Fumble lost", "Turned over on downs", "Missed field goal", "End of half", "Safety against", "Defensive score against", "Other"];
export const RESULT_SHORT = ["TD", "FG", "Punt", "INT", "Fumble", "Downs", "Missed FG", "End", "Safety", "Def. score", "Other"];
export const RESULT_PHRASE = ["scored a touchdown", "kicked a field goal", "punted", "threw an interception", "lost a fumble", "turned it over on downs", "missed a field goal", "ran out the clock", "gave up a safety", "was scored on (an interception or fumble returned for a touchdown)", "ended some other way"];
export const resultText = (d: DriveTuple) => RESULT_TEXT[d[DRIVE.RESULT]] ?? "Other";
export const resultShort = (d: DriveTuple) => RESULT_SHORT[d[DRIVE.RESULT]] ?? "Other";

const HOW_PHRASE: Record<number, string> = {
  [HOW.KICKOFF]: "a kickoff", [HOW.PUNT]: "a punt", [HOW.INT]: "an interception", [HOW.FUMBLE]: "a fumble recovery",
  [HOW.DOWNS]: "a turnover on downs", [HOW.MISSED_FG]: "a missed field goal", [HOW.HALF]: "the start of a half",
};
export const howText = (d: DriveTuple) => HOW_PHRASE[d[DRIVE.HOW]] ?? "another change of possession";

// ---------------------------------------------------------------------------------------------------------------------
// Small formatters
// ---------------------------------------------------------------------------------------------------------------------
export const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;
export const quarterLabel = (period: number) => (period >= 5 ? "OT" : `Q${period}`);
export const quarterWords = (period: number) => (period >= 5 ? "overtime" : `${["1st", "2nd", "3rd", "4th"][period - 1]} quarter`);
/** Game clock left in the quarter when the drive began, or null in overtime (the stored start is game seconds, not reliable there). */
export function clockAtStart(d: DriveTuple): string | null {
  const p = d[DRIVE.PERIOD];
  if (p >= 5) return null;
  return mmss(Math.max(0, Math.min(900, p * 900 - d[DRIVE.START_SEC])));
}
/** "SEA 28" / "DEN 35" / "midfield" for a start measured as yards to the opponent's goal line. */
export function spot(yl: number, own: string, opp: string): string {
  if (yl > 50) return `${own} ${Math.round(100 - yl)}`;
  if (yl < 50) return `${opp} ${Math.round(yl)}`;
  return "midfield";
}
const elapsed = (period: number, clock: string): number | null => {
  const m = /^(\d+):(\d+)/.exec(clock);
  if (!m || period < 1 || period > 4) return null;
  return (period - 1) * 900 + 900 - (Number(m[1]) * 60 + Number(m[2]));
};
export const elapsedAt = elapsed;

// ---------------------------------------------------------------------------------------------------------------------
// A game's drives, placed on one field
// ---------------------------------------------------------------------------------------------------------------------
export interface GameDrive {
  /** `${team}:${index in that team's row}`: stable, and what the shared selection stores (as "drv:" + key). */
  key: string;
  team: string;
  side: "team" | "opp";
  idx: number;
  tuple: DriveTuple;
  row: PerfRow;
  /** 1-based order among the drives shown for the game, both teams together. */
  no: number;
  period: number;
  kind: OutcomeKind;
  /** Field coordinates, 0 = the selected team's goal line and 100 = the opponent's: where the drive began and the farthest it got. */
  x0: number;
  x1: number;
  /** Net yards moved in the field direction at the end (start minus yards), clamped to the field; the bar ends at the farthest point. */
  xEnd: number;
}

const sortKey = (d: DriveTuple) => Math.min(5, d[DRIVE.PERIOD]) * 10000 + d[DRIVE.START_SEC];

export function oppRowOf(data: PerfData, row: PerfRow): PerfRow | undefined {
  return indexOf(data).byGameTeam.get(`${row.g}|${row.o}`);
}

/** The drives of one game, both teams, in the order they happened. They are exactly the drives the engine counts under the garbage-time setting. */
export function buildGameDrives(data: PerfData, row: PerfRow, garbage: PerfSelection["garbage"]): GameDrive[] {
  const other = oppRowOf(data, row);
  const out: Omit<GameDrive, "no">[] = [];
  const add = (r: PerfRow, side: "team" | "opp") => {
    for (const tuple of drivesOf([r], garbage)) {
      const idx = r.d.indexOf(tuple);
      const sy = tuple[DRIVE.START_YL], my = Math.min(tuple[DRIVE.MIN_YL], sy);
      const net = Math.max(0, Math.min(100, sy - tuple[DRIVE.YARDS]));
      const toX = (yl: number) => (side === "team" ? 100 - yl : yl);
      out.push({ key: `${r.t}:${idx}`, team: r.t, side, idx, tuple, row: r, period: tuple[DRIVE.PERIOD], kind: kindOf(tuple[DRIVE.RESULT]), x0: toX(sy), x1: toX(my), xEnd: toX(net) });
    }
  };
  add(row, "team");
  if (other) add(other, "opp");
  out.sort((a, b) => sortKey(a.tuple) - sortKey(b.tuple) || (a.side === b.side ? a.idx - b.idx : a.side === "team" ? -1 : 1));
  return out.map((d, i) => ({ ...d, no: i + 1 }));
}

export type HalfFilter = "all" | "1" | "2";
export type QuarterFilter = "all" | "1" | "2" | "3" | "4" | "5";
export interface DriveFilter { team: "both" | "team" | "opp"; half: HalfFilter; quarter: QuarterFilter; outcome: "all" | OutcomeKind }
export const NO_FILTER: DriveFilter = { team: "both", half: "all", quarter: "all", outcome: "all" };

const halfOf = (p: number) => (p <= 2 ? "1" : p <= 4 ? "2" : "ot");
export function passes(d: GameDrive, f: DriveFilter, skip?: keyof DriveFilter): boolean {
  if (skip !== "team" && f.team !== "both" && d.side !== f.team) return false;
  if (skip !== "half" && f.half !== "all" && halfOf(d.period) !== f.half) return false;
  if (skip !== "quarter" && f.quarter !== "all" && String(Math.min(5, d.period)) !== f.quarter) return false;
  if (skip !== "outcome" && f.outcome !== "all" && d.kind !== f.outcome) return false;
  return true;
}
export const filterDrives = (list: GameDrive[], f: DriveFilter) => list.filter((d) => passes(d, f));
/** How many drives each option of one filter would show, given the other filters (so a chip never promises an empty list without saying so). */
export function optionCounts(list: GameDrive[], f: DriveFilter, dim: keyof DriveFilter): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of list) {
    if (!passes(d, f, dim)) continue;
    const v = dim === "team" ? d.side : dim === "half" ? halfOf(d.period) : dim === "quarter" ? String(Math.min(5, d.period)) : d.kind;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// Which big plays and which logged plays belong to a drive
// ---------------------------------------------------------------------------------------------------------------------
/** Slack, in seconds, around a drive's stored start and length when placing a play on the game clock. */
export const WINDOW = { before: 3, after: 8 };

/** Every drive of the game (kneel-downs included), numbered the way the big-play list numbers them: both teams together in game order. */
function ordinals(a: PerfRow, b: PerfRow | undefined) {
  const all: { row: PerfRow; idx: number; t: DriveTuple }[] = [];
  for (const r of [a, b]) if (r) r.d.forEach((t, idx) => all.push({ row: r, idx, t }));
  all.sort((x, y) => sortKey(x.t) - sortKey(y.t) || (x.row === y.row ? x.idx - y.idx : x.row === a ? -1 : 1));
  return all.map((x, i) => ({ ...x, ord: i + 1 }));
}

/** Big plays by drive (key `${team}:${index}`). A play belongs to the team's drive whose clock window holds it; when two windows touch, the drive number in the data breaks the tie. */
export function bigPlaysByDrive(data: PerfData, row: PerfRow): Map<string, BigPlay[]> {
  const other = oppRowOf(data, row);
  const all = ordinals(row, other);
  const out = new Map<string, BigPlay[]>();
  for (const r of [row, other]) {
    if (!r) continue;
    const mine = all.filter((x) => x.row === r);
    for (const k of r.k) {
      const el = elapsed(k[0], k[1]);
      let cands = el == null
        ? mine.filter((x) => x.t[DRIVE.PERIOD] >= 5)
        : mine.filter((x) => x.t[DRIVE.PERIOD] < 5 && el >= x.t[DRIVE.START_SEC] - WINDOW.before && el <= x.t[DRIVE.START_SEC] + x.t[DRIVE.SECS] + WINDOW.after);
      if (cands.length > 1) {
        const exact = cands.filter((x) => x.ord === k[5]);
        if (exact.length === 1) cands = exact;
        else cands = [cands.reduce((best, x) => (x.t[DRIVE.START_SEC] > best.t[DRIVE.START_SEC] ? x : best))];
      }
      if (cands.length !== 1) continue;
      const key = `${r.t}:${cands[0].idx}`;
      (out.get(key) ?? out.set(key, []).get(key)!).push(k);
    }
  }
  for (const list of out.values()) list.sort((a, b) => (elapsed(a[0], a[1]) ?? 0) - (elapsed(b[0], b[1]) ?? 0));
  return out;
}

/** A play from the Game Center's full play log (functions/api/game.js: `log`). */
export interface LogPlay { id: string; team: string; period: number | null; clock: string; text: string; kind: string; yards: number; score: boolean; turnover: boolean }
export interface LogTeam { id?: string; abbr?: string; homeAway?: string; score?: number }

/** Which of the Game Center's two teams is `team`: by abbreviation or id first, then by final score, then by home/away. Null when it cannot be told. */
export function resolveTeamId(teams: LogTeam[], q: { team: string; abbr?: string; pf: number; pa: number; home: boolean }): string | null {
  const hit = teams.find((t) => t.id === q.team || (q.abbr && t.abbr === q.abbr));
  if (hit?.id) return hit.id;
  const byScore = teams.filter((t) => t.score === q.pf);
  if (q.pf !== q.pa && byScore.length === 1 && teams.find((t) => t.score === q.pa && t !== byScore[0])) return byScore[0].id ?? null;
  const side = teams.find((t) => t.homeAway === (q.home ? "home" : "away"));
  return side?.id ?? null;
}

export type PlayMatch = { ok: true; plays: LogPlay[] } | { ok: false; reason: string };
/** The logged plays of one drive: same team, inside the drive's clock window. Overtime is matched only when the team had a single overtime drive. */
export function playsForDrive(log: LogPlay[], espnTeam: string, d: GameDrive, drivesOfTeamInOt: number): PlayMatch {
  const t = d.tuple;
  const mine = log.filter((p) => p.team === espnTeam);
  if (!mine.length) return { ok: false, reason: "The play list has no plays for this team." };
  let plays: LogPlay[];
  if (t[DRIVE.PERIOD] >= 5) {
    if (drivesOfTeamInOt !== 1) return { ok: false, reason: "Overtime has several possessions by this team, and the play list does not say which play belongs to which." };
    plays = mine.filter((p) => (p.period ?? 0) >= 5);
  } else {
    const from = t[DRIVE.START_SEC] - WINDOW.before, to = t[DRIVE.START_SEC] + t[DRIVE.SECS] + WINDOW.after;
    plays = mine.filter((p) => { const el = elapsed(p.period ?? 0, p.clock); return el != null && el >= from && el <= to; });
  }
  return plays.length ? { ok: true, plays } : { ok: false, reason: "No logged plays fall inside this drive's time on the clock." };
}

// ---------------------------------------------------------------------------------------------------------------------
// Season cards and the sentence
// ---------------------------------------------------------------------------------------------------------------------
export interface DriveCard {
  id: "ppd" | "scoring" | "td" | "threeOut" | "start";
  label: string;
  tip: string;
  value: number | null;
  bench: number | null;
  /** Which direction is better. */
  better: "high" | "low";
  text: string;
  benchText: string;
  /** "better", "worse" or "similar" against the benchmark, and the difference in words. */
  verdict: "better" | "worse" | "similar" | null;
  diffText: string;
}

const EPS = { ppd: 0.1, pct: 0.02, start: 1.5 };
const pct1 = (v: number) => `${(v * 100).toFixed(0)}%`;

function card(id: DriveCard["id"], label: string, tip: string, v: number | null, b: number | null, better: "high" | "low", fmtV: (x: number) => string, eps: number, diff: (d: number) => string): DriveCard {
  let verdict: DriveCard["verdict"] = null, diffText = "";
  if (v != null && b != null) {
    const d = v - b;
    const good = better === "high" ? d : -d;
    verdict = Math.abs(d) < eps ? "similar" : good > 0 ? "better" : "worse";
    diffText = verdict === "similar" ? "about the same" : `${diff(d)} · ${verdict}`;
  }
  return { id, label, tip, value: v, bench: b, better, text: v == null ? "—" : fmtV(v), benchText: b == null ? "" : fmtV(b), verdict, diffText };
}

/** `side` "def" reads the opponents' drives against the team, so a lower number for them is the better one for the team. */
export function driveCards(s: DriveStats, bench: DriveStats | null, side: "off" | "def" = "off"): DriveCard[] {
  const b = bench && bench.drives > 0 ? bench : null;
  const hi = side === "off" ? "high" : "low", lo = side === "off" ? "low" : "high";
  const sgn = (d: number, unit: string, dp: number) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(dp)}${unit}`;
  const fieldTxt = (yl: number) => (yl > 50 ? `own ${Math.round(100 - yl)}` : yl < 50 ? `opp ${Math.round(yl)}` : "midfield");
  return [
    card("ppd", "Points per drive", "Offensive points (touchdowns with the extra point, and field goals) divided by drives. Scores by the defense or special teams are not included.", s.pointsPerDrive, b?.pointsPerDrive ?? null, hi, (x) => x.toFixed(2), EPS.ppd, (d) => sgn(d, "", 2)),
    card("scoring", "Scoring drives", "The share of drives that ended in a touchdown or a field goal.", s.scoringRate, b?.scoringRate ?? null, hi, pct1, EPS.pct, (d) => sgn(d * 100, " pts", 0)),
    card("td", "Touchdown drives", "The share of drives that ended in an offensive touchdown.", s.tdRate, b?.tdRate ?? null, hi, pct1, EPS.pct, (d) => sgn(d * 100, " pts", 0)),
    card("threeOut", "Three-and-outs", "Drives of three plays or fewer that ended in a punt.", s.threeAndOutRate, b?.threeAndOutRate ?? null, lo, pct1, EPS.pct, (d) => sgn(d * 100, " pts", 0)),
    card("start", "Average start", "Where drives begin on average. A start closer to the opponent's goal line is a shorter field.", s.avgStartYl, b?.avgStartYl ?? null, lo, (x) => fieldTxt(x), EPS.start, (d) => `${Math.abs(d).toFixed(0)} yd ${d < 0 ? "closer to" : "farther from"} the goal`),
  ];
}

export interface DriveTakeInput {
  side?: "off" | "def";
  name: string;
  benchName: string | null;
  stats: DriveStats;
  bench: DriveStats | null;
  game: { label: string; oppName: string; mine: DriveStats; theirs: DriveStats; pf: number; pa: number } | null;
}
export const SMALL_DRIVES = 25;
export const PPD_GAP = 0.15;

/** The sentence above the charts, from fixed rules: season scoring rate and points per drive against the benchmark (a gap under 0.15 points per drive is "about the same"), then the shown game's counts. No causes are claimed. */
export function drivesTakeaway(i: DriveTakeInput): { text: string; small?: string } {
  const s = i.stats;
  if (!s.drives) return { text: `There are no drives to summarize for ${i.name} yet.` };
  const def = i.side === "def";
  let t = def
    ? `Opponents scored on ${pct1(s.scoringRate ?? 0)} of their ${s.drives} drives against ${i.name} (${(s.pointsPerDrive ?? 0).toFixed(2)} points per drive)`
    : `${i.name} scored on ${pct1(s.scoringRate ?? 0)} of ${s.drives} drives (${(s.pointsPerDrive ?? 0).toFixed(2)} points per drive)`;
  if (i.bench && i.benchName && i.bench.drives > 0 && i.bench.pointsPerDrive != null && s.pointsPerDrive != null) {
    const d = (s.pointsPerDrive - i.bench.pointsPerDrive) * (def ? -1 : 1);
    const b = i.bench.pointsPerDrive.toFixed(2);
    t += d >= PPD_GAP ? `, better than ${i.benchName} at ${b}.` : d <= -PPD_GAP ? `, behind ${i.benchName} at ${b}.` : `, about the same as ${i.benchName} at ${b}.`;
  } else t += ".";
  if (i.game) {
    const g = i.game;
    const k = (x: DriveStats) => Math.round((x.scoringRate ?? 0) * x.drives);
    t += ` In ${g.label}, ${i.name} scored on ${k(g.mine)} of ${g.mine.drives} drives and ${g.oppName} on ${k(g.theirs)} of ${g.theirs.drives}.`;
  }
  return { text: t, small: s.drives < SMALL_DRIVES ? `Only ${s.drives} drives so far, so this is an early read.` : undefined };
}

// ---------------------------------------------------------------------------------------------------------------------
// The selection slots this tab uses
// ---------------------------------------------------------------------------------------------------------------------
/** The shared metric slot holds "drv:<game id>|<team>:<index>", so a drive chosen in another tab is only used for the game it belongs to. */
export const driveSlot = (game: string, key: string) => `drv:${game}|${key}`;
export function parseDriveSlot(metric: string | null): { game: string; key: string } | null {
  if (!metric || !metric.startsWith("drv:")) return null;
  const [game, key] = metric.slice(4).split("|");
  return game && key ? { game, key } : null;
}

/** Two team colors that read as different teams: the second falls back to a neutral accent when they are nearly the same. */
export function apart(a: string, b: string, fallback: string): string {
  const p = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const x = p(a), y = p(b);
  if (!x || !y) return b;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 90 ? fallback : b;
}

/** "Seahawks'" / "Bama's": the possessive of a team name. */
export const poss = (n: string) => (n.endsWith("s") ? `${n}'` : `${n}'s`);
