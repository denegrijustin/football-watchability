import { useSyncExternalStore } from "react";
import { getLifecycle, setLifecycle } from "../boot";

/** The datasets the board can do without: past results and the independent TV checks. Each reports how its load went. */
export type OptionalName = "results" | "broadcast";
export type OptionalStatus = "loading" | "ready" | "failed";
const state: Record<OptionalName, { status: OptionalStatus; error?: string }> = { results: { status: "loading" }, broadcast: { status: "loading" } };
let version = 0;
const listeners = new Set<() => void>();

export function setOptional(name: OptionalName, status: OptionalStatus, error?: string) {
  state[name] = { status, error };
  version += 1;
  // A ready board with a missing optional dataset is "degraded"; it is "ready" again once none is missing.
  const lc = getLifecycle();
  const anyFailed = state.results.status === "failed" || state.broadcast.status === "failed";
  if (lc === "ready" && anyFailed) setLifecycle("degraded");
  else if (lc === "degraded" && !anyFailed) setLifecycle("ready");
  listeners.forEach((l) => l());
}
export const optionalState = () => state;
/** Re-renders a component when an optional dataset arrives or fails; returns the current statuses. */
export function useOptionalData() {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
  return state;
}
