import { NFL_NAMES } from "./teams";
import { DEPTH, STARTERS, ageFactor, marketApy, pickPoints } from "../../scripts/trade/lib.mjs";

/** One player on a roster, as src/data/trade-players.json lists him. Money is in millions of dollars. */
export type Player = {
  id: string; name: string; team: string; group: string; age: number; rating: number; apy: number; gtd: number; years: number;
  src: "k" | "r" | "e" | "o"; status: "A" | "R" | "I"; rank: number; measured: boolean; draft: number;
};
export type TradeData = {
  version: number; season: number; builtAt: string;
  cap: { limit: number; assumed: boolean; typicalSpaceM: number };
  teams: Record<string, { space: number; spaceSrc: "a" | "o"; n: number }>;
  players: unknown[][];
};
export type League = { cap: number; space: Record<string, number>; spaceAssumed: Record<string, boolean>; byTeam: Map<string, Player[]>; players: Player[]; byId: Map<string, Player> };

/** A draft pick used to even a trade out. Which picks a club really owns is not known, so these are "a pick of this value", not a named pick. */
export type Pick = { kind: "pick"; label: string; value: number; overall: number };
export type Asset = { kind: "player"; p: Player } | Pick;
export type TradeSide = { before: number; after: number; change: number; ok: boolean };
export type Trade = {
  partner: string;
  give: Player[];
  get: Asset[];
  giveValue: number; getValue: number;
  /** 0-1: how even the two sides are. */
  fairness: number;
  from: TradeSide; to: TradeSide;
  /** 0-100: how likely the clubs would do it (fair, fills a need, fits both caps, does not leave a hole). */
  realism: number;
  reasons: string[]; warnings: string[];
};

const r1 = (x: number) => Math.round(x * 10) / 10;

export function toLeague(data: TradeData): League {
  const players: Player[] = data.players.map((r) => ({
    id: r[0] as string, name: r[1] as string, team: r[2] as string, group: r[3] as string, age: r[4] as number, rating: r[5] as number, apy: r[6] as number, gtd: r[7] as number,
    years: r[8] as number, src: r[9] as Player["src"], status: r[10] as Player["status"], rank: r[11] as number, measured: r[12] === 1, draft: r[13] as number,
  }));
  const byTeam = new Map<string, Player[]>();
  for (const p of players) (byTeam.get(p.team) ?? byTeam.set(p.team, []).get(p.team)!).push(p);
  const space: Record<string, number> = {}, spaceAssumed: Record<string, boolean> = {};
  for (const [t, v] of Object.entries(data.teams)) { space[t] = v.space; spaceAssumed[t] = v.spaceSrc === "a"; }
  return { cap: data.cap.limit, space, spaceAssumed, byTeam, players, byId: new Map(players.map((p) => [p.id, p])) };
}

// ---- value, in draft-chart points ----
const POS_WEIGHT: Record<string, number> = { QB: 1.5, EDGE: 1.1, OT: 1.05, CB: 1, WR: 1, DT: 1, S: 0.8, LB: 0.8, TE: 0.8, OG: 0.75, C: 0.7, RB: 0.6 };
const CURVE: [number, number][] = [[50, 2], [55, 10], [60, 30], [65, 70], [70, 160], [75, 300], [80, 500], [85, 800], [90, 1300], [95, 2000], [99, 3000]];
function curve(rating: number): number {
  const r = Math.max(50, Math.min(99, rating));
  for (let i = 1; i < CURVE.length; i++) {
    const [r1_, v1] = CURVE[i - 1], [r2, v2] = CURVE[i];
    if (r <= r2) return Math.exp(Math.log(v1) + (Math.log(v2) - Math.log(v1)) * ((r - r1_) / (r2 - r1_)));
  }
  return 3000;
}

/** What a player is worth to another club, in the draft chart's points: his rating by position, his age, and whether his contract is a bargain or a burden. */
export function tradeValue(p: Player): number {
  let v = curve(p.rating) * (POS_WEIGHT[p.group] ?? 0.8) * ageFactor(p.group, p.age);
  const market = marketApy(p.group, p.rating, 301.2e6) / 1e6;
  const surplus = Math.max(-0.6, Math.min(0.6, (market - p.apy) / Math.max(1, market))); // positive: paid less than the market pays
  v *= 1 + 0.5 * surplus * (Math.min(p.years, 4) / 4);
  if (p.years <= 1) v *= 0.85; // a rental
  if (p.status === "R") v *= 0.35;
  return Math.round(v);
}

