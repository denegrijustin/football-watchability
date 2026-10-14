/** Build-time only: derives the Game Center's small file from the full SP+ snapshot. Imported by vite.config.ts. */
import type { Snapshot } from "./data/snapshotTypes";
import { buildModel } from "./data/model";
import { leagueAvgPts, paramsFor } from "./sim/calibrate";
import type { SpLite } from "./lite";
import { ESPN_EXTRA, SHEET_TO_BOARD } from "./teamNames";

export function buildLite(snap: Snapshot, boardTeams: Record<string, { espnId: string; name: string; league: string }>): SpLite {
  const model = buildModel(snap);
  const par = paramsFor(model, model.latest);
  const { leagueAvgPts: _drop, ...params } = par;
  void _drop;
  const teams: SpLite["teams"] = {};
  for (const t of model.teams) {
    if (t.division !== "FBS") continue;
    const r: Record<string, [number, number, number, number]> = {};
    for (const [w, tw] of Object.entries(t.weeks)) if (tw.sp != null && tw.off != null && tw.def != null) r[w] = [tw.sp, tw.off, tw.def, tw.st ?? 0];
    teams[t.name] = { conf: t.weeks[t.latest]?.conf ?? "", spRk: t.weeks[t.latest]?.spRk ?? 0, r };
  }
  const byName = new Map(Object.values(boardTeams).filter((t) => t.league === "CFB").map((t) => [t.name.toLowerCase(), t.espnId]));
  const espn: Record<string, string> = {};
  const logo: Record<string, string> = {};
  for (const name of Object.keys(teams)) {
    const id = byName.get((SHEET_TO_BOARD[name] ?? name).toLowerCase()) ?? ESPN_EXTRA[name];
    if (id) espn[id] = name;
  }
  for (const [logoId, t] of Object.entries(boardTeams)) if (t.league === "CFB" && espn[t.espnId]) logo[logoId] = espn[t.espnId];
  const weekStarts: Record<string, string> = {};
  for (const p of model.projections) if (p.date && (!weekStarts[p.week] || p.date < weekStarts[p.week])) weekStarts[p.week] = p.date;
  return {
    version: 1, fetchedAt: snap.fetchedAt, sheet: snap.source.title, latestWeek: model.latest, params,
    leagueAvg: Object.fromEntries(model.weeks.map((w) => [w, Math.round(leagueAvgPts(model, w) * 1000) / 1000])),
    weekStarts, teams, espn, logo,
    names: Object.fromEntries(Object.entries(SHEET_TO_BOARD).filter(([sheet]) => teams[sheet]).map(([sheet, board]) => [board, sheet])),
    slate: model.projections.filter((p) => p.date).map((p) => ({ week: p.week, date: p.date as string, away: p.away, home: p.home, neutral: p.neutral })),
  };
}

