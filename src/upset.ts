// An upset: the team ranked lower by ESPN FPI (the bigger rank number) is winning, or won, against the higher-ranked one.
// Pure (no site data) so tests can use it.
export type Upset = { winner: number; gap: number };

/** `fpis` are the two teams' FPI ranks (away, home) and `scores` their scores. Needs both ranks and someone ahead. */
export function upsetBy(fpis: (number | null | undefined)[], scores: [number, number]): Upset | null {
  const [a, b] = fpis;
  if (a == null || b == null || scores[0] === scores[1]) return null;
  const winner = scores[0] > scores[1] ? 0 : 1;
  const w = winner === 0 ? a : b;
  const l = winner === 0 ? b : a;
  return w > l ? { winner, gap: w - l } : null;
}
