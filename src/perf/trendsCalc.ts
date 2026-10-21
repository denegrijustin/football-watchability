// Trends logic with no React: the metric catalog, per-game and rolling series (all through the shared engine), a game's contribution to the
// season figure, the drives and big plays behind a game, and the rule-based direction statement.
import { DRIVE, RESULT_LABEL } from "../../scripts/perf/lib.mjs";
import { drivesOf, fieldLabel, gamesFor, gameSeries, indexOf, leagueAverage, summarizeGames, type TeamSummary } from "./engine";
import { poss } from "./matchupCalc";
import type { PerfData, PerfRow, PerfSelection } from "./types";

export type Side = "off" | "def";

export interface TMetric {
  id: string; label: string; plain: string;
  /** Larger is better for the offense (false for giveaways); a defense is the reverse. */
  offHigher: boolean;
  /** The smallest change between two stretches of games that is called a change rather than noise. */
  step: number;
  fmt: (v: number | null) => string;
  /** The same unit with a word: "+0.12 EPA per play". */
  long: (v: number | null) => string;
  read: (s: TeamSummary, side: Side, league: boolean) => number | null;
  /** Plays (or games) behind a single game's number, for the small-sample flag; null when it is always one game. */
  sample: (s: TeamSummary, side: Side) => number;
  sampleUnit: string;
  small: number;
  definition: (defs: Record<string, string>) => string;
}
const p1 = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const sg = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
const plays = (s: TeamSummary, side: Side) => (side === "off" ? s.playsOff : s.playsDef);

export function trendMetrics(hasEpa: boolean): TMetric[] {
  const eff: TMetric = hasEpa
    ? { id: "eff", label: "EPA per play", plain: "Efficiency on every play", offHigher: true, step: 0.05, fmt: (v) => (v == null ? "—" : sg(v)), long: (v) => (v == null ? "—" : `${sg(v)} expected points per play`), read: (s, side) => (side === "off" ? s.off : s.def).epaPerPlay, sample: plays, sampleUnit: "plays", small: 40, definition: (d) => d.efficiency ?? "" }
    : { id: "eff", label: "Success rate", plain: "Efficiency: how often plays stay on schedule", offHigher: true, step: 0.03, fmt: p1, long: (v) => (v == null ? "—" : `${p1(v)} of plays successful`), read: (s, side) => (side === "off" ? s.off : s.def).successRate, sample: plays, sampleUnit: "plays", small: 40, definition: (d) => d.success ?? "" };
  const list: TMetric[] = [eff];
  if (hasEpa) list.push({ id: "succ", label: "Success rate", plain: "How often plays stay on schedule", offHigher: true, step: 0.03, fmt: p1, long: (v) => (v == null ? "—" : `${p1(v)} of plays successful`), read: (s, side) => (side === "off" ? s.off : s.def).successRate, sample: plays, sampleUnit: "plays", small: 40, definition: (d) => d.success ?? "" });
  list.push(
    { id: "ypp", label: "Yards per play", plain: "Average gain on each play", offHigher: true, step: 0.4, fmt: (v) => (v == null ? "—" : v.toFixed(1)), long: (v) => (v == null ? "—" : `${v.toFixed(1)} yards per play`), read: (s, side) => (side === "off" ? s.off : s.def).yardsPerPlay, sample: plays, sampleUnit: "plays", small: 40, definition: () => "Total passing and rushing yards (sacks count as lost yards) divided by plays." },
    { id: "expl", label: "Explosive play rate", plain: "How often a play is a big gain", offHigher: true, step: 0.015, fmt: p1, long: (v) => (v == null ? "—" : `${p1(v)} of plays were explosive`), read: (s, side) => (side === "off" ? s.off : s.def).explosiveRate, sample: plays, sampleUnit: "plays", small: 40, definition: (d) => d.explosive ?? "" },
    { id: "ppd", label: "Points per drive", plain: "Offensive points from each possession", offHigher: true, step: 0.25, fmt: (v) => (v == null ? "—" : v.toFixed(2)), long: (v) => (v == null ? "—" : `${v.toFixed(2)} points per drive`), read: (s, side) => (side === "off" ? s.drives : s.drivesAgainst).pointsPerDrive, sample: (s, side) => (side === "off" ? s.drives : s.drivesAgainst).drives, sampleUnit: "drives", small: 6, definition: (d) => `${d.drive ?? ""} Offensive points only; scores by a defense or special teams are not included.` },
    { id: "to", label: "Turnovers", plain: "Giveaways (offense) or takeaways (defense) per game", offHigher: false, step: 0.4, fmt: (v) => (v == null ? "—" : v.toFixed(1)), long: (v) => (v == null ? "—" : `${v.toFixed(1)} per game`), read: (s, side) => (s.games.length ? (side === "off" ? s.drives : s.drivesAgainst).turnovers / s.games.length : null), sample: (s) => s.games.length, sampleUnit: "games", small: 1, definition: () => "Interceptions and lost fumbles that ended a drive. For an offense these are giveaways (fewer is better); for a defense, the other team's giveaways, which are takeaways (more is better)." },
  );
  return list;
}

