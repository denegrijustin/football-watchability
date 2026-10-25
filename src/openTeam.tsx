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

/** Opens a team's profile: the NFL+ tab's Team view for an NFL team, the SP+ tab's team profile for a college team. */
export function openTeam(t: TeamRef) {
  if (t.league === "NFL") {
    if (!t.abbr) return;
    navigateNfl({ view: "team", team: NFL_ABBR[t.abbr] ?? t.abbr });
    window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: "nfl" }));
  } else {
    navigateSp({ view: "team", team: t.id ?? `FBS:${BOARD_TO_SHEET[t.name] ?? t.name}` });
    window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: "spplus" }));
  }
}

/** A team's logo or name that opens its profile. It stops the click so a card or row around it does not also open. */
export function TeamOpen({ team, children, className = "", before }: { team: TeamRef; children: ReactNode; className?: string; /** Runs first, e.g. to close the dialog the link is in. */ before?: () => void }) {
  return (
    <button type="button" className={`team-open ${className}`.trim()} title={`Open the ${team.name} team profile`} onClick={(e: MouseEvent) => { e.stopPropagation(); before?.(); openTeam(team); }}>
      {children}
    </button>
  );
}
