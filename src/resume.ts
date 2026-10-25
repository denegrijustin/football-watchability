// Team resumés: for every team, the best wins, every loss (a loss to a team outside the top of the ratings is flagged BAD), the strength of schedule rank and
// the offense and defense ranks. Built from the same ratings as the SP+ and NFL+ tabs, so it covers every FBS team and every NFL team, not just a top 25.
// Pure, so tests can import it.
import type { Model, Team } from "./spplus/data/types";
import type { NflData } from "./nfl/types";
import { logoSlug, teamRows } from "./nfl/model";

/** A loss counts as BAD when the opponent is ranked worse than this by the ratings (a little more lenient on the road). */
export const BAD_HOME = { CFB: 60, NFL: 22 };
export const BAD_ROAD = { CFB: 75, NFL: 26 };

/** What opens the team's profile: the NFL abbreviation, or the college team's SP+ id. */
export interface Ref { league: "CFB" | "NFL"; name: string; abbr?: string; id?: string }
export type Venue = "vs" | "at" | "N";
export interface ResGame {
  opp: string;
  /** The opponent's logo key (NFL logo id) or team name (college), for the logo lookup. */
  oppKey: string;
  /** The opponent's rank by the ratings, or null when it is not ranked there (an FCS or lower-division school). */
  oppRk: number | null;
  /** "FCS", "D2" ... for a school outside the ranked list. */
  oppDiv: string | null;
  pts: number;
  oppPts: number;
  venue: Venue | null;
  date: string;
  /** The opponent's rating, to order the best wins. */
  oppRating: number;
  bad?: boolean;
  /** Opens the opponent's profile. */
  ref: Ref;
}
export interface Resume {
  key: string;
  name: string;
  /** NFL logo id, or the college team name. */
  logoKey: string;
  conf: string | null;
  w: number; l: number; t: number;
  /** Rank by the ratings, 1 = best. */
  rank: number;
  /** Strength of schedule rank: 1 = the toughest schedule so far (null before a game is played). */
  sos: number | null;
  off: number | null;
  def: number | null;
  of: number;
  ref: Ref;
  wins: ResGame[];
  losses: ResGame[];
}

const BEST = 3;

/** 1 = the highest value. Ties share the order they came in. */
function rankDesc(rows: { key: string; v: number }[]) {
  const m = new Map<string, number>();
  [...rows].sort((a, b) => b.v - a.v).forEach((r, i) => m.set(r.key, i + 1));
  return m;
}

function finish(list: Omit<Resume, "sos" | "wins" | "losses">[], games: Map<string, ResGame[]>, lg: "CFB" | "NFL"): Resume[] {
  const sosVal = new Map<string, number>();
  for (const r of list) {
    const g = games.get(r.key) ?? [];
    if (g.length) sosVal.set(r.key, g.reduce((s, x) => s + x.oppRating, 0) / g.length);
  }
  const sos = rankDesc([...sosVal].map(([key, v]) => ({ key, v })));
  return list.map((r) => {
    const g = games.get(r.key) ?? [];
    const wins = g.filter((x) => x.pts > x.oppPts).sort((a, b) => b.oppRating - a.oppRating).slice(0, BEST);
    const losses = g.filter((x) => x.pts < x.oppPts).map((x) => {
      const limit = (x.venue === "at" ? BAD_ROAD : BAD_HOME)[lg];
      return { ...x, bad: x.oppRk == null || x.oppRk > limit };
    }).sort((a, b) => a.date.localeCompare(b.date));
    return { ...r, sos: sos.get(r.key) ?? null, wins, losses };
  }).sort((a, b) => a.rank - b.rank);
}

// ---- college ---------------------------------------------------------------------------------------------------------------------------

const rating = (t: Team | undefined, week: number): number => t?.top[week]?.sp ?? t?.weeks[t.latest]?.sp ?? -30;

