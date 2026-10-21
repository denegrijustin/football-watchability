import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchData } from "../data/load";
import type { PerfData, PerfLeague, PerfSelection, PerfStatus, PerfStatusEntry } from "./types";
import { useSelection } from "./store";

/** What a tab needs to know about the app it sits in: which teams exist, how to draw them, and who plays next. */
export interface PerfAdapter {
  league: PerfLeague;
  /** The league's name for the strip above the controls ("NFL" / "College (FBS)"). */
  label: string;
  /** Teams offered in the pickers (population teams that have played). */
  teamIds: string[];
  name(id: string): string;
  short(id: string): string;
  color(id: string): string;
  conf(id: string): string | null;
  mark(id: string, size?: number): ReactNode;
  /** The team's next scheduled game, when the schedule has one. */
  next(id: string): { opp: string; date?: string; home?: boolean } | null;
  /** Opponent-adjusted weekly ratings from the league's own rating system (NFL+ or SP+), when it has them: [week, total, offense, defense]. */
  adjusted(id: string): { week: number; total: number; off: number; def: number }[] | null;
  adjustedLabel: string;
  adjustedNote: string;
  /** Open this team's page in the section (the existing Team view), when there is one. */
  openTeam?: (id: string) => void;
  /** A sensible team to start on. */
  defaultTeam: string | null;
}

export interface PerfCtx {
  league: PerfLeague;
  data: PerfData | null;
  status: PerfStatusEntry | null;
  error: string | null;
  retry: () => void;
  sel: PerfSelection;
  set: (patch: Partial<PerfSelection>) => void;
  adapter: PerfAdapter;
  /** Seasons that have a data file (the current one first). */
  seasons: number[];
}

const C = createContext<PerfCtx | null>(null);
export const usePerf = (): PerfCtx => {
  const c = useContext(C);
  if (!c) throw new Error("PerfProvider missing");
  return c;
};

const FILE: Record<PerfLeague, string> = { nfl: "perf-nfl", cfb: "perf-cfb" };

/**
 * Loads the league's performance file once (fetchData shares one request across every tab and visitor-side re-render), the tiny status
 * file with "last checked", and the previous season's file when it exists. Nothing polls: the files change only when the site is refreshed.
 */
export function PerfProvider({ league, useAdapter, children }: { league: PerfLeague; useAdapter: (data: PerfData | null) => PerfAdapter; children: ReactNode }) {
  const [sel, set] = useSelection(league);
  const [current, setCurrent] = useState<PerfData | null>(null);
  const [prev, setPrev] = useState<PerfData | null>(null);
  const [status, setStatus] = useState<PerfStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    fetchData<PerfData>(FILE[league]).then((d) => live && setCurrent(d), (e: Error) => live && setError(e.message));
    fetchData<PerfStatus>("perf-status").then((s) => live && setStatus(s), () => {});
    fetchData<PerfData>(`${FILE[league]}-prev`).then((d) => live && setPrev(d), () => {});
    return () => { live = false; };
  }, [league, n]);
  const data = sel.season != null && prev && prev.season === sel.season ? prev : current;
  const adapter = useAdapter(data);
  const seasons = useMemo(() => [...new Set([current?.season, prev?.season].filter((s): s is number => !!s))], [current, prev]);
  // Start on a team: the one chosen last time, else the adapter's default, else the first available.
  useEffect(() => {
    if (!data || sel.team) return;
    const t = adapter.defaultTeam && data.teams[adapter.defaultTeam] ? adapter.defaultTeam : adapter.teamIds[0] ?? null;
    if (t) set({ team: t });
  }, [data, sel.team, adapter, set]);
  const value = useMemo<PerfCtx>(
    () => ({ league, data, status: status?.[sel.season != null && prev && prev.season === sel.season ? `${FILE[league]}-prev` : FILE[league]] ?? null, error, retry: () => setN((x) => x + 1), sel, set, adapter, seasons }),
    [league, data, status, error, sel, set, adapter, seasons, prev],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}
