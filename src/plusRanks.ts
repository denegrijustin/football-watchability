/** The national SP+ (college) and NFL+ (NFL) rank of a team, for the game cards and the ticker. One small file, fetched once per page. */
import { useEffect, useState } from "react";
import { fetchData } from "./data/load";
import type { PlusRanks } from "./plusRanksBuild";

export type { PlusRanks };
export type TeamRef = { abbr?: string; logoId?: string; espnId?: string | null; name?: string };
/** `n` is the overall rank; `o` and `d` are the offense and defense ranks (1 = best) when known. */
export type PlusRank = { n: number; of: number; kind: "SP+" | "NFL+"; o?: number; d?: number };

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
    const od = t.abbr ? ranks.nfl.od?.[t.abbr] : undefined;
    return n ? { n, of: ranks.nfl.of, kind: "NFL+", o: od?.[0], d: od?.[1] } : null;
  }
  const c = ranks.cfb, nm = t.name?.toLowerCase();
  const n = (t.logoId && c.byLogo[t.logoId]) || (t.espnId && c.byEspn[t.espnId]) || (nm && c.byName?.[nm]) || undefined;
  const od = (t.logoId && c.od?.byLogo[t.logoId]) || (t.espnId && c.od?.byEspn[t.espnId]) || (nm && c.od?.byName[nm]) || undefined;
  return n ? { n, of: c.of, kind: "SP+", o: od?.[0], d: od?.[1] } : null;
}

const ord = (n: number) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;
export const plusRankTitle = (r: PlusRank) =>
  `${r.kind} rank: ${ord(r.n)} of ${r.of}${r.kind === "SP+" ? " FBS teams" : " teams (EPA-based ratings)"}${r.o ? ` · offense ${ord(r.o)}` : ""}${r.d ? ` · defense ${ord(r.d)}` : ""}`;
