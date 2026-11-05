import { DEPTH, STARTERS, pickPoints } from "../../scripts/trade/lib.mjs";
import { NFL_NAMES } from "./teams";
import { GROUP_NAME, ordinal, poss, teamNeeds } from "./needs";
export { GROUP_NAME, ordinal, poss, teamNeeds } from "./needs";
export type { Need, NeedLevel } from "./needs";
import { tradeValue, type League, type Player, type TradeSide } from "./engine";

/**
 * The other way round: a club spends its own draft picks to get a player from another club ("the Chiefs give a 2nd-round pick for a receiver").
 * Pure, so the page and the tests share it.
 */

/** One of a club's picks. `overall` is where it is projected to fall in the draft, from the standings; `value` is that slot on the draft chart. */
export type Capital = { round: number; overall: number; label: string; value: number; /** The club the pick originally belonged to: its record sets the slot. */ from: string; id: string };
/** Who owns which picks in the next draft (src/data/draft-picks.json). */
export type DraftPicks = { season: number; asOf: string; byTeam: Record<string, { round: number; from: string }[]>; conditional: { round: number; from: string; to: string }[] };
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
  /** A short paragraph on why the trade works: the buyer's need, the price, the cap and why the seller would do it. */
  narrative: string;
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

/**
 * A club's picks in the next draft: the ones it owns now (its own, plus any it got in trades, minus any it traded away), each at the spot of the club it
 * came from. With no ownership data it is its own seven.
 */
export function draftCapital(team: string, order: Record<string, number>, owned?: { round: number; from: string }[]): Capital[] {
  const picks = owned ?? ROUND.map((_, i) => ({ round: i + 1, from: team }));
  return picks.map(({ round, from }) => {
    const overall = (round - 1) * 32 + (order[from] ?? 16);
    const origin = from === team ? "" : ` from ${NFL_NAMES[from] ?? from}`;
    return { round, from, id: `${from}-${round}`, overall, label: `${ROUND[round - 1]}-round pick${origin} (about #${overall})`, value: pickPoints(overall) };
  });
}

/** The fewest picks, at most three, whose value covers `value` without paying much more than it. */
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

export type Rejected = { player: Player; kind: "need" | "price" | "cap" | "seller"; why: string };
export type Acquire = { buys: Buy[]; rejected: Rejected[]; unaffordable: number; capBlocked: number; noNeed: number; sellerNo: number };

const money = (m: number) => `${r1(m)}M`;
const name = (t: string) => NFL_NAMES[t] ?? t;
const picksText = (picks: Capital[]) => picks.map((c) => `a ${c.label.replace(/ \(about.*/, "")}`).join(" and ");

/**
 * Every player on another club the buyer could pay for in picks: he would help (start, or fill a short spot), its own picks cover his price, the
 * salary fits its cap, and the other club could part with him. Most realistic first, and every player who fails one of those, with the reason.
 */
