// Pure calculations behind the Big Plays tab: one point per team (success rate against explosive-play rate), the league lines, quadrants,
// the takeaway sentence, the keyboard neighbour search and the list of a team's longest plays. Numbers come from engine.ts.
import { V } from "../../scripts/perf/lib.mjs";
import { gamesFor, indexOf, leagueAverage, leagueSummaries, type TeamSummary } from "./engine";
import type { PerfData, PerfRow, PerfSelection } from "./types";

export type BpMode = "off" | "pass" | "rush" | "def";
export const BP_MODES: { id: BpMode; label: string; noun: string; unit: string; small: number }[] = [
  { id: "off", label: "All plays", noun: "plays", unit: "plays", small: 150 },
  { id: "pass", label: "Passing", noun: "dropbacks", unit: "dropbacks", small: 90 },
  { id: "rush", label: "Rushing", noun: "runs", unit: "rushes", small: 60 },
  { id: "def", label: "Defense", noun: "plays against", unit: "plays", small: 150 },
];
export const modeDef = (m: BpMode) => BP_MODES.find((x) => x.id === m)!;

/** The mode lives in the shared selection: Defense is the shared Side control; the other three are kept in sel.metric ("bp-pass"). */
export function modeOf(sel: Pick<PerfSelection, "side" | "metric">): BpMode {
  if (sel.side === "def") return "def";
  return sel.metric === "bp-pass" ? "pass" : sel.metric === "bp-rush" ? "rush" : "off";
}
export const modePatch = (m: BpMode): Partial<PerfSelection> => (m === "def" ? { side: "def" } : { side: "off", metric: m === "off" ? null : `bp-${m}` });

export interface BpPoint { id: string; x: number; y: number; n: number; games: number; small: boolean }
export interface BpPopulation { mode: BpMode; points: BpPoint[]; line: { x: number; y: number } | null; sd: { x: number; y: number } }

function readSummary(s: TeamSummary, mode: BpMode): { x: number | null; y: number | null; n: number } {
  switch (mode) {
    case "pass": return { x: s.off.passSuccess, y: s.off.passExplosive, n: s.offVec[V.PN] };
    case "rush": return { x: s.off.rushSuccess, y: s.off.rushExplosive, n: s.offVec[V.RN] };
    case "def": return { x: s.def.successRate, y: s.def.explosiveRate, n: s.playsDef };
    default: return { x: s.off.successRate, y: s.off.explosiveRate, n: s.playsOff };
  }
}
const sdOf = (xs: number[]) => { if (xs.length < 2) return 0; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };

/** Every population team's point under the selection, and the league line (the league as one team) the quadrants are cut on. */
export function population(data: PerfData, sel: PerfSelection, mode: BpMode): BpPopulation {
  const small = modeDef(mode).small;
  const points: BpPoint[] = [];
  for (const [id, s] of leagueSummaries(data, sel)) {
    const r = readSummary(s, mode);
    if (r.x == null || r.y == null || !r.n) continue;
    points.push({ id, x: r.x, y: r.y, n: r.n, games: s.games.length, small: r.n < small });
  }
  const lg = leagueAverage(data, sel);
  const l = readSummary(lg, mode);
  const sd = { x: sdOf(points.map((p) => p.x)), y: sdOf(points.map((p) => p.y)) };
  return { mode, points, line: l.x != null && l.y != null ? { x: l.x, y: l.y } : null, sd };
}

