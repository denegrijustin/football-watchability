/** The overall column: the average rank as a number, with a bar that is fuller the better (lower) the average. */
export function AvgBar({ value, n, text }: { value: number | null; n: number; text?: string }) {
  if (value == null) return <span className="muted">—</span>;
  const share = n > 1 ? Math.max(0.03, Math.min(1, (n - value) / (n - 1))) : 1;
  return (
    <div className="rbar" role="img" aria-label={`Average rank ${value}`} title={text}>
      <i style={{ left: 0, width: `${share * 100}%`, right: "auto", borderRadius: 3 }} />
      <b className="num">{value.toFixed(1)}</b>
    </div>
  );
}
