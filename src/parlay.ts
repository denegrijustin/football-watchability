// Parlay math and the recommender. Pure, so tests can import it.
//
// A "leg" is one pick (a side against the spread, or the over or under) with the model's chance that it hits. A parlay needs every leg to hit,
// so its chance is the product of the legs' chances. That product assumes the legs are independent: legs from different games are close enough,
// legs from the same game are linked, so a same-game parlay's number is only approximate.

export type LegKind = "spread" | "total";
export interface Leg {
  id: string;
  league: "CFB" | "NFL";
  /** One id per game, shared by its legs. */
  gameId: string;
  game: string;
  away: string;
  home: string;
  /** When the game kicks off (ISO date, plus the time when known): sortable. */
  when: string;
  kind: LegKind;
  /** "Chicago Bears −3" or "Over 54.5". */
  label: string;
  /** The pick's own side, for a logo (spread legs only). */
  team?: string;
  /** The chance the leg hits, 0 to 1: what picks with this edge have really done (calibration.ts), not the model's own number. */
  cover: number;
  /** The model's own bell-curve chance, for comparison. */
  raw?: number;
  /** What the history behind `cover` says: hit rate, games, the edge bucket and whether it clears break-even. */
  hist?: { pct: number | null; n: number; bucket: string; proof: "proven" | "promising" | "unproven" };
  /** How many points the ratings disagree with the line by. */
  edge: number;
  /** For a spread leg, what a pick card needs: the margin the pick has to win by, whether it is the home side, and the board game to follow live. */
  line?: number;
  pickIsHome?: boolean;
  liveIsHome?: boolean;
  espnId?: string | null;
}

/** The profit on a winning leg at the standard −110 price, per 1 staked. */
export const LEG_PRICE = -110;
const legDecimal = 1 + 100 / 110;
export const BREAK_EVEN = 110 / 210;

export interface Evaluated {
  n: number;
  /** Chance every leg hits, if the legs are independent. */
  p: number;
  /** What the slip pays per 1 staked, including the stake, with every leg at −110. */
  decimal: number;
  american: number;
  /** Expected profit per 1 staked, from the model's chances. */
  ev: number;
  /** The chance every leg hits if each hits at just the break-even rate (52.4%). */
  breakEvenP: number;
}

export function evaluate(legs: Pick<Leg, "cover">[]): Evaluated {
  const n = legs.length;
  const p = legs.reduce((s, l) => s * l.cover, 1);
  const decimal = legDecimal ** n;
  return { n, p, decimal, american: Math.round((decimal - 1) * 100), ev: p * decimal - 1, breakEvenP: BREAK_EVEN ** n };
}

export interface Parlay { id: string; title: string; legs: Leg[]; stats: Evaluated }

/**
 * The best slips from a pool of legs. Only one leg per game (the one with the best chance) so the legs are not linked, and only legs at or above
 * `minCover`. For each size, "Top picks" takes the most likely legs, and "Next best" the following ones, so there is a second slip that shares nothing with the first.
 */
export function recommend(pool: Leg[], { sizes = [2, 3, 4], minCover = 0.55 }: { sizes?: number[]; minCover?: number } = {}): Parlay[] {
  const bestPerGame = new Map<string, Leg>();
  for (const l of pool) if (l.cover >= minCover && (bestPerGame.get(l.gameId)?.cover ?? 0) < l.cover) bestPerGame.set(l.gameId, l);
  const ranked = [...bestPerGame.values()].sort((a, b) => b.cover - a.cover || (b.raw ?? 0) - (a.raw ?? 0) || a.when.localeCompare(b.when));
  const out: Parlay[] = [];
  for (const n of sizes) {
    for (const [k, title] of [[0, "Top picks"], [1, "Next best"]] as const) {
      const legs = ranked.slice(k * n, k * n + n);
      if (legs.length === n) out.push({ id: `${n}-${k}`, title: `${n}-leg · ${title}`, legs, stats: evaluate(legs) });
    }
  }
  return out;
}

export interface GameLegs { gameId: string; game: string; when: string; league: "CFB" | "NFL"; legs: Leg[]; same: Parlay | null }

/** The legs grouped by game, best game first, with a same-game slip of its two legs when both are worth taking. */
export function byGame(pool: Leg[], minCover = 0.5): GameLegs[] {
  const m = new Map<string, GameLegs>();
  for (const l of pool) {
    const g = m.get(l.gameId) ?? { gameId: l.gameId, game: l.game, when: l.when, league: l.league, legs: [], same: null };
    g.legs.push(l);
    m.set(l.gameId, g);
  }
  return [...m.values()].map((g) => {
    g.legs.sort((a, b) => b.cover - a.cover || (b.raw ?? 0) - (a.raw ?? 0));
    const two = g.legs.filter((l) => l.cover >= minCover).slice(0, 2);
    return { ...g, same: two.length === 2 ? { id: `${g.gameId}-sgp`, title: "Same-game slip", legs: two, stats: evaluate(two) } : null };
  }).sort((a, b) => (b.legs[0]?.cover ?? 0) - (a.legs[0]?.cover ?? 0));
}

export const american = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
