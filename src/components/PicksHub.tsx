import { Suspense, useEffect, useState } from "react";
import type { League } from "../data";
import { lazyView } from "../lazyView";
import { pointRatingsAtTracker } from "../openTeam";
import { Skeleton } from "./Skeleton";
import { PicksTab } from "./PicksTab";

const SimTab = lazyView(() => import("../sim/SimTab"), "SimTab");
const UpsetMeter = lazyView(() => import("./UpsetMeter").then((m) => ({ default: m.UpsetMeter })), "UpsetMeter");
const SpPlusTab = lazyView(() => import("../spplus/SpPlusTab"), "SpPlusTab");
const NflTab = lazyView(() => import("../nfl/NflTab"), "NflTab");

export type PicksPart = "picks" | "sim" | "upset" | "tracker";
const PARTS: { id: PicksPart; label: string }[] = [
  { id: "picks", label: "Picks & parlays" },
  { id: "sim", label: "Simulator" },
  { id: "upset", label: "Upset Alert Meter" },
  { id: "tracker", label: "Full ATS tracker" },
];

/** Everything for the betting and what-if side in one tab: the picks and parlays, the game simulator, the Upset Alert Meter and the full team-by-team ATS tracker. */
export function PicksHub({ defaultLeague, start = "picks" }: { defaultLeague: League; start?: PicksPart }) {
  const [part, setPart] = useState<PicksPart>(start);
  const [lg, setLg] = useState<"CFB" | "NFL">(defaultLeague === "CFB" ? "CFB" : "NFL");
  useEffect(() => { if (part === "tracker") pointRatingsAtTracker(lg); }, [part, lg]);
  return (
    <div className="ph">
      <div className="segmented ph-parts" role="group" aria-label="Picks area">
        {PARTS.map((p) => <button key={p.id} type="button" aria-pressed={part === p.id} onClick={() => setPart(p.id)}>{p.label}</button>)}
      </div>
      <Suspense fallback={<Skeleton rows={4} />}>
        {part === "picks" ? <PicksTab defaultLeague={defaultLeague} />
          : part === "sim" ? <SimTab defaultLeague={defaultLeague} />
          : part === "upset" ? <UpsetMeter defaultLeague={defaultLeague} />
          : (
            <>
              <div className="segmented" role="group" aria-label="Tracker league">
                <button type="button" aria-pressed={lg === "CFB"} onClick={() => setLg("CFB")}>College SP+</button>
                <button type="button" aria-pressed={lg === "NFL"} onClick={() => setLg("NFL")}>NFL+</button>
              </div>
              {lg === "NFL" ? <NflTab /> : <SpPlusTab />}
            </>
          )}
      </Suspense>
    </div>
  );
}
