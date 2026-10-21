// Matchup logic with no React: which comparisons exist, how each team scores on them (through the shared engine, so the numbers match the
// other tabs), how big the observed gap is, and the plain-language takeaway. The takeaway is built by fixed rules from the filtered numbers:
// it names the biggest gaps in percentile points, states the sample, and never turns a gap into a prediction.
import { V } from "../../scripts/perf/lib.mjs";
import {
  fieldLabel, fieldPosition, finishing, indexOf, leagueAverage, leagueSummaries, metricById, pair, percentile, summarize,
  type TeamSummary,
} from "./engine";
import type { PerfData, PerfRow, PerfSelection } from "./types";

export type Dir = "a" | "b";
export type Side = "off" | "def";

/** Percentile-point gaps: under 10 reads as even, 20+ as a clear edge, 40+ as a big one. */
export const EDGE = { even: 10, clear: 20, big: 40 };
export type EdgeLevel = "none" | "even" | "slight" | "clear" | "big";
export const edgeLevel = (edge: number | null): EdgeLevel => {
  if (edge == null) return "none";
  const g = Math.abs(edge);
  return g < EDGE.even ? "even" : g < EDGE.clear ? "slight" : g < EDGE.big ? "clear" : "big";
};
export const EDGE_WORD: Record<EdgeLevel, string> = { none: "Not enough data", even: "About even", slight: "Slight edge", clear: "Clear edge", big: "Big edge" };

/** "Chiefs'" / "Seattle's". */
export const poss = (n: string) => (n.endsWith("s") ? `${n}'` : `${n}'s`);
export const ord = (n: number) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;

// ---------------------------------------------------------------------------------------------------------------------
// Per-team bundle of everything a facet can read
// ---------------------------------------------------------------------------------------------------------------------
type Fin = ReturnType<typeof finishing>;
type Fp = ReturnType<typeof fieldPosition>;
export interface Bundle { s: TeamSummary; fin: Fin; finAgainst: Fin; fp: Fp; fpAgainst: Fp }

const oppRowsOf = (data: PerfData, games: PerfRow[]): PerfRow[] => {
  const ix = indexOf(data);
  return games.map((r) => ix.byGameTeam.get(`${r.g}|${r.o}`)).filter((r): r is PerfRow => !!r);
};

export function bundleOf(data: PerfData, sel: PerfSelection, s: TeamSummary): Bundle {
  const opp = oppRowsOf(data, s.games);
  return {
    s,
    fin: finishing(s.games, sel.garbage, "opportunity"), finAgainst: finishing(opp, sel.garbage, "opportunity"),
    fp: fieldPosition(s.games, sel.garbage), fpAgainst: fieldPosition(opp, sel.garbage),
  };
}

const cache = new WeakMap<PerfData, Map<string, Map<string, Bundle>>>();
const keyOf = (s: PerfSelection) => `${s.window}|${s.recentN}|${s.garbage}|${s.includeFcs ? 1 : 0}`;
/** Every population team's bundle under the selection (the benchmark for percentiles), cached. */
export function leagueBundles(data: PerfData, sel: PerfSelection): Map<string, Bundle> {
  let per = cache.get(data);
  if (!per) cache.set(data, (per = new Map()));
  const k = keyOf(sel);
  let m = per.get(k);
  if (m) return m;
  m = new Map();
  for (const [t, s] of leagueSummaries(data, sel)) m.set(t, bundleOf(data, sel, s));
  per.set(k, m);
  return m;
}
const leagueBundle = (data: PerfData, sel: PerfSelection): Bundle => {
  const s = leagueAverage(data, sel);
  const fin = finishing(s.games, sel.garbage, "opportunity");
  const fp = fieldPosition(s.games, sel.garbage);
  // The average defense faces what the average offense produces.
  return { s, fin, finAgainst: fin, fp, fpAgainst: fp };
};

// ---------------------------------------------------------------------------------------------------------------------
// Facets: the eight things compared, each read for an offense and for a defense
// ---------------------------------------------------------------------------------------------------------------------
export type FacetId = "pass" | "rush" | "explosive" | "third" | "redzone" | "early" | "finishing" | "field";
export interface FacetDef {
  id: FacetId;
  label: string;
  plain: string;
  /** How to name it in a sentence: "passing offense" / "pass defense". */
  atkName: string;
  dfnName: string;
  /** Whether a larger raw value is better for the offense (false for starting field position, measured in yards to go). */
  offHigher: boolean;
  /** Samples under this many are flagged. */
  small: number;
  sampleUnit: string;
  read: (b: Bundle, side: Side, hasEpa: boolean) => { v: number | null; n: number };
  short: (v: number | null, hasEpa: boolean) => string;
  describe: (v: number, side: Side, hasEpa: boolean) => string;
  definition: (hasEpa: boolean, defs: Record<string, string>) => string;
}

