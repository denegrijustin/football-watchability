// Which live games have an upset brewing as they head into the final stretch (the 4th quarter or overtime), and how close each is to final.
// The Games board lists them first, and so does the Upsets tab.
import { useMemo } from "react";
import { results, slate } from "./data";
import { useLiveMap } from "./live";
import { plusRankFor, usePlusRanks, type TeamRef } from "./plusRanks";
import { inFinalStretch, secondsLeft } from "./closing";
import { buildRows, type MeterRow } from "./upsetMeter";

/** espnId -> seconds left, for live games whose upset is brewing in the final stretch. */
export function useClosingUpsets(): Map<string, number> {
  const live = useLiveMap();
  const plus = usePlusRanks();
  return useMemo(() => {
    const out = new Map<string, number>();
    if (!plus) return out;
    for (const league of ["NFL", "CFB"] as const) {
      const of = league === "NFL" ? plus.nfl.of : plus.cfb.of;
      const rows: MeterRow[] = buildRows({
        league, games: slate.games as never, results: results as never, live, period: slate.period,
        ranks: { of, rankOf: (t) => plusRankFor(plus, league, t as TeamRef)?.n ?? null },
      });
      for (const r of rows) {
        if (r.status !== "live" || !r.brewing || !r.espnId || !inFinalStretch(r.detail)) continue;
        out.set(r.espnId, secondsLeft(r.detail) ?? 0);
      }
    }
    return out;
  }, [live, plus]);
}
