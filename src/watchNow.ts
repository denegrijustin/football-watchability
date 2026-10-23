// What is worth watching right now: which live games are close and late, how hot each live game is, and which few belong in the Watch-now strip.
import { liveStatusParts } from "./liveStatus";

export interface LiveLite { state: "pre" | "in" | "post"; detail: string; away: number; home: number }

/** A one-score game (8 points or fewer) in the 4th quarter or overtime. */
export function closeAndLate(live: LiveLite | undefined): { late: boolean; close: boolean; both: boolean; label: string } {
  if (!live || live.state !== "in") return { late: false, close: false, both: false, label: "" };
  const { period } = liveStatusParts(live.detail);
  const late = period === "Q4" || period === "OT", close = Math.abs(live.away - live.home) <= 8;
  return { late, close, both: late && close, label: late && close ? (period === "OT" ? "One-score game · overtime" : "One-score game · 4th quarter") : "" };
}

/**
 * How worth watching a live game is right now: its forecast watchability, plus a bonus for a close score and one for how late it is. A game that is
 * not live is just its forecast. Capped at 100 so it reads like the card's own number.
 */
export function liveHeat(score: number, live: LiveLite | undefined): number {
  if (!live || live.state !== "in") return score;
  const margin = Math.abs(live.away - live.home), { period } = liveStatusParts(live.detail);
  const close = margin <= 3 ? 12 : margin <= 8 ? 8 : margin <= 16 ? 3 : 0;
  const late = period === "OT" ? 10 : period === "Q4" ? 6 : period === "Q3" ? 2 : 0;
  return Math.min(100, score + close + late * (margin <= 16 ? 1 : 0.4));
}

export interface WatchGame { id: string; espnId: string; date: string; score: number }
export interface Tile<G extends WatchGame> { game: G; kind: "live" | "soon"; heat: number; minutes: number }

/** The strip: the hottest live games first (best 3), then the best games starting within the hour (best 2). */
export function pickWatchNow<G extends WatchGame>(games: G[], map: Record<string, LiveLite | undefined>, now: number, { liveMax = 3, soonMax = 2, soonMs = 3_600_000 } = {}): Tile<G>[] {
  const live: Tile<G>[] = [], soon: Tile<G>[] = [];
  for (const g of games) {
    const l = map[g.espnId];
    if (l?.state === "in") live.push({ game: g, kind: "live", heat: liveHeat(g.score, l), minutes: 0 });
    else if ((!l || l.state === "pre") && Date.parse(g.date) > now && Date.parse(g.date) - now <= soonMs) soon.push({ game: g, kind: "soon", heat: g.score, minutes: Math.max(1, Math.round((Date.parse(g.date) - now) / 60_000)) });
  }
  live.sort((a, b) => b.heat - a.heat || a.game.id.localeCompare(b.game.id));
  soon.sort((a, b) => b.heat - a.heat || a.game.date.localeCompare(b.game.date));
  return [...live.slice(0, liveMax), ...soon.slice(0, soonMax)];
}
