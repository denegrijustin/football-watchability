import { useSyncExternalStore } from "react";

/**
 * The page's startup state, in one place and with no library:
 *   loading   the app is starting (the shell is up, the week's games are on their way)
 *   ready     the board is interactive
 *   degraded  the board is usable but an optional dataset (past results, TV checks) did not load
 *   failed    the essential data could not be loaded
 * It is mirrored on <html data-fb-boot> so the page's boot guard and the tests can read it without importing the app.
 */
export type Lifecycle = "loading" | "ready" | "degraded" | "failed";
let state: Lifecycle = "loading";
const listeners = new Set<() => void>();
export function setLifecycle(next: Lifecycle) {
  if (next === state && document.documentElement.dataset.fbBoot === next) return;
  state = next;
  document.documentElement.dataset.fbBoot = next;
  listeners.forEach((l) => l());
}
export const getLifecycle = () => state;
export const useLifecycle = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);

/** What went wrong, kept for whoever is diagnosing it (and logged); never shown as markup. */
export const diagnostics: { at: number; scope: string; message: string }[] = [];
export function recordDiag(scope: string, e: unknown) {
  const message = String((e as { message?: string })?.message ?? e).slice(0, 200);
  diagnostics.push({ at: Date.now(), scope, message });
  if (diagnostics.length > 50) diagnostics.shift();
  console.warn(`[fbwatch] ${scope}: ${message}`);
}
