// An upset: the team ranked lower by SP+ (college) or NFL+ (NFL) (the bigger rank number) is winning, or won, against a team ranked at least MIN_UPSET_GAP places higher.
// Pure (no site data) so tests can use it.
/** The lower-ranked team winning only counts as an upset when the teams are at least this many places apart; #12 against #14 is a toss-up. */
export const MIN_UPSET_GAP = 10;

export type Upset = { winner: number; gap: number };

/** `fpis` are the two teams' SP+ or NFL+ ranks (away, home) and `scores` their scores. Needs both ranks, someone ahead, and the teams at least MIN_UPSET_GAP places apart. */
export function upsetBy(fpis: (number | null | undefined)[], scores: [number, number]): Upset | null {
  const [a, b] = fpis;
  if (a == null || b == null || scores[0] === scores[1]) return null;
  const winner = scores[0] > scores[1] ? 0 : 1;
  const w = winner === 0 ? a : b;
  const l = winner === 0 ? b : a;
  return w - l >= MIN_UPSET_GAP ? { winner, gap: w - l } : null;
}
