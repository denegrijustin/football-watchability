import { useCallback, useSyncExternalStore } from "react";
import type { DivKey } from "./data/types";
import { PERF_TABS, type PerfKey } from "../perf/tabs";

export type ViewKey = PerfKey | "rankings" | "simulator" | "ats" | "movement" | "team" | "matchups" | "compare" | "outliers" | "conferences" | "playresults" | "results" | "accuracy" | "explorer";
export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "rankings", label: "Rankings" },
  { key: "simulator", label: "Simulator" },
  { key: "ats", label: "ATS tracker" },
  { key: "movement", label: "Movement" },
  { key: "team", label: "Team" },
  { key: "matchups", label: "Matchups" },
  { key: "compare", label: "Compare" },
  { key: "outliers", label: "Outliers" },
  { key: "conferences", label: "Conferences" },
  { key: "playresults", label: "Play vs Results" },
  { key: "results", label: "Results" },
  { key: "accuracy", label: "SP+ vs lines" },
  { key: "explorer", label: "Data" },
  ...PERF_TABS.map((t) => ({ key: t.key as ViewKey, label: t.label })),
];

export interface Route {
  view: ViewKey;
  div: DivKey | "ALL";
  /** null = latest week. */
  week: number | null;
  conf: string;
  q: string;
  team: string;
  compare: string[];
  /** Per-view extras (metric, sort, selected game, ...). */
  p: Record<string, string>;
}

const SHARED = new Set(["div", "week", "conf", "q", "team", "cmp"]);

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  const [path, query = ""] = h.split("?");
  const sp = new URLSearchParams(query);
  const view = (VIEWS.find((v) => v.key === path)?.key ?? "rankings") as ViewKey;
  const div = (sp.get("div") ?? "FBS") as Route["div"];
  const week = sp.get("week");
  const p: Record<string, string> = {};
  sp.forEach((v, k) => { if (!SHARED.has(k)) p[k] = v; });
  return { view, div, week: week != null && week !== "" ? Number(week) : null, conf: sp.get("conf") ?? "", q: sp.get("q") ?? "", team: sp.get("team") ?? "", compare: (sp.get("cmp") ?? "").split("|").filter(Boolean), p };
}

export function toHash(r: Route): string {
  const sp = new URLSearchParams();
  if (r.div !== "FBS") sp.set("div", r.div);
  if (r.week != null) sp.set("week", String(r.week));
  if (r.conf) sp.set("conf", r.conf);
  if (r.q) sp.set("q", r.q);
  if (r.team) sp.set("team", r.team);
  if (r.compare.length) sp.set("cmp", r.compare.join("|"));
  for (const [k, v] of Object.entries(r.p)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return `#/${r.view}${qs ? `?${qs}` : ""}`;
}

// The embedded tool keeps its place in memory: FB Watch owns the address bar, and the choice survives switching tabs.
let current: Route = parseHash("");
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => current;
const emit = () => listeners.forEach((l) => l());

export type Patch = Partial<Omit<Route, "p">> & { p?: Record<string, string | null> };

export function applyPatch(cur: Route, patch: Patch): Route {
  // Switching view drops the old view's own extras (keeping only what the patch sets).
  const p = patch.view && patch.view !== cur.view ? ({} as Record<string, string>) : { ...cur.p };
  if (patch.p) for (const [k, v] of Object.entries(patch.p)) { if (v == null || v === "") delete p[k]; else p[k] = v; }
  return { ...cur, ...patch, p };
}

/** Navigate from outside the tool (the Game Center opens the simulator on a game). */
export function navigate(patch: Patch) {
  current = applyPatch(current, patch);
  emit();
}

export function useRoute(): [Route, (patch: Patch, opts?: { replace?: boolean }) => void] {
  const route = useSyncExternalStore(subscribe, snapshot);
  const set = useCallback((patch: Patch) => navigate(patch), []);
  return [route, set];
}