const pct1 = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
const profile = (offId: string, defId: string) => (b: Bundle, side: Side, e: boolean) => {
  const m = metricById(side === "off" ? offId : defId)!;
  return { v: m.read(b.s, e), n: m.sample(b.s) };
};
const pairOf = (i: number) => (b: Bundle, side: Side) => { const p = pair(side === "off" ? b.s.offVec : b.s.defVec, i); return { v: p.rate, n: p.n }; };

export const FACETS: FacetDef[] = [
  {
    id: "pass", label: "Passing", plain: "Throwing it vs. stopping the pass", atkName: "passing offense", dfnName: "pass defense", offHigher: true, small: 90, sampleUnit: "dropbacks",
    read: profile("passOff", "passDef"),
    short: (v, e) => (v == null ? "—" : e ? `${signed(v)} EPA` : pct1(v)),
    describe: (v, side, e) => metricById(side === "off" ? "passOff" : "passDef")!.describe(v, e),
    definition: (e) => metricById("passOff")!.definition(e) + " The defense side is what opponents' dropbacks did against it.",
  },
  {
    id: "rush", label: "Running", plain: "Running it vs. stopping the run", atkName: "running game", dfnName: "run defense", offHigher: true, small: 60, sampleUnit: "rushes",
    read: profile("rushOff", "rushDef"),
    short: (v, e) => (v == null ? "—" : e ? `${signed(v)} EPA` : pct1(v)),
    describe: (v, side, e) => metricById(side === "off" ? "rushOff" : "rushDef")!.describe(v, e),
    definition: (e) => metricById("rushOff")!.definition(e) + " The defense side is what opponents' runs did against it.",
  },
  {
    id: "explosive", label: "Explosive plays", plain: "Big gains vs. preventing them", atkName: "big-play rate", dfnName: "big plays allowed", offHigher: true, small: 150, sampleUnit: "plays",
    read: (b, side) => ({ v: side === "off" ? b.s.off.explosiveRate : b.s.def.explosiveRate, n: side === "off" ? b.s.playsOff : b.s.playsDef }),
    short: (v) => pct1(v),
    describe: (v, side) => (side === "off" ? `${pct1(v)} of its plays were explosive` : `opponents had an explosive play on ${pct1(v)} of their plays`),
    definition: (_e, d) => `${d.explosive ?? "An explosive play is a pass of 20+ yards or a run of 10+ yards."} Share of all offensive plays; for the defense, the share opponents had against it.`,
  },
  {
    id: "third", label: "Third down", plain: "Getting the yards that keep the drive alive", atkName: "third-down offense", dfnName: "third-down defense", offHigher: true, small: 40, sampleUnit: "third-down plays",
    read: (b, side) => { const d = side === "off" ? b.s.off : b.s.def; return { v: d.thirdDown, n: d.thirdDownPlays ?? 0 }; },
    short: (v) => pct1(v),
    describe: (v, side) => (side === "off" ? `${pct1(v)} of third-down plays gained the yards needed` : `opponents gained the yards needed on ${pct1(v)} of their third-down plays`),
    definition: () => "The share of third-down plays that gain all the yards to go (a touchdown always counts). The defense side is what opponents did against it on third down.",
  },
  {
    id: "redzone", label: "Red zone", plain: "Inside the opponent's 20", atkName: "red-zone offense", dfnName: "red-zone defense", offHigher: true, small: 25, sampleUnit: "red-zone plays",
    read: (b, side) => { const d = side === "off" ? b.s.off : b.s.def; return { v: d.redZone, n: d.redZonePlays ?? 0 }; },
    short: (v) => pct1(v),
    describe: (v, side) => (side === "off" ? `${pct1(v)} of red-zone plays were successful` : `opponents' red-zone plays were successful ${pct1(v)} of the time`),
    definition: (_e, d) => `The share of plays run inside the 20-yard line that were successful (see Success rate). ${d.redzone ?? ""} The defense side is what opponents did there.`,
  },
  {
    id: "early", label: "Early downs", plain: "Staying on schedule on 1st and 2nd down", atkName: "early-down offense", dfnName: "early-down defense", offHigher: true, small: 100, sampleUnit: "early-down plays",
    read: pairOf(V.EARLY),
    short: (v) => pct1(v),
    describe: (v, side) => (side === "off" ? `${pct1(v)} of first- and second-down plays were successful` : `opponents' first- and second-down plays were successful ${pct1(v)} of the time`),
    definition: (_e, d) => `The share of first- and second-down plays that were successful. ${d.success ?? ""}`,
  },
  {
    id: "finishing", label: "Finishing drives", plain: "Turning scoring chances into points", atkName: "finishing of scoring chances", dfnName: "defense in scoring chances", offHigher: true, small: 12, sampleUnit: "scoring chances",
    read: (b, side) => { const f = side === "off" ? b.fin : b.finAgainst; return { v: f.pointsPerOpportunity, n: f.n }; },
    short: (v) => (v == null ? "—" : `${v.toFixed(2)} pts`),
    describe: (v, side) => (side === "off" ? `${v.toFixed(2)} points per scoring chance` : `opponents scored ${v.toFixed(2)} points per scoring chance`),
    definition: (_e, d) => `Points per scoring chance. ${d.opportunity ?? ""} Offensive points only. The defense side is what opponents scored on their chances against it.`,
  },
  {
    id: "field", label: "Starting field position", plain: "Where drives begin", atkName: "starting field position", dfnName: "field position given up", offHigher: false, small: 25, sampleUnit: "drives",
    read: (b, side) => { const f = side === "off" ? b.fp : b.fpAgainst; return { v: f.avgStartYl, n: f.drives }; },
    short: (v) => fieldLabel(v),
    describe: (v, side) => (side === "off" ? `drives start on average at the ${fieldLabel(v).toLowerCase()}` : `opponents' drives start on average at the ${fieldLabel(v).toLowerCase()}`),
    definition: () => "Where the average drive begins, measured to the opponent's goal line. It reflects the whole team (punts, kickoffs and turnovers), not only the offense. The defense side is where opponents' drives against it begin.",
  },
];
export const facetById = (id: string) => FACETS.find((f) => f.id === id);

