/** Build-time only: the national SP+ and NFL+ rank of every team, as one small file (/data/plus-ranks.json) the game cards and ticker read. Imported by vite.config.ts. */
import type { Snapshot } from "./spplus/data/snapshotTypes";
import type { NflData } from "./nfl/types";
import { buildLite } from "./spplus/liteBuild";
import { teamRows } from "./nfl/model";

export interface PlusRanks {
  version: 1;
  cfb: { updated: string; week: number; of: number; byEspn: Record<string, number>; byLogo: Record<string, number>; /** by lower-case school name, for teams that have left the slate (earlier finals) */ byName?: Record<string, number>; /** [offense rank, defense rank] under the same keys */ od?: { byEspn: Record<string, [number, number]>; byLogo: Record<string, [number, number]>; byName: Record<string, [number, number]> } };
  nfl: { updated: string; week: number; of: number; /** by the board's (ESPN) abbreviation */ byAbbr: Record<string, number>; /** [offense rank, defense rank] by abbreviation */ od?: Record<string, [number, number]> };
}

/** nflverse writes LA and WAS where ESPN, and so the board, writes LAR and WSH. */
const ESPN_ABBR: Record<string, string> = { LA: "LAR", WAS: "WSH" };

export function buildPlusRanks(sp: Snapshot, nfl: NflData, boardTeams: Record<string, { espnId: string; name: string; league: string }>): PlusRanks {
  const lite = buildLite(sp, boardTeams);
  const spRank = (name: string) => lite.teams[name]?.spRk || null;
  const byEspn: Record<string, number> = {}, byLogo: Record<string, number> = {};
  for (const [id, name] of Object.entries(lite.espn)) { const r = spRank(name); if (r) byEspn[id] = r; }
  for (const [logoId, name] of Object.entries(lite.logo)) { const r = spRank(name); if (r) byLogo[logoId] = r; }
  const byName: Record<string, number> = {};
  for (const [name, t] of Object.entries(lite.teams)) if (t.spRk) byName[name.toLowerCase()] = t.spRk;
  for (const [board, sheet] of Object.entries(lite.names)) { const r = spRank(sheet); if (r) byName[board.toLowerCase()] = r; }
  // Offense and defense ranks among FBS teams, from the latest week's SP+ ratings (a higher offense number is better; a lower defense number is better).
  const wk = String(lite.latestWeek);
  const rated = Object.entries(lite.teams).filter(([, t]) => t.r[wk]).map(([name, t]) => ({ name, off: t.r[wk][1], def: t.r[wk][2] }));
  const offRk = new Map([...rated].sort((a, b) => b.off - a.off).map((t, i) => [t.name, i + 1]));
  const defRk = new Map([...rated].sort((a, b) => a.def - b.def).map((t, i) => [t.name, i + 1]));
  const odOf = (name: string): [number, number] | null => (offRk.has(name) ? [offRk.get(name)!, defRk.get(name)!] : null);
  const odEspn: Record<string, [number, number]> = {}, odLogo: Record<string, [number, number]> = {}, odName: Record<string, [number, number]> = {};
  for (const [id, name] of Object.entries(lite.espn)) { const v = odOf(name); if (v) odEspn[id] = v; }
  for (const [logoId, name] of Object.entries(lite.logo)) { const v = odOf(name); if (v) odLogo[logoId] = v; }
  for (const name of Object.keys(lite.teams)) { const v = odOf(name); if (v) odName[name.toLowerCase()] = v; }
  for (const [board, sheet] of Object.entries(lite.names)) { const v = odOf(sheet); if (v) odName[board.toLowerCase()] = v; }
  const of = Object.values(lite.teams).filter((t) => t.spRk).length;
  const week = nfl.ratingsThroughWeek;
  const byAbbr: Record<string, number> = {};
  const odNfl: Record<string, [number, number]> = {};
  for (const r of teamRows(nfl, week)) { byAbbr[ESPN_ABBR[r.abbr] ?? r.abbr] = r.rank.sp; odNfl[ESPN_ABBR[r.abbr] ?? r.abbr] = [r.rank.off, r.rank.def]; }
  return {
    version: 1,
    cfb: { updated: lite.fetchedAt, week: lite.latestWeek, of, byEspn, byLogo, byName, od: { byEspn: odEspn, byLogo: odLogo, byName: odName } },
    nfl: { updated: nfl.updatedAt, week, of: Object.keys(byAbbr).length, byAbbr, od: odNfl },
  };
}

