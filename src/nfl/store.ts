import { useCallback, useSyncExternalStore } from "react";

export type NflView = "rankings" | "simulator" | "ats" | "matchups" | "movement" | "team";
export const NFL_VIEWS: { key: NflView; label: string }[] = [
  { key: "rankings", label: "Ratings" },
  { key: "simulator", label: "Simulator" },
  { key: "ats", label: "ATS tracker" },
  { key: "matchups", label: "Matchups" },
  { key: "movement", label: "Movement" },
  { key: "team", label: "Team" },
];

export interface NflRoute {
  view: NflView;
  /** null = the latest ratings week. */
  week: number | null;
  /** "" = all, otherwise a conference ("AFC") or a division ("NFC East"). */
  group: string;
  q: string;
  team: string;
  p: Record<string, string>;
}
export type NflPatch = Partial<Omit<NflRoute, "p">> & { p?: Record<string, string | null> };

let current: NflRoute = { view: "rankings", week: null, group: "", q: "", team: "", p: {} };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function navigateNfl(patch: NflPatch) {
  const p = patch.view && patch.view !== current.view ? ({} as Record<string, string>) : { ...current.p };
  if (patch.p) for (const [k, v] of Object.entries(patch.p)) { if (v == null || v === "") delete p[k]; else p[k] = v; }
  current = { ...current, ...patch, p };
  listeners.forEach((l) => l());
}

export function useNflRoute(): [NflRoute, (patch: NflPatch) => void] {
  const route = useSyncExternalStore(subscribe, () => current);
  return [route, useCallback((patch: NflPatch) => navigateNfl(patch), [])];
}
