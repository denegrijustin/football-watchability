import { useState } from "react";
import type { League } from "../data";
import { lazyView } from "../lazyView";
import { Suspense } from "react";
import { Skeleton } from "./Skeleton";
import { StandingsTab } from "./StandingsTab";

const Outlook = lazyView(() => import("./Outlook").then((m) => ({ default: m.Outlook })), "Outlook");

/**
 * Where the season stands and where it is going, in one place: the standings, and the playoff picture (seeds, tracker, leverage, rankings
 * and bowls: the Outlook) one tap apart.
 */
export function StandingsHub({ defaultLeague, start = "table" }: { defaultLeague: League; start?: "table" | "playoff" }) {
  const [section, setSection] = useState<"table" | "playoff">(start);
  return (
    <div className="sh">
      <div className="segmented sh-sections" role="group" aria-label="Standings sections">
        <button type="button" aria-pressed={section === "table"} onClick={() => setSection("table")}>Standings</button>
        <button type="button" aria-pressed={section === "playoff"} onClick={() => setSection("playoff")}>Playoff picture</button>
      </div>
      {section === "table" ? <StandingsTab defaultLeague={defaultLeague} /> : <Suspense fallback={<Skeleton rows={5} kind="row" />}><Outlook defaultLeague={defaultLeague} /></Suspense>}
    </div>
  );
}