/**
 * Each week's pre-game ranks, for the Upset Alert Meter's look back at earlier weeks (fetched only when a past week is chosen):
 * [overall, offense, defense] per team. College is keyed by sheet week and lower-case school name (board and sheet spellings), with the date each
 * sheet week starts; the NFL by week number and abbreviation, with each game's week by ESPN game id.
 */
export interface WeeklyRanks {
  version: 1;
  cfb: { of: number; starts: Record<string, string>; ranks: Record<string, Record<string, [number, number, number]>> };
  nfl: { of: number; ranks: Record<string, Record<string, [number, number, number]>>; weekOf: Record<string, number>; /** each team's current starting quarterback (full name, from nflverse), by abbreviation */ qb: Record<string, string> };
}

export function buildWeeklyRanks(sp: Snapshot, nfl: NflData, boardTeams: Record<string, { espnId: string; name: string; league: string }>): WeeklyRanks {
  const lite = buildLite(sp, boardTeams);
  const aliases = Object.entries(lite.names); // board name -> sheet name
  const cfbRanks: WeeklyRanks["cfb"]["ranks"] = {};
  for (const w of Object.keys(lite.weekStarts)) {
    const rated = Object.entries(lite.teams).filter(([, t]) => t.r[w]).map(([name, t]) => ({ name, sp: t.r[w][0], off: t.r[w][1], def: t.r[w][2] }));
    if (!rated.length) continue;
    const rk = (key: "sp" | "off" | "def", low = false) => new Map([...rated].sort((a, b) => (low ? a[key] - b[key] : b[key] - a[key])).map((t, i) => [t.name, i + 1]));
    const sr = rk("sp"), or = rk("off"), dr = rk("def", true);
    const out: Record<string, [number, number, number]> = {};
    for (const t of rated) out[t.name.toLowerCase()] = [sr.get(t.name)!, or.get(t.name)!, dr.get(t.name)!];
    for (const [board, sheet] of aliases) if (out[sheet.toLowerCase()]) out[board.toLowerCase()] = out[sheet.toLowerCase()];
    cfbRanks[w] = out;
  }
  const nflRanks: WeeklyRanks["nfl"]["ranks"] = {};
  for (let w = 1; w <= nfl.ratingsThroughWeek; w++) {
    const out: Record<string, [number, number, number]> = {};
    for (const r of teamRows(nfl, w)) out[ESPN_ABBR[r.abbr] ?? r.abbr] = [r.rank.sp, r.rank.off, r.rank.def];
    nflRanks[String(w)] = out;
  }
  const weekOf: Record<string, number> = {};
  for (const g of nfl.games) if (g.espn) weekOf[g.espn] = g.week;
  // The quarterback named for each team's latest game, played or about to be played: its current starter.
  const qb: Record<string, string> = {};
  for (const g of [...nfl.games].sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))) {
    if (g.aQB) qb[ESPN_ABBR[g.away] ?? g.away] = g.aQB;
    if (g.hQB) qb[ESPN_ABBR[g.home] ?? g.home] = g.hQB;
  }
  return {
    version: 1,
    cfb: { of: Object.values(lite.teams).filter((t) => t.spRk).length, starts: lite.weekStarts, ranks: cfbRanks },
    nfl: { of: Object.keys(nflRanks[String(nfl.ratingsThroughWeek)] ?? {}).length, ranks: nflRanks, weekOf, qb },
  };
}
