import type { GameResult, Model, Projection } from "./types";

export interface GameIndex {
  byTeam: Map<string, GameResult[]>;
  /** Derived: the pre-game projection row for a result (same two teams, dates within a day). */
  projFor(r: GameResult): Projection | undefined;
  /** Derived: both teams' result rows for a projection (team first = projected winner). */
  resultFor(p: Projection): { winner: GameResult; loser: GameResult | undefined } | undefined;
}

const cache = new WeakMap<Model, GameIndex>();
const dayNum = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function gameIndex(model: Model): GameIndex {
  const hit = cache.get(model);
  if (hit) return hit;
  const byTeam = new Map<string, GameResult[]>();
  const byPair = new Map<string, GameResult[]>();
  for (const r of model.results) {
    byTeam.set(r.team, [...(byTeam.get(r.team) ?? []), r]);
    const k = pairKey(r.team, r.opp);
    byPair.set(k, [...(byPair.get(k) ?? []), r]);
  }
  for (const list of byTeam.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  const projByPair = new Map<string, Projection[]>();
  for (const p of model.projections) { const k = pairKey(p.away, p.home); projByPair.set(k, [...(projByPair.get(k) ?? []), p]); }
  const idx: GameIndex = {
    byTeam,
    projFor(r) {
      return projByPair.get(pairKey(r.team, r.opp))?.find((p) => p.date != null && Math.abs(dayNum(p.date) - dayNum(r.date)) <= 1);
    },
    resultFor(p) {
      if (!p.date || !p.projWinner) return undefined;
      const rows = (byPair.get(pairKey(p.away, p.home)) ?? []).filter((r) => Math.abs(dayNum(r.date) - dayNum(p.date!)) <= 1);
      const winner = rows.find((r) => r.team === p.projWinner);
      if (!winner) return undefined;
      return { winner, loser: rows.find((r) => r.team !== p.projWinner) };
    },
  };
  cache.set(model, idx);
  return idx;
}

/** Derived: how far the final margin landed from the projected margin, from the projected winner's side (positive = winner did better than projected). */
export function projectionMiss(p: Projection, winnerRow: GameResult | undefined): number | null {
  if (!winnerRow || winnerRow.margin == null || p.projMargin == null) return null;
  return Math.round((winnerRow.margin - p.projMargin) * 10) / 10;
}
