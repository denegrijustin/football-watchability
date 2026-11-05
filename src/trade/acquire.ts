import { DEPTH, STARTERS, pickPoints } from "../../scripts/trade/lib.mjs";
import { tradeValue, type League, type Player, type TradeSide } from "./engine";

/**
 * The other way round: a club spends its own draft picks to get a player from another club ("the Chiefs give a 2nd-round pick for a receiver").
 * Pure, so the page and the tests share it.
 */

/** One of a club's picks. `overall` is where it is projected to fall in the draft, from the standings; `value` is that slot on the draft chart. */
export type Capital = { round: number; overall: number; label: string; value: number };
export type Buy = {
  player: Player;
  /** The picks it would cost, the fewest that cover his value. */
  price: Capital[];
  value: number; priceValue: number;
  buyer: TradeSide; seller: TradeSide;
  /** 0-100: how likely the clubs would do it. */
  realism: number;
  /** How much of a starter's job he would take: rating over the buyer's weakest starter at his position. */
  upgrade: number;
  reasons: string[]; warnings: string[];
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const ROUND = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

/** The standings' abbreviations are not always the trade data's. */
const ABBR: Record<string, string> = { LAR: "LA", WSH: "WAS" };

/** Each club's projected spot in the draft, 1 (picks first: the worst record) to 32, from wins and points scored over points allowed. */
export function projectedOrder(rows: { abbr: string; pct: number; diff: number }[]): Record<string, number> {
  const sorted = [...rows].sort((a, b) => a.pct - b.pct || a.diff - b.diff || a.abbr.localeCompare(b.abbr));
  return Object.fromEntries(sorted.map((r, i) => [ABBR[r.abbr] ?? r.abbr, i + 1]));
}

/** A club's picks, one for each of the seven rounds, at the spot its record projects. Trades of picks already made are not in the data, so these are its own. */
export function draftCapital(team: string, order: Record<string, number>): Capital[] {
  const slot = order[team] ?? 16;
  return ROUND.map((name, i) => {
    const overall = i * 32 + slot;
    return { round: i + 1, overall, label: `${name}-round pick (about #${overall})`, value: pickPoints(overall) };
  });
}

/** The fewest picks, at most three and from different rounds, whose value covers `value` without paying much more than it. */
export function priceInPicks(value: number, capital: Capital[]): Capital[] | null {
  let best: { picks: Capital[]; cost: number } | null = null;
  const n = capital.length;
  const consider = (picks: Capital[]) => {
    const sum = picks.reduce((a, p) => a + p.value, 0);
    if (sum < value * 0.9 || sum > value * 1.3 + 15) return;
    const cost = (sum - value) / Math.max(value, 1) + 0.08 * (picks.length - 1);
    if (!best || cost < best.cost) best = { picks, cost };
  };
  for (let i = 0; i < n; i++) {
    consider([capital[i]]);
    for (let j = i + 1; j < n; j++) {
      consider([capital[i], capital[j]]);
      for (let k = j + 1; k < n; k++) consider([capital[i], capital[j], capital[k]]);
    }
  }
  return best ? (best as { picks: Capital[] }).picks : null;
}

const starters = (g: string) => (STARTERS as Record<string, number>)[g] ?? 1;

/** What the buyer's weakest starter at a group is, or short if it does not have enough. */
function weakestStarter(roster: Player[], group: string): { rating: number; short: boolean } {
  const live = roster.filter((p) => p.group === group && p.status !== "R").sort((a, b) => b.rating - a.rating);
  return live.length < starters(group) ? { rating: 0, short: true } : { rating: live[starters(group) - 1].rating, short: false };
}

export type Acquire = { buys: Buy[]; unaffordable: number; capBlocked: number; noNeed: number };

/**
 * Every player on another club the buyer could pay for in picks: he would help (start, or fill a short spot), its own picks cover his price, the
 * salary fits its cap, and the other club could part with him. Most realistic first.
 */
export function acquirable(league: League, team: string, capital: Capital[], opts: { group?: string } = {}): Acquire {
  const A = league.byTeam.get(team) ?? [];
  const aSpace = league.space[team] ?? 0;
  const out: Buy[] = [];
  let unaffordable = 0, capBlocked = 0, noNeed = 0;
  for (const [other, roster] of league.byTeam) {
    if (other === team) continue;
    const bSpace = league.space[other] ?? 0;
    for (const p of roster) {
      if (p.status !== "A" || p.rating < 55 || (opts.group && p.group !== opts.group)) continue;
      const weak = weakestStarter(A, p.group);
      const depthShort = A.filter((y) => y.group === p.group && y.status !== "R").length < ((DEPTH as Record<string, number>)[p.group] ?? 3);
      const upgrade = weak.short ? 12 : p.rating - weak.rating >= 3 ? p.rating - weak.rating : depthShort && p.rating >= 50 ? 3 : 0;
      if (upgrade < 3) { noNeed++; continue; }
      const value = tradeValue(p);
      const price = priceInPicks(value, capital);
      if (!price) { unaffordable++; continue; }
      const aAfter = aSpace - p.apy;
      if (aAfter < 0) { capBlocked++; continue; }
      const priceValue = price.reduce((a, c) => a + c.value, 0);
      // The seller: could it part with him without a hole at his position?
      const left = roster.filter((y) => y.group === p.group && y.id !== p.id && y.status !== "R").sort((a, b) => b.rating - a.rating);
      const nextBest = left[starters(p.group) - 1]?.rating ?? 0;
      const hole = Math.max(0, nextBest ? p.rating - nextBest - 8 : p.rating - 55);
      const franchise = p.rating >= 92 && p.age <= 29 && p.years >= 3;
      const fairness = Math.max(0, 1 - Math.abs(priceValue - value) / Math.max(value, 1));
      const needFit = Math.min(1, upgrade / 12);
      const capHealth = Math.min(1, aAfter / 12 + 0.5);
      const sellerOk = hole > 6 ? 0.2 : 1;
      const realism = Math.round(100 * (0.3 * needFit + 0.25 * fairness + 0.15 * capHealth + 0.3 * sellerOk) - (franchise ? 18 : 0) - (price.length > 2 ? 8 : 0) - (p.age >= 31 ? 5 : 0));
      const reasons = [
        weak.short ? `${team} is short at ${p.group}` : `${p.name} (${p.rating}) would start for ${team}, ahead of a ${weak.rating}`,
        `${team} pays ${price.map((c) => c.label).join(" + ")}, worth ${priceValue} points on the draft chart against his ${value}`,
        `${team} takes on ${r1(p.apy)}M, so its cap room goes ${r1(aSpace)}M to ${r1(aAfter)}M`,
      ];
      const warnings: string[] = [];
      if (hole > 6) warnings.push(`${other} would be thin at ${p.group} without him (next best is ${nextBest || "none"}): it would ask for more or say no`);
      if (franchise) warnings.push("a franchise-level player: a club rarely shops one");
      if (p.age >= 31 && p.group !== "QB") warnings.push("an older player: he costs less because his best years are behind him");
      if (p.years <= 1) warnings.push("his contract ends after this season (a rental)");
      if (league.spaceAssumed[team] || league.spaceAssumed[other]) warnings.push("cap room is an assumption, not an official figure");
      out.push({
        player: p, price, value, priceValue, upgrade, reasons, warnings,
        buyer: { before: r1(aSpace), after: r1(aAfter), change: r1(-p.apy), ok: true },
        seller: { before: r1(bSpace), after: r1(bSpace + p.apy), change: r1(p.apy), ok: true },
        realism: Math.max(1, Math.min(99, realism)),
      });
    }
  }
  out.sort((a, b) => b.realism - a.realism || b.player.rating - a.player.rating || a.player.name.localeCompare(b.player.name));
  return { buys: out, unaffordable, capBlocked, noNeed };
}