// ---------------------------------------------------------------------------------------------------------------------
// Quadrants
// ---------------------------------------------------------------------------------------------------------------------
export interface Quadrant { hiX: boolean; hiY: boolean; label: string; best: boolean; blurb: string }
/** The four corners, named for the mode. For defense both axes are what opponents achieved, so low is good and the best corner is bottom-left. */
export function quadrant(mode: BpMode, hiX: boolean, hiY: boolean): Quadrant {
  if (mode === "def") {
    if (!hiX && !hiY) return { hiX, hiY, label: "Shuts down both", best: true, blurb: "Opponents rarely stay on schedule and rarely break a long one." };
    if (!hiX && hiY) return { hiX, hiY, label: "Tough, but gives up big plays", best: false, blurb: "Opponents seldom stay on schedule, but when they hit, it goes long." };
    if (hiX && !hiY) return { hiX, hiY, label: "Bends, few big plays", best: false, blurb: "Opponents move steadily but rarely break a long one." };
    return { hiX, hiY, label: "Struggles on both", best: false, blurb: "Opponents move steadily and also break long plays." };
  }
  if (hiX && hiY) return { hiX, hiY, label: "Steady and explosive", best: true, blurb: "Plays succeed often and many go for big gains." };
  if (hiX && !hiY) return { hiX, hiY, label: "Steady, few big plays", best: false, blurb: "Plays succeed often, but few go for big gains." };
  if (!hiX && hiY) return { hiX, hiY, label: "Boom or bust", best: false, blurb: "Plays succeed less often than most, but when they hit, they go big." };
  return { hiX, hiY, label: "Struggles on both", best: false, blurb: "Plays succeed less often and few go for big gains." };
}
export const quadrantOf = (mode: BpMode, p: { x: number; y: number }, line: { x: number; y: number }) => quadrant(mode, p.x >= line.x, p.y >= line.y);
export function quadrantCounts(mode: BpMode, pts: BpPoint[], line: { x: number; y: number }): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pts) { const q = quadrantOf(mode, p, line).label; m.set(q, (m.get(q) ?? 0) + 1); }
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// Takeaway
// ---------------------------------------------------------------------------------------------------------------------
export type Level = "hi" | "mid" | "lo";
/** Within this share of a standard deviation of the league line a team counts as average on that axis. */
export const DEADBAND = 0.4;
export const levelOf = (v: number, line: number, sd: number): Level => (Math.abs(v - line) <= DEADBAND * sd ? "mid" : v > line ? "hi" : "lo");
const pc = (v: number) => `${(v * 100).toFixed(0)}%`;

/**
 * One or two sentences from fixed rules. Each axis is compared with the league line: more than 0.4 standard deviations (of the
 * league's teams) above or below counts as high or low, anything closer as average. The two levels pick the headline:
 *   offense:  high/high steady and explosive · high/low-or-average steady with few big plays · low/high relies on big plays ·
 *             low/low struggles on both · average axes are described as "about average";
 *   defense:  the same table, read the other way (low is good).
 * A team with fewer plays than the mode's small-sample limit gets no verdict, only its numbers; three games or fewer, or any
 * small sample, adds the caution that explosive rates swing early in a season. Descriptions only, never causes.
 */
export function bigPlayTakeaway(a: { name: string; mode: BpMode; p: BpPoint | null; line: { x: number; y: number } | null; sd: { x: number; y: number } }): { text: string | null; small?: string; levels?: { x: Level; y: Level } } {
  const { name, mode, p, line, sd } = a;
  const md = modeDef(mode);
  if (!p || !line) return { text: `${name} has no ${md.unit} in this selection yet.` };
  const num = mode === "def"
    ? `Opponents succeeded on ${pc(p.x)} of plays (league ${pc(line.x)}) and ${pc(p.y)} went for big gains (league ${pc(line.y)})`
    : `${pc(p.x)} of ${md.noun} succeeded (league ${pc(line.x)}) and ${pc(p.y)} went for big gains (league ${pc(line.y)})`;
  const early = p.games <= 3 ? `Only ${p.games} game${p.games === 1 ? "" : "s"} so far, and big-play rates swing a lot over a few games.` : p.small ? `Only ${p.n} ${md.unit} so far, and big-play rates swing a lot over a small sample.` : undefined;
  if (p.small) return { text: `Only ${p.n} ${md.unit} so far for ${name}, too few to call it steady or boom-or-bust. ${num[0].toUpperCase()}${num.slice(1)}.`, small: early };
  const lx = levelOf(p.x, line.x, sd.x), ly = levelOf(p.y, line.y, sd.y);
  const key = `${lx}/${ly}`;
  const head = (mode === "def"
    ? {
      "lo/lo": "Limits both steady gains and big plays", "lo/mid": "Keeps opponents off schedule, with an average number of big plays against", "lo/hi": "Keeps opponents off schedule but gives up big plays",
      "mid/lo": "Gives up an average number of successful plays but few big ones", "mid/mid": "Close to the league on both", "mid/hi": "Average at stopping steady gains but gives up big plays",
      "hi/lo": "Gives up steady gains but few big plays", "hi/mid": "Gives up steady gains, with an average number of big plays against", "hi/hi": "Struggling on both: steady gains and big plays against",
    }
    : {
      "hi/hi": "Steady and explosive", "hi/mid": "Steady, with an average number of big plays", "hi/lo": "Steady, but few big plays",
      "mid/hi": "Average at staying on schedule, leaning on big plays", "mid/mid": "Close to the league on both", "mid/lo": "Average at staying on schedule, with few big plays",
      "lo/hi": "Relies on big plays: fewer plays succeed than usual, but more go long", "lo/mid": "Succeeds less often than most, with an average number of big plays", "lo/lo": "Struggling on both: fewer successful plays and fewer big ones",
    } as Record<string, string>)[key];
  const label = mode === "off" ? "" : mode === "pass" ? " passing" : mode === "rush" ? " rushing" : " defense";
  return { text: `${name}${label}: ${head}. ${num}.`, small: early, levels: { x: lx, y: ly } };
}

