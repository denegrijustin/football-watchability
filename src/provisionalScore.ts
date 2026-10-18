import { actualScore, tierFor } from "../scripts/score.mjs";
import { slate } from "./data";

export type Provisional = { score: number; tier: string; label: string };

/**
 * A game that has just ended is not scored for real until the refresh archives it (the refresh has the scoring plays and the
 * stored forecast). Until then this gives the same "actual" score the refresh would, from what the page already has: the final
 * score, the win-probability line (0 to 100, home team, per play) and the forecast's own parts. Scoring plays are not needed once
 * the win-probability line is long enough; without them the last digit can differ a little, which is why callers call it provisional.
 */
export function provisionalActual(espnId: string, score: { away: number; home: number }, wp: readonly (readonly unknown[])[] | null | undefined, overtime = false): Provisional | null {
  const g = slate.games.find((x) => x.espnId === espnId);
  if (!g || !wp || wp.length < 20) return null;
  const [tA, tH] = g.teams as unknown as { name: string; record?: string }[];
  const parts = ((g as { breakdown?: { parts?: { id: string }[] } }).breakdown?.parts ?? []) as never[];
  const pHome = (g as { winProb?: { home?: number } }).winProb?.home;
  if (pHome == null) return null;
  const hasFcs = (parts as { id: string }[]).some((p) => p.id === "fcs");
  const r = actualScore({
    league: g.league,
    awayScore: score.away,
    homeScore: score.home,
    overtime,
    wp: wp.map((w) => [(w[0] as number) / 100, (w[1] ?? null) as number | null] as [number, number | null]),
    pHome: pHome / 100,
    nameA: g.league === "NFL" ? tA.name.split(" ").pop()! : tA.name,
    nameH: g.league === "NFL" ? tH.name.split(" ").pop()! : tH.name,
    forecastParts: parts,
    fcsA: hasFcs && !!tA.record?.includes("FCS"),
    fcsH: hasFcs && !!tH.record?.includes("FCS"),
  });
  const t = tierFor(r.score);
  return { score: r.score, tier: t[0], label: t[2] };
}
