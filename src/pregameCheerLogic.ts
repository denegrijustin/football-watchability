import type { BandPoint } from "./bandLogo";

/** Pure choreography for the NFL pregame cheerleaders: where the squad stands in each routine, and which routine is on at a moment. */
export const CHEER_N = 16;
export const ROUTINE_MS = 12_000;
export const ENTER_MS = 12_000;
export const EXIT_LEAD_MS = 25_000;
export const SPEED = 2.4; // field units per second while running, so a long run takes longer than a short one

export const line = (y: number, n: number, x0: number, x1: number): BandPoint[] => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y]);
const ring = (cx: number, cy: number, rx: number, ry: number, n: number): BandPoint[] => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * 2 * Math.PI), cy + ry * Math.sin((i / n) * 2 * Math.PI)]);

/** Every routine places all sixteen on the field, spaced at least two units apart. */
export const ROUTINES: { name: string; pts: BandPoint[] }[] = [
  { name: "two lines", pts: [...line(24, 8, 26, 94), ...line(31, 8, 26, 94)] },
  { name: "V formation", pts: Array.from({ length: CHEER_N }, (_, i) => [60 + (i % 2 ? 1 : -1) * (Math.floor(i / 2) + 1) * 4.2, 10 + (Math.floor(i / 2) + 1) * 2.6] as BandPoint) },
  { name: "circle at midfield", pts: [...ring(60, 20, 9, 7, 10), ...ring(60, 20, 4, 3, 6)] },
  { name: "two columns", pts: [...Array.from({ length: 8 }, (_, i) => [50, 6 + i * 4] as BandPoint), ...Array.from({ length: 8 }, (_, i) => [70, 6 + i * 4] as BandPoint)] },
  { name: "four pods", pts: [30, 50, 70, 90].flatMap((x, k) => [[x - 2.4, 14 + (k % 2) * 10], [x + 2.4, 14 + (k % 2) * 10], [x - 2.4, 22 + (k % 2) * 10], [x + 2.4, 22 + (k % 2) * 10]] as BandPoint[]) },
  { name: "diamond", pts: [...ring(60, 20, 20, 12, 12), ...ring(60, 20, 8, 5, 4)] },
];
export const CHEER_ENTRANCE: BandPoint[] = Array.from({ length: CHEER_N }, (_, i) => [34 + (i % 8) * 7.5, 44 + Math.floor(i / 8) * 1.4]);
export const exitSpots = (pts: BandPoint[]): BandPoint[] => pts.map(([x], i) => [x, 45 + (i % 2) * 1.2]);

/** Which routine is on (or "enter" / "exit") at a moment, from the clock alone. */
export function cheerCue(elapsed: number, msLeftInShow: number): { phase: "enter" | "routine" | "exit"; index: number } {
  if (msLeftInShow <= EXIT_LEAD_MS) return { phase: "exit", index: 0 };
  if (elapsed < ENTER_MS) return { phase: "enter", index: 0 };
  return { phase: "routine", index: Math.floor((elapsed - ENTER_MS) / ROUTINE_MS) % ROUTINES.length };
}

