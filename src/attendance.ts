/**
 * Attendance as a share of stadium capacity, for the bar on completed game cards.
 * Returns null when there is no attendance to show (missing or zero), and no
 * percentage when the capacity isn't known: it is never guessed.
 */
export type AttendanceView = {
  attendance: number;
  capacity: number | null;
  /** Share of capacity, one decimal; can pass 100 with standing room. Null without a capacity. */
  pct: number | null;
  /** Bar fill, 0–100. */
  fill: number | null;
  level: "low" | "mid" | "high" | null;
};

export function attendanceView(attendance: number | null | undefined, capacity: number | null | undefined): AttendanceView | null {
  if (!attendance || !Number.isFinite(attendance) || attendance <= 0) return null;
  const cap = capacity && Number.isFinite(capacity) && capacity > 0 ? capacity : null;
  if (!cap) return { attendance, capacity: null, pct: null, fill: null, level: null };
  const pct = Math.round((attendance / cap) * 1000) / 10;
  return { attendance, capacity: cap, pct, fill: Math.min(100, pct), level: pct >= 90 ? "high" : pct >= 60 ? "mid" : "low" };
}
