import { C, TipView, centreIn, useTip, useWidth } from "./kit";

export interface HeatCell { value: number | null; text: string; tip?: [string, string][] }
export interface HeatRow { id: string; label: string; cells: HeatCell[] }

/** value 0..100 -> a one-hue ramp that starts near the surface and brightens. */
export const heatColor = (v: number): string => {
  const t = Math.max(0, Math.min(1, v / 100));
  const lo = [31, 45, 66], hi = [134, 182, 239];
  return `rgb(${lo.map((c, i) => Math.round(c + (hi[i] - c) * t)).join(",")})`;
};

export function Heatmap({ rows, cols, ariaLabel, cellH = 34, labelW = 124, rowTitle }: { rows: HeatRow[]; cols: string[]; ariaLabel: string; cellH?: number; labelW?: number; rowTitle: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const w = Math.max(width, 300);
  const lw = w < 480 ? 96 : labelW;
  const cw = (w - lw) / cols.length;
  const h = 22 + rows.length * cellH;
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} onPointerLeave={hide}>
        {cols.map((c, i) => <text key={c} x={lw + cw * i + cw / 2} y={13} textAnchor="middle" className="lbl">{cw < 46 ? c.replace(/^Wk /, "") : c}</text>)}
        <text x={0} y={13} className="lbl" style={{ fontSize: 10 }}>{rowTitle}</text>
        {rows.map((r, ri) => (
          <g key={r.id}>
            <text x={0} y={22 + ri * cellH + cellH / 2 + 4} style={{ fill: C.ink2 }}>{r.label}</text>
            {r.cells.map((cell, ci) => {
              const x = lw + cw * ci, y = 22 + ri * cellH;
              return (
                <g key={ci} className="pt" tabIndex={0} role="img" aria-label={`${r.label}, ${cols[ci]}: ${cell.text}${cell.value != null ? `, ${cell.value}th percentile` : ""}`}
                  onPointerEnter={() => show({ x: x + cw / 2, y, title: `${r.label} · ${cols[ci]}`, rows: cell.tip ?? [["Value", cell.text]] })}
                  onFocus={(e) => { const p = centreIn(ref.current, e.currentTarget); show({ x: p.x, y: p.y, title: `${r.label} · ${cols[ci]}`, rows: cell.tip ?? [["Value", cell.text]] }); }}
                  onBlur={hide}>
                  <rect x={x + 1} y={y + 1} width={Math.max(cw - 2, 1)} height={cellH - 2} rx={4} fill={cell.value == null ? "transparent" : heatColor(cell.value)} stroke={cell.value == null ? C.axis : "none"} strokeDasharray={cell.value == null ? "3 3" : undefined} />
                  <text x={x + cw / 2} y={y + cellH / 2 + 4} textAnchor="middle" style={{ fill: cell.value != null && cell.value > 58 ? "#0d0d0d" : C.ink, fontWeight: 600, fontSize: cw < 38 ? 9.5 : 12 }}>{cell.text}</text>
                  <rect className="ring" x={x + 1} y={y + 1} width={Math.max(cw - 2, 1)} height={cellH - 2} rx={4} fill="none" />
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <TipView tip={tip} width={w} />
    </div>
  );
}

export function HeatScale() {
  return (
    <div className="legend" aria-label="Color scale">
      <span>Lower</span>
      <span style={{ width: 120, height: 10, borderRadius: 3, background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(50)}, ${heatColor(100)})` }} />
      <span>Higher percentile</span>
      <span><i style={{ background: "transparent", border: `1px dashed ${C.muted}` }} />Not in the sheet</span>
    </div>
  );
}