/** Whether a higher number is good news for this side of this metric. */
export const higherIsBetter = (m: TMetric, side: Side) => (side === "off" ? m.offHigher : !m.offHigher);

export interface SeriesPoint {
  row: PerfRow; g: string; week: number; opp: string; home: number; result: "W" | "L" | "T"; scoreFor: number; scoreAgainst: number;
  value: number | null; plays: number; small: boolean; rolling: number | null;
}

/** One team's per-game values (and a play-weighted rolling value over its last `roll` games, once that many have been played). */
export function buildSeries(data: PerfData, sel: PerfSelection, team: string, m: TMetric, side: Side, roll: number): SeriesPoint[] {
  const s = { ...sel, window: "season" as const };
  const gs = gameSeries(data, team, s);
  const rows = gs.map((p) => p.row);
  return gs.map((p, i) => {
    const one = summarizeGames(data, team, [p.row], sel.garbage);
    const n = m.sample(one, side);
    return {
      row: p.row, g: p.row.g, week: p.week, opp: p.opp, home: p.row.h, result: p.result, scoreFor: p.scoreFor, scoreAgainst: p.scoreAgainst,
      value: m.read(one, side, false), plays: n, small: n < m.small,
      rolling: roll > 1 && i >= roll - 1 ? m.read(summarizeGames(data, team, rows.slice(i - roll + 1, i + 1), sel.garbage), side, false) : null,
    };
  });
}

/** The league's number for the metric (all teams' games, summed). Null in an empty league. */
export function leagueValue(data: PerfData, sel: PerfSelection, m: TMetric, side: Side): number | null {
  return m.read(leagueAverage(data, { ...sel, window: "season" }), side, true);
}