/** Picks that add up to roughly `points`: the biggest pick that fits, again, up to three (a star can cost two first-rounders). */
export function pickPackage(points: number): Pick[] {
  const out: Pick[] = [];
  let left = points;
  for (let i = 0; i < 3 && left >= 12; i++) {
    const p = pickFor(left);
    out.push(p);
    left -= p.value;
  }
  return out.length ? out : [pickFor(Math.max(points, 2))];
}

const pickFor = (points: number): Pick => {
  const tiers: [number, string, number][] = [[1300, "an early 1st-round pick", 10], [800, "a mid 1st-round pick", 18], [590, "a late 1st-round pick", 30], [380, "an early 2nd-round pick", 38], [270, "a late 2nd-round pick", 60], [150, "a 3rd-round pick", 90], [70, "a 4th-round pick", 125], [30, "a 5th-round pick", 160], [12, "a 6th-round pick", 195], [0, "a 7th-round pick", 235]];
  const [, label, overall] = tiers.find(([t]) => points >= t)!;
  return { kind: "pick", label, value: pickPoints(overall), overall };
};

/** Starters a club plays at a group and the rating of its weakest one (the player a newcomer would have to beat). */
function weakestStarter(roster: Player[], group: string): { rating: number; short: boolean } {
  const live = roster.filter((p) => p.group === group && p.status !== "R").sort((a, b) => b.rating - a.rating);
  const n = (STARTERS as Record<string, number>)[group] ?? 1;
  return live.length < n ? { rating: 0, short: true } : { rating: live[n - 1].rating, short: false };
}

const lowRoster = (roster: Player[]) => [...roster].sort((a, b) => a.rating - b.rating);

export type Options = { max?: number };

/** What one other club would do about a player: the packages it could realistically send for him, or why it could not or would not. */
export type Offer = { partner: string; offers: Trade[]; reason: string | null; helps: boolean };

/** The player's own club's side of the picture, worked out once for all the partners. */
function context(league: League, player: Player) {
  const A = league.byTeam.get(player.team) ?? [];
  const aAfterGroup = A.filter((p) => p.group === player.group && p.id !== player.id && p.status !== "R").sort((x, y) => y.rating - x.rating);
  const nStart = (STARTERS as Record<string, number>)[player.group] ?? 1;
  return { A, value: tradeValue(player), aSpace: league.space[player.team] ?? 0, nextBest: aAfterGroup[nStart - 1]?.rating ?? 0 };
}

/**
 * What it would take for one club to get this player: does he help it (he would start, or it is short at his position), what could it send back that
 * helps his own club (a player it can spare at a position of need, and/or a pick of the right value), and do both clubs' caps survive it.
 * Up to three packages, most realistic first; with none, the reason.
 */
