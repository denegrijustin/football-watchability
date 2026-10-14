/**
 * What the Game Center needs to project a game: a small file (/data/spplus-lite.json) holding every FBS team's SP+ ratings by week, the
 * fitted simulator constants and the sheet's schedule. It is built from the full snapshot at build time (liteBuild.ts), so it cannot
 * disagree with the CFB SP+ tab. Pure TypeScript, and only the simulator core is imported, so this stays small.
 */
import { simulate, type SimParams, type TeamRatings } from "./sim/engine";

export interface SpLite {
  version: 1;
  fetchedAt: string;
  sheet: string;
  latestWeek: number;
  params: Omit<SimParams, "leagueAvgPts">;
  leagueAvg: Record<string, number>;
  /** First game date (YYYY-MM-DD) of each sheet week. */
  weekStarts: Record<string, string>;
  /** sp, off, def, st by week; spRk is the latest national rank. */
  teams: Record<string, { conf: string; spRk: number; r: Record<string, [number, number, number, number]> }>;
  /** ESPN team id -> the sheet's team name. */
  espn: Record<string, string>;
  /** The board's logo id -> the sheet's team name (final games carry no ESPN id). */
  logo: Record<string, string>;
  /** Board team names that differ from the sheet's (e.g. "UConn" -> "Connecticut"). */
  names: Record<string, string>;
  slate: { week: number; date: string; away: string; home: string; neutral: boolean }[];
}

// ---- in the browser: a projection for one game ---------------------------------------------------------------------------------------

export interface SpProjection {
  away: string; home: string;
  awayPts: number; homePts: number;
  winAway: number; winHome: number;
  /** Expected margin, away minus home. */
  margin: number;
  total: number;
  /** Middle half of margins, away minus home. */
  marginRange: [number, number];
  overtime: number;
  week: number;
  /** True when the sheet lists this exact game (so its site and home field are the sheet's). */
  onSlate: boolean;
  neutral: boolean;
  sims: number;
  awayRating: TeamRatings; homeRating: TeamRatings;
}

/** The sheet week a game belongs to: the latest week that has started by the game's local date (Central, 6 hours behind UTC). */
export function weekFor(lite: SpLite, dateIso: string): number {
  const local = new Date(Date.parse(dateIso) - 6 * 3600e3).toISOString().slice(0, 10);
  let best = -1;
  for (const [w, start] of Object.entries(lite.weekStarts)) if (start <= local && Number(w) > best) best = Number(w);
  return best < 0 ? lite.latestWeek : Math.min(best, lite.latestWeek);
}

export interface TeamRef { espnId?: string; logoId?: string; name?: string }

/** The sheet's name for a board team: by ESPN id, then logo id, then the plain name. */
export function sheetName(lite: SpLite, t: TeamRef): string | null {
  return (t.espnId && lite.espn[t.espnId]) || (t.logoId && lite.logo[t.logoId]) || (t.name && (lite.names[t.name] ?? (lite.teams[t.name] ? t.name : null))) || null;
}

export function projectGame(lite: SpLite, away: TeamRef, home: TeamRef, dateIso: string, n = 6000): SpProjection | null {
  const aName = sheetName(lite, away), hName = sheetName(lite, home);
  if (!aName || !hName || aName === hName) return null;
  const week = weekFor(lite, dateIso);
  const at = (name: string): TeamRatings | null => {
    const w = lite.teams[name]?.r[String(week)] ?? lite.teams[name]?.r[String(lite.latestWeek)];
    return w ? { name, sp: w[0], off: w[1], def: w[2], st: w[3] } : null;
  };
  const a = at(aName), h = at(hName);
  if (!a || !h) return null;
  const slate = lite.slate.find((g) => g.away === aName && g.home === hName) ?? lite.slate.find((g) => g.away === hName && g.home === aName);
  const neutral = slate?.neutral ?? false;
  const params: SimParams = { ...lite.params, leagueAvgPts: lite.leagueAvg[String(week)] ?? lite.leagueAvg[String(lite.latestWeek)] };
  const venue = neutral ? "neutral" : "b-home"; // A = away team, B = home team
  const s = simulate(params, a, h, venue, { n });
  return {
    away: aName, home: hName, awayPts: s.meanA, homePts: s.meanB, winAway: s.winA, winHome: s.winB, margin: s.meanMargin, total: s.meanTotal,
    marginRange: [s.quantiles.margin.p25, s.quantiles.margin.p75], overtime: s.overtime, week, onSlate: !!slate, neutral, sims: n, awayRating: a, homeRating: h,
  };
}