// ---------------------------------------------------------------------------------------------------------------------
// Keyboard: move to the nearest dot in a direction
// ---------------------------------------------------------------------------------------------------------------------
export type Dir = "left" | "right" | "up" | "down";
/** `pts` are screen coordinates. Picks the closest dot in the direction, preferring ones that are more in line with the current one. */
export function neighbor(pts: { id: string; px: number; py: number }[], from: string, dir: Dir): string {
  const me = pts.find((p) => p.id === from);
  if (!me) return pts[0]?.id ?? from;
  let best: { id: string; s: number } | null = null;
  for (const p of pts) {
    if (p.id === from) continue;
    const dx = p.px - me.px, dy = p.py - me.py;
    const along = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
    const across = dir === "right" || dir === "left" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 0.5) continue;
    const s = along + 2 * across;
    if (!best || s < best.s || (s === best.s && p.id < best.id)) best = { id: p.id, s };
  }
  return best?.id ?? from;
}

// ---------------------------------------------------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------------------------------------------------
export type SortKey = "name" | "x" | "y" | "n" | "quad";
export function sortPoints<T extends BpPoint>(pts: T[], key: SortKey, dir: 1 | -1, name: (id: string) => string, quad: (p: T) => string): T[] {
  const val = (p: T): number | string => (key === "name" ? name(p.id) : key === "quad" ? quad(p) : key === "x" ? p.x : key === "y" ? p.y : p.n);
  return [...pts].sort((a, b) => { const va = val(a), vb = val(b); const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number); return (c || name(a.id).localeCompare(name(b.id))) * dir; });
}

// ---------------------------------------------------------------------------------------------------------------------
// A team's longest plays
// ---------------------------------------------------------------------------------------------------------------------
export interface BigPlayItem { game: string; week: number; by: string; against: string; home: number; period: number; clock: string; yards: number; pass: boolean; text: string; garbage: boolean }
export interface BigPlayList { items: BigPlayItem[]; /** How many matching plays are stored in all. */ total: number; /** A game kept only its six longest, so a few shorter plays may be missing. */ partial: boolean }

/**
 * The longest explosive plays in the selected games (garbage time left out when the selection skips it). Offense modes list the team's
 * own plays; defense lists the plays its opponents made against it. Passing and rushing filter by kind. The data keeps each team-game's six
 * longest, so `partial` says when a game hit that cap.
 */
export function longestPlays(data: PerfData, sel: PerfSelection, team: string, mode: BpMode, limit = 5): BigPlayList {
  const ix = indexOf(data);
  const games = gamesFor(data, team, sel);
  const rows: PerfRow[] = mode === "def" ? games.map((g) => ix.byGameTeam.get(`${g.g}|${g.o}`)).filter((r): r is PerfRow => !!r) : games;
  const all: BigPlayItem[] = [];
  let partial = false;
  for (const r of rows) {
    if (r.k.length >= 6) partial = true;
    for (const k of r.k) {
      if (sel.garbage === "skip" && k[6] === 1) continue;
      if (mode === "pass" && k[3] !== 1) continue;
      if (mode === "rush" && k[3] !== 0) continue;
      all.push({ game: r.g, week: r.w, by: r.t, against: r.o, home: r.h, period: k[0], clock: k[1], yards: k[2], pass: k[3] === 1, text: k[4], garbage: k[6] === 1 });
    }
  }
  all.sort((a, b) => b.yards - a.yards || a.week - b.week || a.clock.localeCompare(b.clock));
  return { items: all.slice(0, limit), total: all.length, partial: partial && (mode === "pass" || mode === "rush") };
}

export const periodName = (p: number) => (p <= 4 ? `Q${p}` : "OT");