export function offerFrom(league: League, player: Player, team: string, max = 3): Offer {
  const { A, value, aSpace, nextBest } = context(league, player);
  const B = league.byTeam.get(team) ?? [];
  const bSpace = league.space[team] ?? 0;
  const name = NFL_NAMES[team] ?? team;
  const weak = weakestStarter(B, player.group);
  const depthShort = B.filter((y) => y.group === player.group && y.status !== "R").length < ((DEPTH as Record<string, number>)[player.group] ?? 3);
  // He would start for them, or they are short of bodies at his position and he would be depth.
  const upgrade = weak.short ? 12 : player.rating - weak.rating >= 3 ? player.rating - weak.rating : depthShort && player.rating >= 50 ? 3 : 0;
  if (upgrade < 3) return { partner: team, offers: [], helps: false, reason: `${name} would not start him: its ${player.group} starters are as good (its weakest is a ${weak.rating}) and its depth there is full.` };

  // What the club could send: players it can spare (past its starters, or at a deep position), at groups where the player's own club would play them.
  const spare = B.filter((x) => x.status !== "I" && x.status !== "R").filter((x) => {
    const rosterGroup = B.filter((y) => y.group === x.group && y.status !== "R").sort((a, b) => b.rating - a.rating);
    const pos = rosterGroup.findIndex((y) => y.id === x.id);
    const n = (STARTERS as Record<string, number>)[x.group] ?? 1;
    return pos >= n || (pos === n - 1 && rosterGroup.length > n + 2 && x.rating <= (rosterGroup[n]?.rating ?? 0) + 6);
  });
  const fits = spare.filter((x) => {
    const w = weakestStarter(A.filter((y) => y.id !== player.id), x.group);
    return w.short || x.rating >= w.rating + 2 || x.group === player.group;
  });
  const cands = fits.map((x) => ({ x, v: tradeValue(x) })).filter((c) => c.v >= value * 0.2 && c.v <= value * 1.15).sort((a, b) => Math.abs(a.v - value * 0.85) - Math.abs(b.v - value * 0.85));

  const options: Asset[][] = [];
  const topUp = (items: Player[], total: number): Asset[] => {
    const gap = value - total;
    const assets: Asset[] = items.map((p) => ({ kind: "player", p }));
    return gap > Math.max(6, value * 0.12) ? [...assets, ...(items.length ? [pickFor(gap)] : pickPackage(gap))] : assets;
  };
  for (const c of cands.slice(0, 4)) options.push(topUp([c.x], c.v));
  // Two or three players: the way a club with little cap room takes on a large salary is to send salary back.
  const pool = fits.map((x) => ({ x, v: tradeValue(x) })).filter((c) => c.v <= value * 0.9).sort((a, b) => b.x.apy - a.x.apy).slice(0, 7);
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const sum = pool[i].v + pool[j].v;
    if (sum >= value * 0.2 && sum <= value * 1.15) options.push(topUp([pool[i].x, pool[j].x], sum));
    for (let k = j + 1; k < Math.min(pool.length, 6); k++) {
      const sum3 = sum + pool[k].v;
      if (sum3 >= value * 0.2 && sum3 <= value * 1.15 && pool[i].x.apy + pool[j].x.apy + pool[k].x.apy >= player.apy * 0.6) options.push(topUp([pool[i].x, pool[j].x, pool[k].x], sum3));
    }
  }
  // Picks alone: most real trades are a player for picks, so offer several sizes of them (a little under, at, and over his value).
  for (const k of [0.8, 0.9, 1.0, 1.1]) options.push(pickPackage(value * k));

  const trades: Trade[] = [];
  let capBlocked = 0;
  for (const get of options) {
    const getValue = get.reduce((a, g) => a + (g.kind === "player" ? tradeValue(g.p) : g.value), 0);
    const sendApy = get.reduce((a, g) => a + (g.kind === "player" ? g.p.apy : 0), 0);
    const incomingA = sendApy, outgoingA = player.apy;
    const aChange = incomingA - outgoingA, bChange = outgoingA - incomingA;
    const from: TradeSide = { before: r1(aSpace), after: r1(aSpace - aChange), change: r1(-aChange), ok: aSpace - aChange >= 0 };
    const to: TradeSide = { before: r1(bSpace), after: r1(bSpace - bChange), change: r1(-bChange), ok: bSpace - bChange >= 0 };
    if (!to.ok || !from.ok) { capBlocked++; continue; }
    const fairness = Math.max(0, 1 - Math.abs(getValue - value) / Math.max(value, 1));
    const players = get.filter((g): g is { kind: "player"; p: Player } => g.kind === "player").map((g) => g.p);
    const hole = Math.max(0, nextBest ? player.rating - nextBest - 8 : player.rating - 55);
    const holeFilled = players.some((p) => p.group === player.group && p.rating >= nextBest);
    const reasons: string[] = [], warnings: string[] = [];
    reasons.push(weak.short ? `${team} is short at ${player.group}` : `${player.name} (${player.rating}) would start for ${team}, ahead of a ${weak.rating}`);
    for (const p of players) reasons.push(`${player.team} can use ${p.name} (${p.group}, ${p.rating}) as ${p.rank > (STARTERS as Record<string, number>)[p.group] ? "depth" : "a starter"}`);
    if (get.some((g) => g.kind === "pick")) reasons.push("a pick evens out the value (which picks a club owns is not checked)");
    reasons.push(`${team} takes on ${r1(outgoingA)}M and sends ${r1(incomingA)}M, so its cap room goes ${to.before}M to ${to.after}M`);
    if (hole > 6 && !holeFilled) warnings.push(`${player.team} would be thin at ${player.group} (next best is ${nextBest || "none"})`);
    if (player.rating >= 92 && player.age <= 29 && player.years >= 3) warnings.push("a franchise-level player: a club rarely shops one");
    if (player.status === "R") warnings.push("he is on injured reserve: a club pays little and waits for him to heal");
    if (player.age >= 31 && player.group !== "QB") warnings.push("an older player: the return is small");
    if (player.years <= 1) warnings.push("his contract ends after this season (a rental)");
    if (league.spaceAssumed[team] || league.spaceAssumed[player.team]) warnings.push("cap room is an assumption, not an official figure");
    if (players.length > 1) warnings.push("the two clubs' rosters would need a small move to stay at 53");
    const needFit = Math.min(1, upgrade / 12);
    const capHealth = Math.min(1, Math.min(to.after, from.after + 6) / 12 + 0.5);
    const complexity = 8 * Math.max(0, get.length - 2); // a big package of many pieces is harder to get done than a simple swap
    const pickValue = get.reduce((a, g) => a + (g.kind === "pick" ? g.value : 0), 0);
    // Clubs trade for players with draft picks far more often than with other players, so picks rank above a player swap, and two or more players back rank lowest.
    const pickLean = Math.round(16 * (getValue ? pickValue / getValue : 0)) - (players.length >= 2 ? 6 : 0);
    const realism = Math.round(100 * (0.4 * fairness + 0.25 * needFit + 0.15 * capHealth + 0.2 * (hole > 6 && !holeFilled ? 0.2 : 1)) - complexity - (player.age >= 31 ? 8 : 0) - (player.rating >= 92 && player.age <= 29 && player.years >= 3 ? 12 : 0) + pickLean);
    trades.push({ partner: team, give: [player], get, giveValue: value, getValue, fairness: Math.round(fairness * 100) / 100, from, to, realism: Math.max(1, Math.min(99, realism)), reasons, warnings });
  }
  trades.sort((a, b) => b.realism - a.realism);
  // keep packages that differ: not the same set of players twice
  const seen = new Set<string>(), distinct: Trade[] = [];
  for (const t of trades) {
    const key = t.get.map((g) => (g.kind === "player" ? g.p.id : g.label)).sort().join("|");
    if (!seen.has(key)) { seen.add(key); distinct.push(t); }
  }
  if (!distinct.length) {
    return { partner: team, offers: [], helps: true, reason: capBlocked ? `${name} could use him but cannot fit his ${r1(player.apy)}M salary: it has ${r1(bSpace)}M of cap room and no spare player of the right value to send back.` : `${name} has nothing it can spare that would help ${player.team} at the right value.` };
  }
  // Picks lead: up to two pick-based packages, then at most one swap of players alone, so the list never reads as a roster shuffle.
  const withPicks = distinct.filter((t) => t.get.some((g) => g.kind === "pick")), swaps = distinct.filter((t) => t.get.every((g) => g.kind === "player"));
  const chosen = [...withPicks.slice(0, Math.max(1, max - 1)), ...swaps.slice(0, 1), ...withPicks.slice(Math.max(1, max - 1))].slice(0, max).sort((a, b) => b.realism - a.realism);
  return { partner: team, offers: chosen, helps: true, reason: null };
}

