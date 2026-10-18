export const BASE: number;
export const TIERS: [string, number, string][];
export const tierFor: (score: number) => [string, number, string];
export type ScorePart = { id: string; label: string; max: number; pts: number; note?: string };
export function actualScore(a: {
  league?: string;
  awayScore: number;
  homeScore: number;
  overtime?: boolean;
  periods?: number;
  wp?: [number, number | null][];
  plays?: { period: number; away: number; home: number }[];
  pHome: number;
  nameA: string;
  nameH: string;
  forecastParts?: ScorePart[];
  fcsA?: boolean;
  fcsH?: boolean;
}): { score: number; base: number; parts: ScorePart[] };
