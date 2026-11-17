import { useState } from "react";
import { C, inkOn, TipView, centreIn, useTip, useWidth } from "./kit";

export interface HeatCell { value: number | null; text: string; tip?: [string, string][] }
export interface HeatRow { id: string; label: string; cells: HeatCell[] }

/** value 0..100 -> a one-hue ramp that starts near the surface and brightens. */
export const heatColor = (v: number): string => {
  const t = Math.max(0, Math.min(1, v / 100));
  const lo = [48, 68, 104], hi = [134, 182, 239];
  return `rgb(${lo.map((c, i) => Math.round(c + (hi[i] - c) * t)).join(",")})`;
};

const PHONE_WEEKS = 8;
export function Heatmap({ rows: allRows, cols: allCols, ariaLabel, cellH: baseH = 34, labelW = 124, rowTitle }: { rows: HeatRow[]; cols: string[]; ariaLabel: string; cellH?: number; labelW?: number; rowTitle: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const [showAll, setShowAll] = useState(false);
  const w = Math.max(width, 300);
  const narrow = w < 480;
  // A phone has room for about eight readable columns, so it opens on the latest weeks and offers the rest.
  const skip = narrow && !showAll && allCols.length > PHONE_WEEKS ? allCols.length - PHONE_WEEKS : 0;
  const cols = allCols.slice(skip);
  const rows = skip ? allRows.map((r) => ({ ...r, cells: r.cells.slice(skip) })) : allRows;
  const cellH = narrow ? Math.max(baseH, 38) : baseH;
  const lw = narrow ? 92 : labelW;
  const cw = (w - lw) / cols.length;
  const h = 26 + rows.length * cellH;
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} onPointerLeave={hide}>
        {cols.map((c, i) => <text key={c} x={lw + cw * i + cw / 2} y={15} textAnchor="middle" className="lbl">{cw < 46 ? c.replace(/^Wk /, "") : c}</text>)}
        <text x={0} y={15} className="lbl" style={{ fontSize: 10 }}>{narrow ? `${rowTitle} · week` : rowTitle}</text>
        {rows.map((r, ri) => (
          <g key={r.id}>
            <text x={0} y={26 + ri * cellH + cellH / 2 + 4} style={{ fill: C.ink, fontSize: narrow ? 12 : 13, fontWeight: 600 }}>{r.label}</text>
            {r.cells.map((cell, ci) => {
              const x = lw + cw * ci, y = 26 + ri * cellH;
              return (
                <g key={ci} className="pt" tabIndex={0} role="img" aria-label={`${r.label}, ${cols[ci]}: ${cell.text}${cell.value != null ? `, ${cell.value}th percentile` : ""}`}
                  onPointerEnter={() => show({ x: x + cw / 2, y, title: `${r.label} · ${cols[ci]}`, rows: cell.tip ?? [["Value", cell.text]] })}
                  onFocus={(e) => { const p = centreIn(ref.current, e.currentTarget); show({ x: p.x, y: p.y, title: `${r.label} · ${cols[ci]}`, rows: cell.tip ?? [["Value", cell.text]] }); }}
                  onBlur={hide}>
                  <rect x={x + 2} y={y + 2} width={Math.max(cw - 4, 1)} height={cellH - 4} rx={6} fill={cell.value == null ? "transparent" : heatColor(cell.value)} stroke={cell.value == null ? C.axis : "none"} strokeDasharray={cell.value == null ? "3 3" : undefined} />
                  <text x={x + cw / 2} y={y + cellH / 2 + 4} textAnchor="middle" style={{ fill: cell.value != null ? inkOn(heatColor(cell.value)) : C.ink, fontWeight: 700, fontSize: cw < 30 ? 10 : 12.5 }}>{cw < 34 ? cell.text.replace(/^#/, "") : cell.text}</text>
                  <rect className="ring" x={x + 2} y={y + 2} width={Math.max(cw - 4, 1)} height={cellH - 4} rx={6} fill="none" />
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <TipView tip={tip} width={w} />
      {narrow && allCols.length > PHONE_WEEKS && <button type="button" className="btn small" style={{ marginTop: 8 }} aria-pressed={showAll} onClick={() => setShowAll((v) => !v)}>{showAll ? `Show the latest ${PHONE_WEEKS} weeks` : `Show all ${allCols.length} weeks`}</button>}
    </div>
  );
}

export function HeatScale() {
  return (
    <div className="legend" aria-label="Color scale">
      <span>Lower</span>
      <span style={{ width: 120, height: 10, borderRadius: 3, background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(50)}, ${heatColor(100)})` }} />
      <span>Higher percentile</span>
      <span><i style={{ background: "transparent", border: `1px dashed ${C.muted}` }} />No data</span>
    </div>
  );
}