/** The season number over all the team's counted games, and the same without one game: the game's pull on the season figure. */
export function contribution(data: PerfData, sel: PerfSelection, team: string, m: TMetric, side: Side, gameId: string) {
  const rows = gamesFor(data, team, { ...sel, window: "season" });
  const all = m.read(summarizeGames(data, team, rows, sel.garbage), side, false);
  const rest = rows.filter((r) => r.g !== gameId);
  const without = rest.length ? m.read(summarizeGames(data, team, rest, sel.garbage), side, false) : null;
  return { all, without, games: rows.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// The drives and big plays behind one game
// ---------------------------------------------------------------------------------------------------------------------
export function gameDetail(data: PerfData, sel: PerfSelection, row: PerfRow, side: Side) {
  const sideRow = side === "off" ? row : indexOf(data).byGameTeam.get(`${row.g}|${row.o}`) ?? null;
  const drives = sideRow ? drivesOf([sideRow], sel.garbage) : [];
  const lines = drives.map((d) => ({ period: d[DRIVE.PERIOD], start: fieldLabel(d[DRIVE.START_YL]), plays: d[DRIVE.PLAYS], yards: d[DRIVE.YARDS], result: RESULT_LABEL[d[DRIVE.RESULT]] as string, pts: d[DRIVE.PTS] }));
  const plays = (sideRow?.k ?? []).filter((k) => sel.garbage === "all" || k[6] === 0).sort((a, b) => b[2] - a[2] || a[0] - b[0]).slice(0, 5);
  return { hasRow: !!sideRow, lines, plays, tally: tally(lines.map((l) => l.result)) };
}
function tally(results: string[]) {
  const c = (...k: string[]) => results.filter((r) => k.includes(r)).length;
  return { td: c("Touchdown"), fg: c("Field goal"), punt: c("Punt"), turnover: c("Interception", "Fumble lost"), other: results.length - c("Touchdown", "Field goal", "Punt", "Interception", "Fumble lost") };
}

// ---------------------------------------------------------------------------------------------------------------------
// Direction statement
// ---------------------------------------------------------------------------------------------------------------------
export const RECENT_GAMES = 3;
export type Verdict = "early" | "improving" | "declining" | "steady";
export interface Direction { n: number; recent: number | null; earlier: number | null; nEarlier: number; delta: number | null; verdict: Verdict }

/** Mean of a list ignoring nulls (null for an empty list). */
export const meanOf = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/** The verdict from the last three values against the earlier ones: under four games is "too early"; a change smaller than `step` is "steady". */
export function direction(values: (number | null)[], better: "high" | "low", step: number, recentOf: (ix: number[]) => number | null = (ix) => meanOf(ix.map((i) => values[i]))): Direction {
  const idx = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  const n = idx.length;
  if (n < 4) return { n, recent: null, earlier: null, nEarlier: Math.max(0, n - RECENT_GAMES), delta: null, verdict: "early" };
  const last = idx.slice(-RECENT_GAMES), before = idx.slice(0, -RECENT_GAMES);
  const recent = recentOf(last), earlier = recentOf(before);
  if (recent == null || earlier == null) return { n, recent, earlier, nEarlier: before.length, delta: null, verdict: "early" };
  const delta = recent - earlier;
  const good = better === "high" ? delta : -delta;
  return { n, recent, earlier, nEarlier: before.length, delta, verdict: Math.abs(delta) < step ? "steady" : good > 0 ? "improving" : "declining" };
}

/** The takeaway sentence. Describes what happened in the games shown; makes no claim about why and none about the future. */
export function trendSentence(p: { name: string; side: Side; label: string; d: Direction; fmt: (v: number | null) => string; adjusted?: string | null; sideBetter?: string }): string {
  const { name, side, label, d, fmt } = p;
  const unit = side === "off" ? "offense" : "defense";
  const what = p.adjusted ? `${p.adjusted} for ${poss(name)} ${unit}` : `${poss(name)} ${unit} (${label})`;
  if (d.verdict === "early") return `It is too early to say whether ${what} is moving: only ${d.n} game${d.n === 1 ? "" : "s"} so far, and at least 4 are needed to compare the last ${RECENT_GAMES} with the games before.`;
  const span = `${fmt(d.recent)} over the last ${RECENT_GAMES} games against ${fmt(d.earlier)} over the ${d.nEarlier} before`;
  const head = d.verdict === "steady" ? `${what} has held about steady: ${span}.` : `${what} has been ${d.verdict}: ${span}.`;
  const tail = d.n <= 5 ? ` That rests on only ${d.n} games, so treat it as an early read.` : "";
  return `${head}${tail}`;
}

export const rollLabel = (n: number) => (n > 1 ? `${n}-game rolling average` : null);

/** The direction of a team's series, with the last-three and earlier stretches weighted by plays (summed through the engine, not averaged per game). */
export function seriesDirection(data: PerfData, sel: PerfSelection, team: string, m: TMetric, side: Side, pts: SeriesPoint[]): Direction {
  return direction(pts.map((p) => p.value), higherIsBetter(m, side) ? "high" : "low", m.step, (ix) => (ix.length ? m.read(summarizeGames(data, team, ix.map((i) => pts[i].row), sel.garbage), side, false) : null));
}
