import type { WpPoint } from "./insanity";

export type Stats = { yards: number; ypp: number; firstDowns: number; turnovers: number; top: string };
const secs = (t: string) => { const [m, s] = String(t ?? "").split(":").map(Number); return Number.isFinite(m) ? m * 60 + (s || 0) : 0; };
/** Share of a two-sided total that side `b` holds, 0 to 1; an even 0.5 when neither has any. */
const share = (a: number, b: number) => (a + b > 0 ? b / (a + b) : 0.5);

/**
 * "Deserve to win": who has played the better game so far, as the home team's share 0 to 100, from the box score alone (not the scoreboard).
 * Yards per play 30%, total yards 20%, first downs 15%, takeaways 20% (fewer turnovers is better), time of possession 15%.
 * Null until about ten snaps have been run, when the numbers say nothing yet.
 */
export function deserveIndex(a?: Stats, h?: Stats): number | null {
  if (!a || !h || (a.yards + h.yards <= 0 && secs(a.top) + secs(h.top) <= 0)) return null;
  const ypp = a.ypp + h.ypp > 0 ? h.ypp / (a.ypp + h.ypp) : 0.5;
  const v = 0.3 * ypp + 0.2 * share(a.yards, h.yards) + 0.15 * share(a.firstDowns, h.firstDowns) + 0.2 * share(h.turnovers, a.turnovers) + 0.15 * share(secs(a.top), secs(h.top));
  return Math.round(v * 1000) / 10;
}

/** Recent momentum: the home win-probability change over the last 12 plays, in points (positive favours home). */
export function momentumSwing(wp: WpPoint[]): number | null {
  const pts = wp.filter((p) => Number.isFinite(p[0]));
  if (pts.length < 2) return null;
  return pts[pts.length - 1][0] - pts[Math.max(0, pts.length - 13)][0];
}