/** What it would take from each of the other 31 clubs to get this player, with the reason for every club that cannot or would not. */
export function allOffers(league: League, player: Player): Offer[] {
  return [...league.byTeam.keys()].filter((t) => t !== player.team).map((t) => offerFrom(league, player, t));
}

/** Realistic trades for one player: the best package from each club that could do it, the most realistic few overall. */
export function findTrades(league: League, player: Player, opts: Options = {}): Trade[] {
  const best = allOffers(league, player).filter((o) => o.offers.length).map((o) => o.offers[0]);
  return best.sort((a, b) => b.realism - a.realism || a.partner.localeCompare(b.partner)).slice(0, opts.max ?? 3);
}

/** The best trade for every player on a club's roster, most valuable player first. A player nobody would realistically want has none. */
export function tradesForRoster(league: League, team: string): { player: Player; trades: Trade[] }[] {
  return [...(league.byTeam.get(team) ?? [])].sort((a, b) => tradeValue(b) - tradeValue(a)).map((player) => ({ player, trades: findTrades(league, player) }));
}

export const describeAsset = (a: Asset) => (a.kind === "player" ? `${a.p.name} (${a.p.group}, ${a.p.rating})` : a.label);
export { lowRoster };

/** Why no realistic trade exists for a player, in a sentence. */
export function whyNoTrade(league: League, p: Player): string {
  if (p.status === "R") return "He is on injured reserve and no club that could use him would pay anything worth doing a trade for.";
  const maxSpace = Math.max(...[...league.byTeam.keys()].filter((t) => t !== p.team).map((t) => league.space[t] ?? 0));
  if (p.apy > maxSpace + 25) return `His ${r1(p.apy)}M salary is more than any club could absorb for what he is worth now (age ${p.age}, rating ${p.rating}).`;
  if (p.age >= 33 && p.group !== "QB") return `At ${p.age} he is worth too little to anyone else for a trade to be worth doing.`;
  if (p.rating < 55) return "No club needs a player at his level at this position.";
  return "No club that needs him at this position could send back a player or pick of the right value and still fit its cap.";
}
