/** Against-the-spread tracking for the SP+ picks, graded game by game from the sheet's lines and the postgame results. */
import type { GameResult, Model, Projection } from "./types";
import { gameIndex } from "./games";

export type AtsResult = "win" | "loss" | "push";
export type AtsGroup = "fbs" | "fcs";

export interface AtsGame {
  id: string;
  week: number;
  date: string;
  game: string;
  away: string;
  home: string;
  neutral: boolean;
  /** The side SP+ picked against the early-week spread (the sheet's "ATS Pick"). */
  pick: string;
  spread: string;
  /** Points the favorite lays. */
  spreadPts: number;
  pickIsFavorite: boolean;
  /** SP+ projected margin for the pick minus the line it needs to beat: how much the pick is "worth" (the sheet's Spread diff). */
  edge: number | null;
  /** The pick's actual margin. */
  margin: number;
  /** Margin minus the line, from the pick's side: positive = covered. */
  coverBy: number;
  result: AtsResult;
  final: string;
  group: AtsGroup;
  src: { sheet: string; row: number };
}

export interface AtsRecord { w: number; l: number; p: number; n: number; pct: number | null }
export const emptyRecord = (): AtsRecord => ({ w: 0, l: 0, p: 0, n: 0, pct: null });
export function tally(games: { result: AtsResult }[]): AtsRecord {
  const r = emptyRecord();
  for (const g of games) { r.n++; if (g.result === "win") r.w++; else if (g.result === "loss") r.l++; else r.p++; }
  r.pct = r.w + r.l > 0 ? r.w / (r.w + r.l) : null;
  return r;
}
export const recordText = (r: AtsRecord) => `${r.w}-${r.l}${r.p ? `-${r.p}` : ""}`;
/** Break-even win rate at standard -110 pricing. */
export const BREAK_EVEN = 110 / 210;

const day = (iso: string) => Date.parse(iso) / 864e5;

function resultRow(model: Model, p: Projection, pick: string): GameResult | undefined {
  if (!p.date) return undefined;
  const idx = gameIndex(model);
  const other = pick === p.home ? p.away : p.home;
  const ok = (r: GameResult) => Math.abs(day(r.date) - day(p.date!)) <= 1;
  return idx.byTeam.get(pick)?.find((r) => r.opp === other && ok(r)) ?? undefined;
}

/** Every pick on the sheet that has a line, a pick and a final, graded against the spread. */
export function atsGames(model: Model): AtsGame[] {
  const idx = gameIndex(model);
  const out: AtsGame[] = [];
  for (const p of model.projections) {
    if (!p.date || !p.atsPick || p.spreadPts == null || !p.spread) continue;
    if (p.atsPick !== p.away && p.atsPick !== p.home) continue;
    let margin: number | null = null, final = "";
    const own = resultRow(model, p, p.atsPick);
    if (own && own.margin != null) { margin = own.margin; final = `${p.atsPick} ${own.pts}, ${own.opp} ${own.oppPts}`; }
    else {
      const other = p.atsPick === p.home ? p.away : p.home;
      const r = idx.byTeam.get(other)?.find((x) => x.opp === p.atsPick && Math.abs(day(x.date) - day(p.date!)) <= 1);
      if (r && r.margin != null) { margin = -r.margin; final = `${p.atsPick} ${r.oppPts}, ${r.team} ${r.pts}`; }
    }
    if (margin == null) continue;
    const isFav = p.spreadTeam === p.atsPick;
    const line = p.spreadPts === 0 ? 0 : isFav ? p.spreadPts : -p.spreadPts;
    const coverBy = margin - line;
    const bothFbs = model.byId.has(`FBS:${p.away}`) && model.byId.has(`FBS:${p.home}`);
    out.push({
      id: p.id, week: p.week, date: p.date, game: p.game, away: p.away, home: p.home, neutral: p.neutral, pick: p.atsPick, spread: p.spread, spreadPts: p.spreadPts,
      pickIsFavorite: isFav, edge: p.spreadDiff, margin, coverBy: Math.round(coverBy * 10) / 10, result: coverBy > 0 ? "win" : coverBy < 0 ? "loss" : "push", final,
      group: bothFbs ? "fbs" : "fcs", src: { sheet: `FBS Week ${p.week}`, row: p.row },
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.game.localeCompare(b.game));
}

export interface WeekLine { week: number; label: string; rec: AtsRecord; cumulative: AtsRecord; avgCoverBy: number | null }

export function weeklyTracker(games: AtsGame[], weeks: number[]): WeekLine[] {
  const out: WeekLine[] = [];
  const running: AtsGame[] = [];
  for (const w of weeks) {
    const g = games.filter((x) => x.week === w);
    if (!g.length) continue;
    running.push(...g);
    out.push({ week: w, label: `Wk ${w}`, rec: tally(g), cumulative: tally(running), avgCoverBy: g.reduce((s, x) => s + x.coverBy, 0) / g.length });
  }
  return out;
}

export const EDGE_BUCKETS: { lo: number; hi: number; label: string }[] = [
  { lo: 0, hi: 2, label: "Under 2" }, { lo: 2, hi: 4, label: "2 to 4" }, { lo: 4, hi: 7, label: "4 to 7" }, { lo: 7, hi: Infinity, label: "7 or more" },
];
export const byEdge = (games: AtsGame[]) => EDGE_BUCKETS.map((b) => ({ ...b, rec: tally(games.filter((g) => g.edge != null && g.edge >= b.lo && g.edge < b.hi)) }));
