import { useSyncExternalStore } from "react";
import { fetchData } from "./data/load";
import { logoSlug } from "./nfl/model";

export type Impact = { score: number | null; tier: "High" | "Medium" | "Low" | "Minimal" | "Unknown"; basis: string; reason: string; usage?: number; share?: number; rank?: number; split?: { with: { n: number; pf: number; pa: number }; without: { n: number; pf: number; pa: number } } };
export type Player = {
  id: string; name: string; pos: string | null; group: string | null; team: string; teamName?: string; logoId?: string; jersey: string | null; headshot: string | null;
  status: string; reported: string | null;
  injury: { type: string | null; location: string | null; side: string | null; detail: string | null };
  ret: { label: string; date: string | null; weeks: [number, number]; source: "ESPN" | "reported" | "estimate"; season: boolean };
  severity: "Season-ending" | "Long-term" | "Short-term" | "Game-time";
  impact: Impact; note: string | null; next: { opp: string | null; home: boolean; date: string; week: number | null } | null;
};
export type LeagueBlock = { asOf: string; players: Player[]; season?: number; weeksLeft?: number };
export type InjuryData = { updatedAt: string; nfl: LeagueBlock | null; cfb: LeagueBlock | null };

// One shared copy of the report for the whole page: fetched once (a little after the board is up), then every card reads it.
let data: InjuryData | null = null, started = false;
const listeners = new Set<() => void>();
export function loadInjuries() {
  if (started) return;
  started = true;
  fetchData<InjuryData>("injuries").then((d) => { data = d; listeners.forEach((l) => l()); }, () => { started = false; });
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
/** The injury report, or null until it has loaded (or when it cannot be). Starting the load is left to the first card that asks. */
export function useInjuryReport(): InjuryData | null {
  const d = useSyncExternalStore(subscribe, () => data, () => null);
  if (!started) (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 800)))(loadInjuries);
  return d;
}

const byTeam = new WeakMap<LeagueBlock, Map<string, Player[]>>();
const keyOf = (league: string, p: Player) => (league === "NFL" ? logoSlug(p.teamName ?? "") : p.logoId ?? "");
const SHOWN = (p: Player) => p.status !== "Probable";
/** The injured players of one team in a game, biggest impact first (the board's own logo id is the match: it is the same for the report). */
export function injuriesForTeam(d: InjuryData | null, league: string, logoId: string): Player[] {
  const block = d ? (league === "NFL" ? d.nfl : d.cfb) : null;
  if (!block) return [];
  let idx = byTeam.get(block);
  if (!idx) {
    idx = new Map();
    for (const p of block.players) { const k = keyOf(league, p); (idx.get(k) ?? idx.set(k, []).get(k)!).push(p); }
    for (const list of idx.values()) list.sort((a, b) => (b.impact.score ?? -1) - (a.impact.score ?? -1));
    byTeam.set(block, idx);
  }
  return (idx.get(logoId) ?? []).filter(SHOWN);
}
