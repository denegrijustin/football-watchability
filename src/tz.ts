import { useSyncExternalStore } from "react";

/**
 * Display time zone for the whole site. Central by default; a viewer can pick
 * another, remembered in this browser only.
 */
export const ZONES = [
  { id: "America/New_York", label: "Eastern", abbr: "ET" },
  { id: "America/Chicago", label: "Central", abbr: "CT" },
  { id: "America/Denver", label: "Mountain", abbr: "MT" },
  { id: "America/Phoenix", label: "Arizona", abbr: "MST" },
  { id: "America/Los_Angeles", label: "Pacific", abbr: "PT" },
  { id: "America/Anchorage", label: "Alaska", abbr: "AKT" },
  { id: "Pacific/Honolulu", label: "Hawaii", abbr: "HT" },
];
export const DEFAULT_TZ = "America/Chicago";
const KEY = "fbwatch-tz";

let current = DEFAULT_TZ;
try {
  const saved = localStorage.getItem(KEY);
  if (saved && ZONES.some((z) => z.id === saved)) current = saved;
} catch {
  /* storage unavailable: stay on Central */
}
const listeners = new Set<() => void>();
export const getTz = () => current;
export function setTz(tz: string) {
  current = tz;
  try {
    localStorage.setItem(KEY, tz);
  } catch {
    /* not remembered, still applied */
  }
  listeners.forEach((l) => l());
}
export function useTz() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getTz,
    getTz,
  );
}
export const tzAbbr = (tz = current) => ZONES.find((z) => z.id === tz)?.abbr ?? "";
export const tzLabel = (tz = current) => ZONES.find((z) => z.id === tz)?.label ?? tz;

const d = (x: string | Date) => (x instanceof Date ? x : new Date(x));
/** "Sat" */
export const dayOf = (x: string | Date, tz = current) => d(x).toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
/** "2026-10-03" */
export const dateOf = (x: string | Date, tz = current) => d(x).toLocaleDateString("en-CA", { timeZone: tz });
/** "7:30" (no AM/PM, like the site's ET text) or "7:30 PM" with ampm */
export const timeOf = (x: string | Date, tz = current, ampm = false) => {
  const s = d(x).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return ampm ? s : s.replace(/\s?[AP]M$/, "");
};
/** "7p" / "12p" for compact hour labels */
export const hourOf = (x: string | Date, tz = current) => {
  const s = d(x).toLocaleTimeString("en-US", { hour: "numeric", timeZone: tz });
  return s.replace(/\s?([AP])M$/, (_, p: string) => p.toLowerCase());
};
/** Minutes after midnight in the zone. */
export const minutesOf = (x: string | Date, tz = current) => {
  const [h, m] = d(x)
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz })
    .split(":")
    .map(Number);
  return (h % 24) * 60 + m;
};
