import { useEffect, useSyncExternalStore } from "react";

/** How long the celebration covers the card, and how long a game that just scored stays at the top of the board. */
export const FLASH_MS = 4500;
export const PIN_MS = 90_000;

export type Touchdown = { id: string; side: 0 | 1; at: number };
type Score = { away: number; home: number; state: string };

const seen = new Map<string, { away: number; home: number; at: number }>();
let active: Touchdown[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** A touchdown is a jump of 6, 7 or 8 points for one side between two looks at the score (the extra point can arrive in the same look). */
export const isTouchdown = (delta: number) => delta >= 6 && delta <= 8;

/**
 * Called with every new set of live scores. A touchdown is recorded when one side's score jumps by a touchdown's worth while the game is on.
 * The first look at a game, and a look after a long gap (the page was in the background), only sets the baseline, so opening the page never celebrates old scores.
 */
export function observeScores(map: Record<string, Score>, now = Date.now()) {
  let changed = false;
  for (const [id, s] of Object.entries(map)) {
    const prev = seen.get(id);
    seen.set(id, { away: s.away, home: s.home, at: now });
    if (!prev || s.state !== "in" || now - prev.at > 60_000) continue;
    const da = s.away - prev.away, dh = s.home - prev.home;
    const side = isTouchdown(da) && dh <= 0 ? 0 : isTouchdown(dh) && da <= 0 ? 1 : null;
    if (side == null) continue;
    active = [...active.filter((t) => t.id !== id), { id, side, at: now }];
    changed = true;
  }
  const alive = active.filter((t) => now - t.at < PIN_MS);
  if (alive.length !== active.length) { active = alive; changed = true; }
  if (changed) emit();
}

/** Forget everything (for tests). */
export function resetTouchdowns() { seen.clear(); active = []; emit(); }

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const snapshot = () => active;

/** Games that scored a touchdown within the pin time, newest first. Re-renders when one scores and when one expires. */
export function useTouchdowns(): Touchdown[] {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!list.length) return;
    const next = Math.min(...list.map((t) => t.at + PIN_MS), ...list.map((t) => t.at + FLASH_MS).filter((x) => x > Date.now()));
    const timer = setTimeout(() => { active = active.filter((t) => Date.now() - t.at < PIN_MS); emit(); }, Math.max(250, next - Date.now() + 50));
    return () => clearTimeout(timer);
  }, [list]);
  return list;
}