// ---------------------------------------------------------------------------------------------------------------------
// One team on one facet, and the comparison rows
// ---------------------------------------------------------------------------------------------------------------------
export interface FacetStat {
  team: string; side: Side; value: number | null;
  /** Percentile among the league's teams, higher is always better (for a defense, allowing less). */
  pct: number | null; rank: number | null; of: number; sample: number; small: boolean; leagueValue: number | null;
}

export function facetStat(data: PerfData, sel: PerfSelection, f: FacetDef, team: string, side: Side): FacetStat {
  const all = leagueBundles(data, sel);
  const b = all.get(team) ?? bundleOf(data, sel, summarize(data, team, sel));
  const e = data.config.hasEpa;
  const higher = side === "off" ? f.offHigher : !f.offHigher;
  const { v, n } = f.read(b, side, e);
  const pop = [...all.values()].map((x) => f.read(x, side, e).v);
  const vals = pop.filter((x): x is number => x != null && Number.isFinite(x));
  const better = v == null ? 0 : vals.filter((x) => (higher ? x > v : x < v)).length;
  return {
    team, side, value: v, pct: percentile(v, pop, higher), rank: v == null ? null : better + 1, of: vals.length,
    sample: n, small: n < f.small, leagueValue: f.read(leagueBundle(data, sel), side, e).v,
  };
}

export interface MatchupRow {
  key: string; dir: Dir; facet: FacetDef;
  atk: FacetStat; dfn: FacetStat;
  /** Attacker's percentile minus the defender's: above zero favors the attacker, below zero the defender. */
  edge: number | null;
  level: EdgeLevel;
  small: boolean;
}

export function compareTeams(data: PerfData, sel: PerfSelection, a: string, b: string): MatchupRow[] {
  const rows: MatchupRow[] = [];
  for (const [dir, atkTeam, dfnTeam] of [["a", a, b], ["b", b, a]] as const) {
    for (const f of FACETS) {
      const atk = facetStat(data, sel, f, atkTeam, "off");
      const dfn = facetStat(data, sel, f, dfnTeam, "def");
      const edge = atk.pct != null && dfn.pct != null ? atk.pct - dfn.pct : null;
      rows.push({ key: `mu:${dir}:${f.id}`, dir, facet: f, atk, dfn, edge, level: edgeLevel(edge), small: atk.small || dfn.small });
    }
  }
  return rows;
}

/** The team with the observed edge on a row: "atk", "dfn", or "even" (null when a side has no data). */
export const leans = (r: MatchupRow): "atk" | "dfn" | "even" | null => (r.edge == null ? null : Math.abs(r.edge) < EDGE.even ? "even" : r.edge > 0 ? "atk" : "dfn");
/** The team id that leads on a row ("even" or null otherwise). */
export const leaderOf = (r: MatchupRow): string | "even" | null => { const l = leans(r); return l == null ? null : l === "even" ? "even" : l === "atk" ? r.atk.team : r.dfn.team; };

