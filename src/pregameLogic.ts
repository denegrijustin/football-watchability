// Pure pregame logic: when the pregame show runs, and where in it a game is. No site data, so the card, the Game Center and the tests share it.
import { useEffect, useState } from "react";

/** College: the band takes the field 20 minutes before kickoff. NFL: the cheerleaders take it 15 minutes before. */
export const PREGAME_LEAD_MS = { CFB: 20 * 60_000, NFL: 15 * 60_000 } as const;
/** Both shows are completely off the field this long before kickoff, so the normal pregame field is back for the last five minutes. */
export const PREGAME_CLEAR_MS = 5 * 60_000;
/** The exit is planned to finish this long before the cutoff, so nobody is still walking at five minutes. */
export const EXIT_MARGIN_MS = 15_000;

export type PregameLeague = keyof typeof PREGAME_LEAD_MS;
export type Pregame = {
  league: PregameLeague;
  /** The latest scheduled kickoff (epoch ms). */
  kickoff: number;
  /** When the show begins and when the field must be clear. */
  start: number;
  cutoff: number;
};

/** A game that will not kick off as planned gets no show: postponed, canceled, suspended. (A delay with no new time simply runs past the cutoff, so the field stays clear.) */
const OFF = /postponed|cancel+ed|suspended|forfeit/i;

/**
 * The pregame show for a game, or null when there is none right now: not an eligible league, the game is live or over,
 * it was postponed or canceled, kickoff is unknown, or it is outside the window (before it starts, or after the cutoff).
 */
export function pregameFor(opts: { league: string; date?: string | null; state?: "pre" | "in" | "post" | null; detail?: string | null; now: number }): Pregame | null {
  const { league, date, state, detail, now } = opts;
  if (league !== "CFB" && league !== "NFL") return null;
  if (state === "in" || state === "post") return null;
  if (detail && OFF.test(detail)) return null;
  const kickoff = Date.parse(date ?? "");
  if (!Number.isFinite(kickoff)) return null;
  const start = kickoff - PREGAME_LEAD_MS[league];
  const cutoff = kickoff - PREGAME_CLEAR_MS;
  if (now < start || now >= cutoff) return null;
  return { league, kickoff, start, cutoff };
}

/** Preview: `?pregame=12` shows every upcoming game as if it were 12 minutes before kickoff, then lets time run. Fractions work (`?pregame=4.5`). */
let anchor: number | null = null;
function previewMinutes(): number | null {
  if (typeof location === "undefined") return null;
  const m = new URLSearchParams(location.search).get("pregame");
  if (m === null || m === "") return null;
  const n = Number(m);
  return Number.isFinite(n) ? n : null;
}
/** The shared clock for a game's pregame: real time, or the preview's. Card and Game Center use the same one, so they agree and neither restarts the show. */
export function pregameNow(kickoff: number): number {
  const minutes = previewMinutes();
  if (minutes === null) return Date.now();
  anchor ??= Date.now();
  return kickoff - minutes * 60_000 + (Date.now() - anchor);
}
export const previewing = () => previewMinutes() !== null;

/** How far into the show, and the time left to kickoff. */
export const pregameElapsed = (p: Pregame, now: number) => Math.max(0, now - p.start);
export const pregameToKickoff = (p: Pregame, now: number) => Math.max(0, p.kickoff - now);

/** The band's formation step at a moment: normal steps last STEP_MS and the Script Ohio step lasts longer. Derived from the clock, so a reload lands on the same step. */
export function stepAtElapsed(elapsed: number, stepMs: number, scriptStep: number, scriptMs: number): number {
  const before = scriptStep * stepMs;
  if (elapsed < before) return Math.floor(elapsed / stepMs);
  if (elapsed < before + scriptMs) return scriptStep;
  return scriptStep + 1 + Math.floor((elapsed - before - scriptMs) / stepMs);
}

/** Re-renders a pregame consumer: once a second while a show is near or running, rarely otherwise. */
export function usePregame(opts: { league: string; date?: string | null; state?: "pre" | "in" | "post" | null; detail?: string | null }): Pregame | null {
  const [, tick] = useState(0);
  const kickoff = Date.parse(opts.date ?? "");
  const now = Number.isFinite(kickoff) ? pregameNow(kickoff) : Date.now();
  const p = pregameFor({ ...opts, now });
  const near = Number.isFinite(kickoff) && (opts.league === "CFB" || opts.league === "NFL") && Math.abs(kickoff - now) < 25 * 60_000;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const t = setInterval(() => !document.hidden && tick((n) => n + 1), p || near ? 1000 : 30_000);
    return () => clearInterval(t);
  }, [!!p, near]);
  return p;
}
