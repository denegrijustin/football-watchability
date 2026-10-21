import { navigateNfl } from "../../nfl/store";
import { navigate as navigateSp } from "../../spplus/store";
import type { PerfLeague } from "../types";

/** Switch the section to its Drives tab. The game and drive to show are already in the shared selection (sel.game, sel.metric). */
export function openDrivesTab(league: PerfLeague) {
  if (league === "nfl") navigateNfl({ view: "p-drives" });
  else navigateSp({ view: "p-drives" });
}
