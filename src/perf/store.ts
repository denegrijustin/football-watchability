import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_SELECTION, type PerfLeague, type PerfSelection } from "./types";

// One selection per league (NFL and college never share a team, season or benchmark). It lives in memory, outside the tabs, so the
// team, opponent, window and filters survive switching tabs; nothing is written to the address bar (FB Watch owns it).
const state: Record<PerfLeague, PerfSelection> = { nfl: { ...DEFAULT_SELECTION }, cfb: { ...DEFAULT_SELECTION } };
const listeners: Record<PerfLeague, Set<() => void>> = { nfl: new Set(), cfb: new Set() };

export function patchSelection(league: PerfLeague, patch: Partial<PerfSelection>) {
  const next = { ...state[league], ...patch };
  // A different team or window makes a selected game or metric from before meaningless.
  if (patch.team !== undefined && patch.team !== state[league].team) { next.game = patch.game ?? null; }
  if (next.opp && next.opp === next.team) next.opp = null;
  state[league] = next;
  listeners[league].forEach((l) => l());
}
export const getSelection = (league: PerfLeague) => state[league];
export const resetSelection = (league: PerfLeague) => patchSelection(league, { ...DEFAULT_SELECTION, team: state[league].team, opp: state[league].opp });

export function useSelection(league: PerfLeague): [PerfSelection, (patch: Partial<PerfSelection>) => void] {
  const subscribe = useCallback((l: () => void) => { listeners[league].add(l); return () => { listeners[league].delete(l); }; }, [league]);
  const sel = useSyncExternalStore(subscribe, () => state[league]);
  const set = useCallback((patch: Partial<PerfSelection>) => patchSelection(league, patch), [league]);
  return [sel, set];
}
