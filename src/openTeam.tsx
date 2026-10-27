import type { MouseEvent, ReactNode } from "react";
import { navigate as navigateSp } from "./spplus/store";
import { navigateNfl } from "./nfl/store";
import { SHEET_TO_BOARD } from "./spplus/teamNames";

/** Other feeds spell two NFL abbreviations differently from the NFL+ tab. */
const NFL_ABBR: Record<string, string> = { LAR: "LA", WSH: "WAS" };
const BOARD_TO_SHEET = Object.fromEntries(Object.entries(SHEET_TO_BOARD).map(([sheet, board]) => [board, sheet]));

export interface TeamRef {
  league: string;
  /** The name on the board (or the SP+ sheet's name when `sheet` is set). */
  name: string;
  /** NFL teams: the abbreviation the NFL+ tab keys its teams by. */
  abbr?: string;
  /** College teams: the SP+ team id ("FBS:Ohio State"), when the caller already has it. */
  id?: string;
}

/** Points the NFL+ tab's Team view (NFL) or the SP+ tab's team profile (college) at a team, without leaving the page the caller is on. */
export function pointRatingsAt(t: TeamRef) {
  if (t.league === "NFL") {
    if (!t.abbr) return;
    navigateNfl({ view: "team", team: NFL_ABBR[t.abbr] ?? t.abbr });
  } else {
    navigateSp({ view: "team", team: t.id ?? `FBS:${BOARD_TO_SHEET[t.name] ?? t.name}` });
  }
}

/** Points the NFL+ or SP+ tab at its ATS tracker. */
export function pointRatingsAtTracker(lg: "CFB" | "NFL") {
  if (lg === "NFL") navigateNfl({ view: "ats" });
  else navigateSp({ view: "ats" });
}

const KEY = "fbwatch-team";
const listeners = new Set<() => void>();
let shown: TeamRef | null = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; } })();
/** The team the Teams tab is showing (null: the list of teams). */
export const hubTeam = () => shown;
export function setHubTeam(t: TeamRef | null) {
  shown = t;
  try { t ? sessionStorage.setItem(KEY, JSON.stringify(t)) : sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
  listeners.forEach((f) => f());
}
export function subscribeHub(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** Opens a team's page: the Teams tab, with its resumé, ratings and performance, and injuries. */
export function openTeam(t: TeamRef) {
  if (t.league === "NFL" && !t.abbr) return;
  setHubTeam(t);
  window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: "teams" }));
}

/** A team's logo or name that opens its profile. It stops the click so a card or row around it does not also open. */
export function TeamOpen({ team, children, className = "", before }: { team: TeamRef; children: ReactNode; className?: string; /** Runs first, e.g. to close the dialog the link is in. */ before?: () => void }) {
  return (
    <button type="button" className={`team-open ${className}`.trim()} title={`Open the ${team.name} team profile`} onClick={(e: MouseEvent) => { e.stopPropagation(); before?.(); openTeam(team); }}>
      {children}
    </button>
  );
}
