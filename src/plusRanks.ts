/** The national SP+ (college) and NFL+ (NFL) rank of a team, for the game cards and the ticker. One small file, fetched once per page. */
import { useEffect, useState } from "react";
import { fetchData } from "./data/load";
import type { PlusRanks } from "./plusRanksBuild";

export type { PlusRanks };
export type TeamRef = { abbr?: string; logoId?: string; espnId?: string | null };
export type PlusRank = { n: number; of: number; kind: "SP+" | "NFL+" };

let load: Promise<PlusRanks | null> | null = null;
let loaded: PlusRanks | null = null;
/** A failed load is not remembered, so the next card that asks tries again. */
export function loadPlusRanks(): Promise<PlusRanks | null> {
  if (!load) {
    load = fetchData<PlusRanks>("plus-ranks").then((r) => (loaded = r)).catch(() => {
      load = null;
      return null;
    });
  }
  return load;
}

export function usePlusRanks(): PlusRanks | null {
  const [data, setData] = useState<PlusRanks | null>(loaded);
  useEffect(() => {
    let live = true;
    if (!loaded) loadPlusRanks().then((r) => live && setData(r));
    return () => { live = false; };
  }, []);
  return data;
}

/** The team's rank among its league's teams, or null when it has none (an FCS opponent, a team the sheet does not list). */
export function plusRankFor(ranks: PlusRanks | null, league: string, t: TeamRef): PlusRank | null {
  if (!ranks) return null;
  if (league === "NFL") {
    const n = t.abbr ? ranks.nfl.byAbbr[t.abbr] : undefined;
    return n ? { n, of: ranks.nfl.of, kind: "NFL+" } : null;
  }
  const n = (t.logoId && ranks.cfb.byLogo[t.logoId]) || (t.espnId && ranks.cfb.byEspn[t.espnId]) || undefined;
  return n ? { n, of: ranks.cfb.of, kind: "SP+" } : null;
}

const ord = (n: number) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;
export const plusRankTitle = (r: PlusRank) =>
  `${r.kind} rank: ${ord(r.n)} of ${r.of}${r.kind === "SP+" ? " FBS teams" : " teams (EPA-based ratings)"}`;
