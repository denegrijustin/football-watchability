// Fresh betting lines. The board's saved lines come from the scheduled rebuild (a few times a week); this reads the current ones from /api/odds, which
// the edge caches for ten minutes, so a refresh is cheap for ESPN however many people use it. Picks, parlays and game cards use these when they have them.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { NflData } from "./nfl/types";

export interface Line {
  id: string; league: "NFL" | "CFB"; date: string; state: string;
  homeId: string; awayId: string; homeAbbr: string; awayAbbr: string; homeName: string; awayName: string;
  /** The home team's spread: negative when the home team is favored. */
  spread: number; total: number | null; provider: string | null;
}
interface Snap { at: number | null; busy: boolean; error: boolean; lines: Map<string, Line>; version: number }

let snap: Snap = { at: null, busy: false, error: false, lines: new Map(), version: 0 };
const listeners = new Set<() => void>();
const set = (s: Partial<Snap>) => { snap = { ...snap, ...s, version: snap.version + 1 }; listeners.forEach((l) => l()); };

/** A refresh needs this long since the last one, so a button that is pressed repeatedly does not keep calling. */
export const MIN_GAP_MS = 45_000;
/** Pages that keep lines current check this often while they are showing. */
export const AUTO_MS = 15 * 60_000;

export async function refreshLines(force = false, leagues: ("nfl" | "cfb")[] = ["nfl", "cfb"]) {
  if (snap.busy || (!force && snap.at != null && Date.now() - snap.at < MIN_GAP_MS)) return;
  set({ busy: true });
  try {
    const out = await Promise.all(leagues.map(async (lg) => {
      const r = await fetch(`/api/odds?league=${lg}`, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as { at: number; league: string; games: { id: string; date: string; state: string; home: { id: string; abbr: string; name: string }; away: { id: string; abbr: string; name: string }; spread: number; total: number | null; provider: string | null }[] };
    }));
    const lines = new Map(snap.lines);
    let at = Infinity;
    for (const d of out) {
      at = Math.min(at, d.at);
      for (const g of d.games) lines.set(g.id, { id: g.id, league: d.league === "nfl" ? "NFL" : "CFB", date: g.date, state: g.state, homeId: g.home.id, awayId: g.away.id, homeAbbr: g.home.abbr, awayAbbr: g.away.abbr, homeName: g.home.name, awayName: g.away.name, spread: g.spread, total: g.total, provider: g.provider });
    }
    set({ lines, at: Number.isFinite(at) ? at : Date.now(), busy: false, error: false });
  } catch {
    set({ busy: false, error: true });
  }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const get = () => snap;

/** The fresh lines. With `auto`, the page that calls it keeps them current: it loads them when it opens and checks again every 15 minutes while it is visible. */
export function useLines({ auto = false }: { auto?: boolean } = {}) {
  const s = useSyncExternalStore(subscribe, get, get);
  useEffect(() => {
    if (!auto) return;
    const stale = () => snap.at == null || Date.now() - snap.at > 10 * 60_000;
    if (stale()) void refreshLines();
    const timer = setInterval(() => { if (!document.hidden) void refreshLines(true); }, AUTO_MS);
    const back = () => { if (!document.hidden && snap.at != null && Date.now() - snap.at > 5 * 60_000) void refreshLines(true); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [auto]);
  const refresh = useCallback(() => refreshLines(false), []);
  return { ...s, refresh };
}

/** One game's fresh line by ESPN id, or undefined. Subscribes without fetching. */
export function useFreshLine(espnId: string | null | undefined): Line | undefined {
  const s = useSyncExternalStore(subscribe, get, get);
  return espnId ? s.lines.get(espnId) : undefined;
}

/** The NFL data with the games' spreads and totals replaced by the fresh ones (nflverse writes the spread as positive when the home team is favored). */
export function freshNfl(data: NflData, lines: Map<string, Line>): NflData {
  if (!lines.size) return data;
  return {
    ...data,
    games: data.games.map((g) => {
      const l = g.espn ? lines.get(g.espn) : undefined;
      if (!l || l.state !== "pre" || g.aS != null) return g;
      return { ...g, spread: -l.spread, total: l.total ?? g.total };
    }),
  };
}

/** "MEM -10.5 • O/U 55.5": the line as the game cards write it, from a fresh line and the card's two teams. Null when the favorite cannot be named. */
export function lineTextFor(l: Line, teams: { name: string; abbr?: string }[], league: string): string | null {
  const label = (abbr: string) => {
    const t = teams.find((x) => x.abbr === abbr);
    return t ? (league === "NFL" ? (t.name.split(" ").slice(-1)[0] ?? t.name) : t.name) : null;
  };
  const sp = l.spread === 0 ? "PK" : null;
  const fav = l.spread < 0 ? label(l.homeAbbr) : l.spread > 0 ? label(l.awayAbbr) : "";
  if (fav == null) return null;
  const pts = Math.abs(l.spread);
  const text = sp ? "PK" : `${fav} -${pts}`;
  return `${text}${l.total != null ? ` • O/U ${l.total}` : ""}`;
}