export function acquirable(league: League, team: string, capital: Capital[], opts: { group?: string } = {}): Acquire {
  const A = league.byTeam.get(team) ?? [];
  const aSpace = league.space[team] ?? 0;
  const needs = teamNeeds(league).get(team) ?? [];
  const out: Buy[] = [], rejected: Rejected[] = [];
  let unaffordable = 0, capBlocked = 0, noNeed = 0, sellerNo = 0;
  const bestCover = capital.reduce((a, c) => a + c.value, 0);
  const club = name(team);
  for (const [other, roster] of league.byTeam) {
    if (other === team) continue;
    const bSpace = league.space[other] ?? 0;
    for (const p of roster) {
      if (p.status !== "A" || p.rating < 55 || (opts.group && p.group !== opts.group)) continue;
      const need = needs.find((n) => n.group === p.group)!;
      const noun = GROUP_NAME[p.group] ?? p.group;
      const weak = weakestStarter(A, p.group);
      const depthShort = A.filter((y) => y.group === p.group && y.status !== "R").length < ((DEPTH as Record<string, number>)[p.group] ?? 3);
      const upgrade = weak.short ? 12 : p.rating - weak.rating >= 3 ? p.rating - weak.rating : depthShort && p.rating >= 50 ? 3 : 0;
      if (upgrade < 3) {
        noNeed++;
        if (p.rating >= 62) rejected.push({ player: p, kind: "need", why: `${p.name} (${p.rating}) would not start for ${club}: its ${noun} are ${need.starters.join(", ")} (${ordinal(need.rank)} best of 32), so he would be a backup at ${money(p.apy)} a year, and it has no reason to spend a pick on that.` });
        continue;
      }
      const value = tradeValue(p);
      const price = priceInPicks(value, capital);
      if (!price) {
        unaffordable++;
        rejected.push({ player: p, kind: "price", why: `${p.name} is worth about ${value} points on the draft chart, and all seven of ${poss(club)} picks together are worth ${bestCover}. ${bestCover < value * 0.9 ? "It could not pay for him even by emptying its draft." : "No combination of three picks lands close to his price without a big overpay."}` });
        continue;
      }
      const aAfter = aSpace - p.apy;
      if (aAfter < 0) {
        capBlocked++;
        rejected.push({ player: p, kind: "cap", why: `${club} has ${money(aSpace)} of cap room and ${p.name} costs ${money(p.apy)} a year, so a trade for picks alone does not fit. It would have to send salary back, which this view does not do.` });
        continue;
      }
      const priceValue = price.reduce((a, c) => a + c.value, 0);
      // The seller: could it part with him without a hole at his position?
      const left = roster.filter((y) => y.group === p.group && y.id !== p.id && y.status !== "R").sort((a, b) => b.rating - a.rating);
      const nextBest = left[starters(p.group) - 1]?.rating ?? 0;
      const hole = Math.max(0, nextBest ? p.rating - nextBest - 8 : p.rating - 55);
      const franchise = p.rating >= 92 && p.age <= 29 && p.years >= 3;
      if (franchise || hole > 12) {
        sellerNo++;
        rejected.push({ player: p, kind: "seller", why: franchise ? `${name(other)} would not sell ${p.name}: at ${p.rating} and ${p.age} with ${p.years} years left he is a franchise player, and clubs rarely shop one for ${picksText(price)}.` : `${name(other)} would be left thin at ${noun} without ${p.name} (its next best is ${nextBest || "nobody"}), so it would say no to ${picksText(price)}.` });
        continue;
      }
      const fairness = Math.max(0, 1 - Math.abs(priceValue - value) / Math.max(value, 1));
      const needFit = Math.min(1, upgrade / 12);
      const capHealth = Math.min(1, aAfter / 12 + 0.5);
      const sellerOk = hole > 6 ? 0.2 : 1;
      const realism = Math.round(100 * (0.3 * needFit + 0.25 * fairness + 0.15 * capHealth + 0.3 * sellerOk) - (price.length > 2 ? 8 : 0) - (p.age >= 31 ? 5 : 0));
      const reasons = [
        weak.short ? `${club} is short at ${p.group}` : `${p.name} (${p.rating}) would start for ${club}, ahead of a ${weak.rating}`,
        `${club} pays ${price.map((c) => c.label).join(" + ")}, worth ${priceValue} points on the draft chart against his ${value}`,
        `${club} takes on ${money(p.apy)}, so its cap room goes ${money(aSpace)} to ${money(aAfter)}`,
      ];
      const warnings: string[] = [];
      if (hole > 6) warnings.push(`${name(other)} would be thin at ${p.group} without him (next best is ${nextBest || "none"}): it would want more or might say no`);
      if (p.age >= 31 && p.group !== "QB") warnings.push("an older player: he costs less because his best years are behind him");
      if (p.years <= 1) warnings.push("his contract ends after this season (a rental)");
      if (league.spaceAssumed[team] || league.spaceAssumed[other]) warnings.push("cap room is an assumption, not an official figure");
      const need1 = need.short ? `${club} cannot even fill its ${noun} spots` : `${poss(club)} ${noun} rank ${ordinal(need.rank)} of 32 (starters ${need.starters.join(", ")}; the league average is ${need.leagueAvg})`;
      const role = weak.short ? `${p.name} would fill an empty spot` : `${p.name} (${p.rating}) would start ahead of a ${weak.rating}, a ${upgrade}-point upgrade`;
      const sellerLine = left.length > starters(p.group) || (nextBest && p.rating - nextBest <= 8) ? `${name(other)} can part with him: its next best ${p.group} is ${nextBest || "an empty spot"}.` : `${name(other)} has ${p.group} depth to cover for him.`;
      const narrative = `${need1}. ${role}. ${picksText(price)} ${price.length > 1 ? "cover" : "covers"} his price (${priceValue} points against ${value}), and the ${money(p.apy)} salary fits, leaving ${money(aAfter)} of cap room. ${sellerLine}${p.years <= 1 ? " His contract is up after the season, so it is a rental." : ""}`;
      out.push({
        player: p, price, value, priceValue, upgrade, reasons, warnings, narrative,
        buyer: { before: r1(aSpace), after: r1(aAfter), change: r1(-p.apy), ok: true },
        seller: { before: r1(bSpace), after: r1(bSpace + p.apy), change: r1(p.apy), ok: true },
        realism: Math.max(1, Math.min(99, realism)),
      });
    }
  }
  out.sort((a, b) => b.realism - a.realism || b.player.rating - a.player.rating || a.player.name.localeCompare(b.player.name));
  rejected.sort((a, b) => b.player.rating - a.player.rating || a.player.name.localeCompare(b.player.name));
  return { buys: out, rejected, unaffordable, capBlocked, noNeed, sellerNo };
}
