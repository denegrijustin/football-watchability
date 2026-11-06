/**
 * The ratings tables' overall number: the average of a team's ranks (offense, defense, special teams and strength of schedule), lower is better, and
 * where that average puts the team among all the teams. Pure, so the college and NFL tables and the tests share it.
 */

/** Strength of schedule: the average rating of the opponents a team has played; rank 1 is the hardest schedule (the strongest opponents). */
export function strengthOfSchedule(opponents: Map<string, string[]>, rating: Map<string, number>): Map<string, { avg: number; rank: number; games: number }> {
  const raw: { team: string; avg: number; games: number }[] = [];
  for (const [team, opps] of opponents) {
    const rs = opps.map((o) => rating.get(o)).filter((x): x is number => x != null);
    if (rs.length) raw.push({ team, avg: rs.reduce((a, b) => a + b, 0) / rs.length, games: rs.length });
  }
  raw.sort((a, b) => b.avg - a.avg || a.team.localeCompare(b.team));
  return new Map(raw.map((r, i) => [r.team, { avg: Math.round(r.avg * 100) / 100, rank: i + 1, games: r.games }]));
}

/** The average of the ranks a team has (at least two), to one decimal, and each team's rank by that average (1 is the best average; ties share the lower rank). */
export function averageRanks(ranks: Map<string, (number | null | undefined)[]>): Map<string, { avg: number; rank: number; parts: number }> {
  const raw: { team: string; avg: number; parts: number }[] = [];
  for (const [team, rs] of ranks) {
    const ks = rs.filter((x): x is number => x != null);
    if (ks.length >= 2) raw.push({ team, avg: Math.round((ks.reduce((a, b) => a + b, 0) / ks.length) * 10) / 10, parts: ks.length });
  }
  const sorted = [...raw].sort((a, b) => a.avg - b.avg || a.team.localeCompare(b.team));
  const out = new Map<string, { avg: number; rank: number; parts: number }>();
  sorted.forEach((r, i) => out.set(r.team, { avg: r.avg, rank: i > 0 && sorted[i - 1].avg === r.avg ? out.get(sorted[i - 1].team)!.rank : i + 1, parts: r.parts }));
  return out;
}
