/**
 * The fraud meter: how many wins a team's record is hiding (positive) or faking (negative) over the rest of the season.
 * A typical team with the same record is expected to win (wins + 6) / (games + 12) of what is left (its record counts a little, and the
 * rest is a coin flip); the team's own number is the simulated final win total from the playoff simulation. The gap between the two
 * is the meter.
 */
export interface FraudIn { id: string; name: string; abbr: string; logoId: string | null; record: string; expW: number }
export interface FraudRow extends FraudIn {
  w: number; l: number; t: number;
  /** Final wins a typical team with this record would be expected to reach. */
  typical: number;
  /** Wins vs a typical team with the same record: positive is better than the record, negative is worse. */
  gap: number;
  /** The projected final record, whole games, as "10-7". */
  finish: string;
}

export const SEASON_GAMES = 17;

export function fraudRows(teams: FraudIn[], games = SEASON_GAMES): FraudRow[] {
  return teams
    .map((t) => {
      const [w = 0, l = 0, tie = 0] = t.record.split("-").map(Number);
      const played = w + l + tie, wins = w + tie / 2, rest = Math.max(0, games - played);
      const typical = wins + (rest * (wins + 6)) / (played + 12);
      const gap = Math.round((t.expW - typical) * 100) / 100;
      const proj = Math.round(t.expW);
      return { ...t, w, l, t: tie, typical: Math.round(typical * 10) / 10, gap, finish: `${proj}-${Math.max(0, games - proj)}` };
    })
    .sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name));
}
