import { STARTERS } from "../../scripts/trade/lib.mjs";
import type { League } from "./engine";

const starters = (g: string) => (STARTERS as Record<string, number>)[g] ?? 1;

/** Plain names for the position groups, for sentences. */
export const GROUP_NAME: Record<string, string> = { QB: "quarterbacks", RB: "running backs", WR: "receivers", TE: "tight ends", OT: "tackles", OG: "guards", C: "centers", EDGE: "edge rushers", DT: "interior linemen", LB: "linebackers", CB: "cornerbacks", S: "safeties" };
export const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;

export type NeedLevel = "major" | "need" | "solid" | "strength";
/** How a club's starters at one position group compare with the other 31 clubs'. */
export type Need = { group: string; avg: number; leagueAvg: number; rank: number; weakest: number; short: boolean; level: NeedLevel; starters: number[] };

const needCache = new WeakMap<League, Map<string, Need[]>>();
/**
 * Each club's needs: for every position group, the average rating of the starters it plays there, ranked against the other clubs (1 is the best group
 * in the league), with its weakest starter. A group it cannot even fill is a major need.
 */
export function teamNeeds(league: League): Map<string, Need[]> {
  const hit = needCache.get(league);
  if (hit) return hit;
  const groups = Object.keys(STARTERS as Record<string, number>);
  const rows = new Map<string, Record<string, { avg: number; weakest: number; short: boolean; starters: number[] }>>();
  for (const [t, roster] of league.byTeam) {
    const r: Record<string, { avg: number; weakest: number; short: boolean; starters: number[] }> = {};
    for (const g of groups) {
      const n = starters(g);
      const live = roster.filter((p) => p.group === g && p.status !== "R").sort((a, b) => b.rating - a.rating).slice(0, n).map((p) => p.rating);
      const short = live.length < n;
      while (live.length < n) live.push(45);
      r[g] = { avg: Math.round((live.reduce((a, b) => a + b, 0) / n) * 10) / 10, weakest: live[n - 1], short, starters: live };
    }
    rows.set(t, r);
  }
  const out = new Map<string, Need[]>();
  for (const g of groups) {
    const sorted = [...rows].map(([t, r]) => [t, r[g].avg] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const leagueAvg = Math.round((sorted.reduce((a, [, v]) => a + v, 0) / sorted.length) * 10) / 10;
    sorted.forEach(([t], i) => {
      const r = rows.get(t)![g];
      const rank = i + 1;
      const level: NeedLevel = r.short || rank >= 25 ? "major" : rank >= 17 ? "need" : rank >= 9 ? "solid" : "strength";
      (out.get(t) ?? out.set(t, []).get(t)!).push({ group: g, avg: r.avg, leagueAvg, rank, weakest: r.weakest, short: r.short, level, starters: r.starters });
    });
  }
  for (const list of out.values()) list.sort((a, b) => b.rank - a.rank);
  needCache.set(league, out);
  return out;
}


/** "Kansas City Chiefs'" / "Dallas Cowboys'" / "Buffalo Bills'": the possessive of a club name. */
export const poss = (n: string) => (n.endsWith("s") ? `${n}'` : `${n}'s`);