export function cfbResumes(model: Model): Resume[] {
  const week = model.latest;
  const fbs = model.teams.filter((t) => t.division === "FBS" && t.weeks[t.latest]);
  const pick = (name: string): Team | undefined => { const c = model.byName.get(name); return c?.find((t) => t.division === "FBS") ?? c?.[0]; };
  // Home, away or neutral from the weekly projections ("A at B", "A vs. B").
  const venue = new Map<string, Venue>();
  for (const p of model.projections) {
    if (!p.home || !p.away) continue;
    venue.set(`${p.away}|${p.home}`, p.neutral ? "N" : "at");
    venue.set(`${p.home}|${p.away}`, p.neutral ? "N" : "vs");
  }
  const all = [...model.results, ...(model.liveResults ?? [])];
  const seen = new Set<string>();
  const games = new Map<string, ResGame[]>();
  const rec = new Map<string, { w: number; l: number; t: number }>();
  for (const r of all) {
    if (r.pts == null || r.oppPts == null) continue;
    const id = `${r.date}|${r.team}|${r.opp}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const me = pick(r.team), opp = pick(r.opp);
    if (!me || me.division !== "FBS") continue;
    const key = me.id;
    const rk = opp?.division === "FBS" ? opp.weeks[opp.latest]?.spRk ?? null : null;
    const g: ResGame = { opp: r.opp, oppKey: r.opp, oppRk: rk, oppDiv: opp && opp.division !== "FBS" ? opp.division : opp ? null : "FCS", pts: r.pts, oppPts: r.oppPts, venue: venue.get(`${r.team}|${r.opp}`) ?? null, date: r.date, oppRating: rating(opp, week), ref: { league: "CFB", name: r.opp, id: opp?.id } };
    (games.get(key) ?? games.set(key, []).get(key)!).push(g);
    const c = rec.get(key) ?? rec.set(key, { w: 0, l: 0, t: 0 }).get(key)!;
    if (r.pts > r.oppPts) c.w++; else if (r.pts < r.oppPts) c.l++; else c.t++;
  }
  const list = fbs.map((t) => {
    const w = t.weeks[t.latest], c = rec.get(t.id) ?? { w: 0, l: 0, t: 0 };
    return { key: t.id, name: t.name, logoKey: t.name, conf: w.conf, ...c, rank: w.spRk ?? 999, off: w.offRk, def: w.defRk, of: fbs.length, ref: { league: "CFB" as const, name: t.name, id: t.id } };
  });
  return finish(list, games, "CFB");
}

// ---- NFL -------------------------------------------------------------------------------------------------------------------------------

export function nflResumes(d: NflData): Resume[] {
  const week = Math.min(d.lastPlayedWeek + 1, d.ratingsThroughWeek);
  const rows = teamRows(d, week);
  const byAbbr = new Map(rows.map((r) => [r.abbr, r]));
  const games = new Map<string, ResGame[]>();
  for (const g of d.games) {
    if (g.type !== "REG" || g.aS == null || g.hS == null) continue;
    for (const side of ["away", "home"] as const) {
      const me = g[side], oppAbbr = side === "away" ? g.home : g.away;
      const o = byAbbr.get(oppAbbr);
      if (!byAbbr.has(me) || !o) continue;
      const g2: ResGame = { opp: o.name, oppKey: logoSlug(o.name), oppRk: o.rank.sp, oppDiv: null, pts: side === "away" ? g.aS : g.hS, oppPts: side === "away" ? g.hS : g.aS, venue: g.neutral ? "N" : side === "home" ? "vs" : "at", date: g.date, oppRating: o.r[0], ref: { league: "NFL", name: o.name, abbr: oppAbbr } };
      (games.get(me) ?? games.set(me, []).get(me)!).push(g2);
    }
  }
  const list = rows.map((r) => ({ key: r.abbr, name: r.name, logoKey: logoSlug(r.name), conf: `${r.conf} ${r.div}`.trim(), w: r.rec.w, l: r.rec.l, t: r.rec.t, rank: r.rank.sp, off: r.rank.off, def: r.rank.def, of: rows.length, ref: { league: "NFL" as const, name: r.name, abbr: r.abbr } }));
  return finish(list, games, "NFL");
}
