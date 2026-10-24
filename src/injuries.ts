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

const md = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** When the player is back, in a few words: "About 7 days · Oct 31", "This weekend", "2–4 weeks (est.)". */
export function backShort(r: Player["ret"], now = Date.now()): string {
  if (r.season) return "Out for the season";
  const [lo, hi] = r.weeks;
  if (r.date) {
    const days = Math.round((Date.parse(`${r.date}T12:00:00Z`) - now) / 864e5);
    if (days <= 1) return "This weekend";
    return `About ${days < 14 ? `${days} days` : `${Math.round(days / 7)} weeks`} · ${md(r.date)}`;
  }
  if (hi === 0) return "Day to day";
  if (lo === 0) return "Game-time call";
  return `${lo === hi ? lo : `${lo}–${hi}`} weeks${r.source === "estimate" ? " (est.)" : ""}`;
}
/** "High impact" and "94th percentile" (among players at his position), from the impact block. */
const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 >= 11 && n % 100 <= 13) || n % 10 > 3 ? 0 : n % 10]}`;
export const impactShort = (im: Impact) => ({ label: im.tier === "Unknown" ? "Impact unknown" : `${im.tier} impact`, top: im.rank != null ? `${ordinal(Math.max(1, Math.min(99, Math.round(im.rank))))} percentile` : null });
/** "2026 · 6 games", with a flag when it is last season's. */
export function basisShort(im: Impact, season: number | undefined): { text: string; last: boolean } {
  const m = /^(\d{4}) season, (\d+) games?/.exec(im.basis);
  if (!m) return { text: im.basis.replace(/\s*\(.*\)/, ""), last: false };
  return { text: `${m[1]} · ${m[2]} game${m[2] === "1" ? "" : "s"}`, last: !!season && Number(m[1]) < season };
}
/** "Left ankle · Sprain": the injury in a few words. */
export const injuryLine = (i: Player["injury"]) => [i.side, i.type ?? "Undisclosed"].filter(Boolean).join(" ") + (i.detail && i.detail !== i.type ? ` · ${i.detail}` : "");
