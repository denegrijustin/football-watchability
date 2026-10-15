/** Finals from ESPN (src/finals.ts) turned into result rows for the games the sheet has not recorded yet. Used only by the ATS tracker. */
import type { Final } from "../../finals";
import type { GameResult, Model } from "./types";
import { SHEET_TO_BOARD } from "../teamNames";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const dayNum = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
/** The game's local date: Central time, six hours behind UTC, which is how the sheet dates its games. */
const localDate = (iso: string) => new Date(Date.parse(iso) - 6 * 3600e3).toISOString().slice(0, 10);

/**
 * `espn` maps ESPN team ids to the sheet's names (from /data/spplus-lite.json, FBS only). FCS opponents are matched by name
 * against the teams the sheet's own schedule lists for that day.
 */
export function liveResults(model: Model, finals: Final[], espn: Record<string, string>): GameResult[] {
  const cfb = finals.filter((f) => f.l === "cfb");
  if (!cfb.length) return [];
  const sheetNames = new Map<string, string>();
  const add = (n: string) => { sheetNames.set(norm(n), n); };
  for (const t of model.teams) add(t.name);
  for (const p of model.projections) { add(p.away); add(p.home); }
  for (const [sheet, board] of Object.entries(SHEET_TO_BOARD)) { sheetNames.set(norm(board), sheet); }
  const known = (a: string) => {
    const k = norm(a);
    const hit = sheetNames.get(k);
    if (hit) return hit;
    for (const [nk, name] of sheetNames) if (nk.length > 4 && k.length > 4 && (nk.startsWith(`${k} `) || k.startsWith(`${nk} `))) return name;
    return null;
  };
  const nameOf = (side: Final["a"]) => espn[side.id] ?? known(side.n) ?? side.n;
  const have = new Map<string, GameResult[]>();
  for (const r of model.results) have.set(r.team, [...(have.get(r.team) ?? []), r]);
  const recorded = (team: string, opp: string, day: string) =>
    have.get(team)?.some((r) => r.opp === opp && Math.abs(dayNum(r.date) - dayNum(day)) <= 1) ?? false;
  const out: GameResult[] = [];
  for (const f of cfb) {
    const day = localDate(f.date);
    const [an, hn] = [nameOf(f.a), nameOf(f.h)];
    if (recorded(an, hn, day) || recorded(hn, an, day)) continue;
    const row = (team: string, opp: string, pts: number, oppPts: number, s: string): GameResult => ({
      id: `live-${f.id}-${s}`, row: 0, date: day, team, opp, win: pts > oppPts ? 1 : pts < oppPts ? 0 : 0.5, pts, oppPts, margin: pts - oppPts, pgwe: null, adjMgn: null,
    });
    out.push(row(an, hn, f.a.s, f.h.s, "a"), row(hn, an, f.h.s, f.a.s, "h"));
  }
  return out;
}
