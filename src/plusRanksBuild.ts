/** Build-time only: the national SP+ and NFL+ rank of every team, as one small file (/data/plus-ranks.json) the game cards and ticker read. Imported by vite.config.ts. */
import type { Snapshot } from "./spplus/data/snapshotTypes";
import type { NflData } from "./nfl/types";
import { buildLite } from "./spplus/liteBuild";
import { teamRows } from "./nfl/model";

export interface PlusRanks {
  version: 1;
  cfb: { updated: string; week: number; of: number; byEspn: Record<string, number>; byLogo: Record<string, number>; /** by lower-case school name, for teams that have left the slate (earlier finals) */ byName?: Record<string, number> };
  nfl: { updated: string; week: number; of: number; /** by the board's (ESPN) abbreviation */ byAbbr: Record<string, number> };
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
  const of = Object.values(lite.teams).filter((t) => t.spRk).length;
  const week = nfl.ratingsThroughWeek;
  const byAbbr: Record<string, number> = {};
  for (const r of teamRows(nfl, week)) byAbbr[ESPN_ABBR[r.abbr] ?? r.abbr] = r.rank.sp;
  return {
    version: 1,
    cfb: { updated: lite.fetchedAt, week: lite.latestWeek, of, byEspn, byLogo, byName },
    nfl: { updated: nfl.updatedAt, week, of: Object.keys(byAbbr).length, byAbbr },
  };
}