/** Rows with a clear (non-small, non-even) gap, biggest first. Rows resting on small samples are left out. */
export const biggestGaps = (rows: MatchupRow[], n = 3, min = EDGE.clear): MatchupRow[] =>
  rows.filter((r) => r.edge != null && !r.small && Math.abs(r.edge) >= min).sort((x, y) => Math.abs(y.edge!) - Math.abs(x.edge!)).slice(0, n);

export function leanCounts(rows: MatchupRow[], a: string, b: string) {
  const c = { a: 0, b: 0, even: 0, unknown: 0 };
  for (const r of rows) {
    const l = leaderOf(r);
    if (l == null) c.unknown++; else if (l === "even") c.even++; else if (l === a) c.a++; else if (l === b) c.b++;
  }
  return c;
}

/** One row in a sentence: "Seattle's passing offense (82nd percentile) rates well above Los Angeles's pass defense (40th)." */
export function rowSentence(r: MatchupRow, names: Record<string, string>): string {
  const an = names[r.atk.team], dn = names[r.dfn.team];
  if (r.edge == null) return `${poss(an)} ${r.facet.atkName} and ${poss(dn)} ${r.facet.dfnName} cannot be compared yet (not enough data).`;
  const level = r.level === "even" ? "about the same as" : r.level === "slight" ? "slightly above" : r.level === "clear" ? "well above" : "far above";
  if (r.level === "even") return `${poss(an)} ${r.facet.atkName} (${ord(r.atk.pct!)} percentile) and ${poss(dn)} ${r.facet.dfnName} (${ord(r.dfn.pct!)}) are about even.`;
  return r.edge > 0
    ? `${poss(an)} ${r.facet.atkName} (${ord(r.atk.pct!)} percentile) rates ${level} ${poss(dn)} ${r.facet.dfnName} (${ord(r.dfn.pct!)}).`
    : `${poss(dn)} ${r.facet.dfnName} (${ord(r.dfn.pct!)} percentile) rates ${level} ${poss(an)} ${r.facet.atkName} (${ord(r.atk.pct!)}).`;
}

export const NOT_A_PREDICTION = "This compares what each team has done so far this season. It is not a forecast: it does not estimate who will win or by how much, and an edge in the numbers does not guarantee anything on the field.";

export interface MatchupTake { text: string; small: string }

/** The takeaway: the biggest observed gaps (at most two), the sample behind them, and what is left out. */
export function matchupTakeaway(p: { rows: MatchupRow[]; names: Record<string, string>; gamesA: number; gamesB: number }): MatchupTake {
  const { rows, names, gamesA, gamesB } = p;
  const usable = rows.filter((r) => r.edge != null);
  if (!usable.length) return { text: "There is not enough data on one of these teams to compare them yet.", small: NOT_A_PREDICTION };
  const gaps = biggestGaps(rows, 2);
  const parts: string[] = [];
  if (gaps.length) {
    parts.push(`The biggest gap in the season numbers: ${rowSentence(gaps[0], names)}`);
    if (gaps[1]) parts.push(`Next: ${rowSentence(gaps[1], names)}`);
  } else {
    parts.push(`No area shows a gap of ${EDGE.clear} percentile points or more, so the two teams look closely matched in the season numbers.`);
  }
  const skipped = rows.filter((r) => r.edge != null && r.small && Math.abs(r.edge) >= EDGE.clear).length;
  if (skipped) parts.push(`${skipped} larger gap${skipped === 1 ? " rests" : "s rest"} on small samples and ${skipped === 1 ? "is" : "are"} left out of this summary.`);
  if (Math.min(gamesA, gamesB) <= 3) parts.push(`${names[rows[0].atk.team]} has played ${gamesA} game${gamesA === 1 ? "" : "s"} and ${names[rows[0].dfn.team]} ${gamesB}, so treat this as an early read.`);
  return { text: parts.join(" "), small: NOT_A_PREDICTION };
}

/** Games the two teams have already played each other this season (final games in the file). */
export function playedBetween(data: PerfData, a: string, b: string) {
  return data.games.filter((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a)).sort((x, y) => x.w - y.w);
}
export function playedSentence(g: { home: string; away: string; hs: number; as: number; w: number; ot: number }, names: Record<string, string>): string {
  const homeWon = g.hs > g.as;
  const tie = g.hs === g.as;
  const [w, l, ws, ls] = homeWon ? [g.home, g.away, g.hs, g.as] : [g.away, g.home, g.as, g.hs];
  const ot = g.ot ? " in overtime" : "";
  return tie ? `${names[g.home]} and ${names[g.away]} tied ${g.hs}–${g.as} in Week ${g.w}${ot}.` : `${names[w]} beat ${names[l]} ${ws}–${ls} in Week ${g.w}${ot}.`;
}
