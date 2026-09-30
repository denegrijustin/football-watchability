export type LedgerGame = {
  id: string;
  league: "NFL" | "CFB";
  week: string;
  date: string;
  matchup: string;
  away: { abbr: string; logoId: string; score: number };
  home: { abbr: string; logoId: string; score: number };
  insanity: number;
  tier: "calm" | "restless" | "wild" | "unhinged" | "witching";
  flips: number;
  swing: number;
  comebackFrom: number | null;
  overtime: boolean;
  witchingPeriod: number | null;
};

/** Most insane first; ties go to the bigger swing, then the later game. */
export const rankGames = (games: LedgerGame[]) =>
  [...games].sort((a, b) => b.insanity - a.insanity || b.swing - a.swing || b.date.localeCompare(a.date));

export type WeekSummary = {
  week: string;
  /** Earliest kickoff, for ordering weeks. */
  start: string;
  games: number;
  /** Mean insanity across the week's games. */
  avg: number;
  /** Games at Unhinged or Witching hour. */
  wild: number;
  top: LedgerGame;
};

/** One row per week, newest first. */
export function weekSummaries(games: LedgerGame[]): WeekSummary[] {
  const by = new Map<string, LedgerGame[]>();
  for (const g of games) by.set(g.week, [...(by.get(g.week) ?? []), g]);
  return [...by]
    .map(([week, gs]) => ({
      week,
      start: gs.reduce((m, g) => (g.date < m ? g.date : m), gs[0].date),
      games: gs.length,
      avg: Math.round((gs.reduce((a, g) => a + g.insanity, 0) / gs.length) * 10) / 10,
      wild: gs.filter((g) => g.tier === "unhinged" || g.tier === "witching").length,
      top: rankGames(gs)[0],
    }))
    .sort((a, b) => b.start.localeCompare(a.start));
}

/** The week with the highest average insanity (ties: the one with more wild games). */
export const mostInsaneWeek = (weeks: WeekSummary[]) =>
  weeks.length ? [...weeks].sort((a, b) => b.avg - a.avg || b.wild - a.wild || b.start.localeCompare(a.start))[0] : null;
