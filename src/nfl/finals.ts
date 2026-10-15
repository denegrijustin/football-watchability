/** Scores from ESPN (src/finals.ts) for NFL games nflverse has not published a result for yet. */
import type { Final } from "../finals";
import type { NflData, NflGame } from "./types";

/** The same data with aS, hS and ot filled in where a game has ended and nflverse has no score yet. Returns the original when nothing changes. */
export function withNflFinals(data: NflData, finals: Final[]): NflData {
  const byEspn = new Map(finals.filter((f) => f.l === "nfl").map((f) => [f.id, f]));
  if (!byEspn.size) return data;
  let changed = false;
  const games = data.games.map((g): NflGame => {
    if (g.aS != null && g.hS != null) return g;
    const f = g.espn ? byEspn.get(g.espn) : undefined;
    if (!f) return g;
    changed = true;
    return { ...g, aS: f.a.s, hS: f.h.s, ot: g.ot || f.ot };
  });
  return changed ? { ...data, games } : data;
}
