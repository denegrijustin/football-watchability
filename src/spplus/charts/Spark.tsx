import { C } from "./kit";

/** Tiny trend line for table rows. Gaps in the data break the line. */
export function Spark({ values, w = 96, h = 24, label, invert }: { values: (number | null)[]; w?: number; h?: number; label: string; invert?: boolean }) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <span className="muted">—</span>;
  const lo = Math.min(...nums), hi = Math.max(...nums), span = hi - lo || 1;
  const x = (i: number) => 3 + (i * (w - 6)) / (values.length - 1);
  const y = (v: number) => (invert ? 3 + ((v - lo) / span) * (h - 6) : h - 3 - ((v - lo) / span) * (h - 6));
  let d = "";
  values.forEach((v, i) => { if (v == null) return; d += `${d && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  const last = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
  return (
    <svg width={w} height={h} role="img" aria-label={label}>
      <path d={d} fill="none" stroke={C.s[0]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(values[last]!)} r={3} fill={C.s[0]} stroke={C.surface} strokeWidth={2} />
    </svg>
  );
}
