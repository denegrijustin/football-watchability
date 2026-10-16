/**
 * Turns a team's real season numbers (the same ESPN team-statistics feed behind the matchup comparison) into the ratios the engine uses.
 * Every ratio is "this team against the league average", pulled toward 1 while the sample is small: a team five games in is
 * mostly the league average with a lean, not a finished reputation.
 */
import { avgTeam, type Lg, type TeamSim } from "./engine";

export interface RawMetric { id: string; offense: { value: number }; defense: { value: number } }
export interface RawTeam { id: string; name: string; abbreviation: string; gamesPlayed: number; metrics: RawMetric[] }
export interface LeagueStats { season: number; teams: Record<string, RawTeam> }

export interface LeagueAvg { pts: number; pass: number; rush: number; third: number; give: number; n: number }

const val = (t: RawTeam, id: string, side: "offense" | "defense") => t.metrics.find((m) => m.id === id)?.[side].value;

export function leagueAverages(stats: LeagueStats): LeagueAvg {
  const teams = Object.values(stats.teams).filter((t) => t.gamesPlayed > 0);
  const mean = (id: string, side: "offense" | "defense") => {
    const v = teams.map((t) => val(t, id, side)).filter((x): x is number => typeof x === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 1;
  };
  const gp = teams.reduce((a, t) => a + t.gamesPlayed, 0) / Math.max(1, teams.length);
  return {
    pts: mean("scoring", "offense"), pass: mean("passing", "offense"), rush: mean("rushing", "offense"),
    third: mean("thirdDown", "offense"), give: Math.max(0.5, mean("turnovers", "offense") / Math.max(1, gp)), n: teams.length,
  };
}

/** Pull a ratio toward 1 by games played: `c` games of league-average evidence are mixed in. */
export const shrink = (ratio: number, gp: number, c: number) => 1 + (ratio - 1) * (gp / (gp + c));

export interface TeamExtras { short: string; color: string; logo?: string; roster?: TeamSim["roster"] }

export interface BuiltTeam {
  team: TeamSim;
  /** Points scored and allowed per game as ratios against the league average (shrunk). */
  ptsO: number;
  ptsD: number;
  gp: number;
}

export function buildTeam(raw: RawTeam, avg: LeagueAvg, x: TeamExtras): BuiltTeam {
  const gp = Math.max(0, raw.gamesPlayed);
  const r = (id: string, side: "offense" | "defense", lg: number, c: number) => {
    const v = val(raw, id, side);
    return typeof v === "number" && lg > 0 ? shrink(v / lg, gp, c) : 1;
  };
  const per = (id: string, side: "offense" | "defense") => {
    const v = val(raw, id, side);
    return typeof v === "number" && gp > 0 ? v / gp : undefined;
  };
  const rt = (v: number | undefined, lg: number, c: number) => (typeof v === "number" ? shrink(v / lg, gp, c) : 1);
  const team: TeamSim = {
    ...avgTeam(raw.name, raw.abbreviation),
    short: x.short, color: x.color, logo: x.logo, roster: x.roster ?? {},
    passO: r("passing", "offense", avg.pass, 3), passD: r("passing", "defense", avg.pass, 3),
    rushO: r("rushing", "offense", avg.rush, 3), rushD: r("rushing", "defense", avg.rush, 3),
    thirdO: r("thirdDown", "offense", avg.third, 5), thirdD: r("thirdDown", "defense", avg.third, 5),
    giveO: rt(per("turnovers", "offense"), avg.give, 10), takeD: rt(per("turnovers", "defense"), avg.give, 10),
  };
  return { team, ptsO: r("scoring", "offense", avg.pts, 3), ptsD: r("scoring", "defense", avg.pts, 3), gp };
}

export interface Targets {
  away: number;
  home: number;
}

/** Stats-based expected points for each side: league scoring, scaled by the offense's and the opposing defense's ratios, plus home field. */
export function statTargets(lg: Lg, avg: LeagueAvg, a: BuiltTeam, h: BuiltTeam, hfa: number): Targets {
  const base = avg.pts;
  void lg;
  return { away: base * a.ptsO * h.ptsD - hfa / 2, home: base * h.ptsO * a.ptsD + hfa / 2 };
}
