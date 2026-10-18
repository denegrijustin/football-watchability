import { results } from "./data";
import { insanity } from "./insanity";

/** How completed games can be ordered on every tab that lists them. */
export type DoneSort = "watch" | "insanity" | "rank";
export const DONE_SORTS: { id: DoneSort; label: string; note: string }[] = [
  { id: "watch", label: "Watch score", note: "Highest watch score first" },
  { id: "insanity", label: "Most insane", note: "Highest insanity score first" },
  { id: "rank", label: "Highest ranked", note: "Best-ranked team first (ESPN FPI)" },
];

type Keys = { watch: number; insanity: number; rank: number };
let byId: Map<string, Keys> | null = null;

/** Sort keys for a finished game from the archive (higher is better; a game with no data sorts last). */
export function doneKeys(espnId: string | null | undefined): Keys {
  if (!byId) {
    byId = new Map();
    for (const r of results) {
      const ranks = r.teams.map((t) => t.ranks?.overall).filter((n): n is number => typeof n === "number" && n > 0);
      byId.set(r.espnId, {
        watch: r.actual.score,
        insanity: insanity(r.wp, { final: true, overtime: r.final.overtime })?.score ?? -1,
        // the better of the two teams' ranks, with the other team's rank as the tie-break (a lower number is better, so negate)
        rank: ranks.length ? -(Math.min(...ranks) * 1000 + Math.max(...ranks)) : -Infinity,
      });
    }
  }
  return byId.get(espnId ?? "") ?? { watch: -1, insanity: -1, rank: -Infinity };
}

/** Compare two finished games under a sort; ties fall back to the other measures, then to the caller's own order. */
export function compareDone(by: DoneSort, a: string | null | undefined, b: string | null | undefined) {
  const x = doneKeys(a), y = doneKeys(b);
  const order: (keyof Keys)[] = by === "watch" ? ["watch", "insanity"] : by === "rank" ? ["rank", "watch"] : ["insanity", "watch"];
  for (const k of order) if (x[k] !== y[k]) return y[k] - x[k] || 0;
  return 0;
}
