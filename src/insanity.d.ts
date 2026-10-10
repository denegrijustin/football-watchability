export type FlowPlay = { id: string; text: string; clock: string };
export type WpPoint = [number, number | null, FlowPlay?];

export type InsanityTier = { id: "calm" | "restless" | "wild" | "unhinged" | "witching"; label: string; min: number };

export type Insanity = {
  /** 0–100 */
  score: number;
  tier: InsanityTier;
  /** Times the favorite changed (win probability crossed 50%, ignoring noise). */
  flips: number;
  /** Largest win-probability move within about a tenth of the game, in points. */
  biggestSwing: number;
  /** Worst moment for the team that ended up ahead, as its win probability (final only). */
  comebackFrom: number | null;
  /** The busiest stretch of the game: indexes into the series, and its period. */
  witching: { from: number; to: number; period: number | null };
  /** Live only: how the last few minutes compare with the game so far. */
  trend: "heating" | "cooling" | "steady" | null;
  parts: { swing: number; flips: number; late: number; comeback: number; overtime: number };
};

export const INSANITY_TIERS: InsanityTier[];
export function insanityTier(score: number): InsanityTier;
export function thinWp(wp: WpPoint[], target?: number): WpPoint[];
export function insanity(series: WpPoint[], opts?: { final?: boolean; overtime?: boolean }): Insanity | null;
