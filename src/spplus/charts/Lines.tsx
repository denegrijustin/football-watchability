import { useMemo, useState } from "react";
import { C, Legend as _L, TipView, niceTicks, useTip, useWidth } from "./kit";

export interface LineSeries { id: string; label: string; color: string; values: (number | null)[]; dash?: boolean }

interface Props {
  xs: number[];
  xLabel: (x: number) => string;
  series: LineSeries[];
  height?: number;
  invertY?: boolean;
  yDomain?: [number, number];
  yTicks?: number[];
  yFormat?: (v: number) => string;
  yTitle: string;
  /** Text inside each point (bump chart ranks). */
  pointText?: (v: number, s: LineSeries, xi: number) => string;
  refY?: { v: number; label: string };
  endLabels?: boolean;
  activeId: string | null;
  pickedId?: string | null;
  onActive: (id: string | null) => void;
  onPick?: (id: string) => void;
  tipRows: (xi: number, s: LineSeries) => [string, string][];
  ariaLabel: string;
}

/** Multi-series line chart over weeks: bump chart (inverted rank axis) or rating trend. */
export function LinesChart(p: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const narrow = width < 520;
  const m = { t: 28, r: p.endLabels ? (narrow ? 84 : 132) : 16, b: 28, l: 42 };
  const h = p.height ?? 360;
  const w = Math.max(width, 280);
  const all = p.series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const [lo, hi] = p.yDomain ?? (all.length ? [Math.min(...all), Math.max(...all)] : [0, 1]);
  const pad = p.yDomain ? 0 : (hi - lo) * 0.06 || 1;
  const d0 = lo - pad, d1 = hi + pad;
  const x = (i: number) => m.l + (p.xs.length < 2 ? 0 : (i * (w - m.l - m.r)) / (p.xs.length - 1));
  const y = (v: number) => {
    const f = (v - d0) / (d1 - d0);
    return p.invertY ? m.t + f * (h - m.t - m.b) : h - m.b - f * (h - m.t - m.b);
  };
  const ticks = p.yTicks ?? niceTicks(d0, d1, 5);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const path = (s: LineSeries) => {
    let d = "";
    s.values.forEach((v, i) => { if (v == null) return; d += `${d && s.values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
    return d;
  };
  const order = useMemo(() => [...p.series].sort((a, b) => (a.id === p.activeId ? 1 : 0) - (b.id === p.activeId ? 1 : 0) || (a.id === p.pickedId ? 1 : 0) - (b.id === p.pickedId ? 1 : 0)), [p.series, p.activeId, p.pickedId]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let xi = Math.round(((px - m.l) / Math.max(1, w - m.l - m.r)) * (p.xs.length - 1));
    xi = Math.max(0, Math.min(p.xs.length - 1, xi));
    let best: LineSeries | null = null, bd = Infinity;
    for (const s of p.series) { const v = s.values[xi]; if (v == null) continue; const dd = Math.abs(y(v) - py); if (dd < bd) { bd = dd; best = s; } }
    setHoverX(xi);
    if (best && bd < 40) {
      p.onActive(best.id);
      show({ x: x(xi), y: y(best.values[xi]!), title: best.label, swatch: best.color, rows: [[p.xLabel(p.xs[xi]), ""], ...p.tipRows(xi, best)] });
    } else { p.onActive(null); hide(); }
  };
  const leave = () => { setHoverX(null); p.onActive(null); hide(); };

  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={p.ariaLabel} onPointerMove={onMove} onPointerLeave={leave} onPointerDown={(e) => { onMove(e); }} style={{ touchAction: "pan-y" }}
        onClick={() => { if (p.activeId && p.onPick) p.onPick(p.activeId); }}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={m.l - 6} y={y(t) + 4} textAnchor="end">{(p.yFormat ?? String)(t)}</text>)}
          {p.xs.map((xv, i) => <text key={xv} x={x(i)} y={h - 8} textAnchor="middle">{narrow ? p.xLabel(xv).replace(/^Wk /, "") : p.xLabel(xv)}</text>)}
          <text x={4} y={10} className="lbl" style={{ fontSize: 10 }}>{p.yTitle}</text>
        </g>
        {p.refY && <g><line x1={m.l} x2={w - m.r} y1={y(p.refY.v)} y2={y(p.refY.v)} stroke={C.muted} strokeDasharray="4 4" /><text x={w - m.r - 2} y={y(p.refY.v) - 4} textAnchor="end" className="lbl" style={{ fontSize: 10 }}>{p.refY.label}</text></g>}
        {hoverX != null && <line x1={x(hoverX)} x2={x(hoverX)} y1={m.t} y2={h - m.b} stroke={C.axis} strokeDasharray="3 3" />}
        {order.map((s) => {
          const on = s.id === p.activeId || s.id === p.pickedId;
          const dim = (p.activeId || p.pickedId) && !on;
          return (
            <g key={s.id} opacity={dim ? 0.22 : 1}>
              <path d={path(s)} fill="none" stroke={s.color} strokeWidth={on ? 3 : 2} strokeDasharray={s.dash ? "5 4" : undefined} strokeLinecap="round" strokeLinejoin="round" />
              {s.values.map((v, i) => v == null ? null : p.pointText ? (
                <g key={i}><circle cx={x(i)} cy={y(v)} r={String(p.pointText(v, s, i)).length > 2 ? 11 : on ? 10 : 8} fill={s.color} stroke={C.surface} strokeWidth={2} /><text x={x(i)} y={y(v) + 3.5} textAnchor="middle" style={{ fill: "#0d0d0d", fontSize: 9.5, fontWeight: 700 }}>{p.pointText(v, s, i)}</text></g>
              ) : (
                <circle key={i} cx={x(i)} cy={y(v)} r={on ? 4.5 : 3.5} fill={s.color} stroke={C.surface} strokeWidth={2} />
              ))}
              {p.endLabels && (() => {
                const li = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v != null);
                const v = s.values[li];
                if (v == null || li < 0) return null;
                const name = narrow && s.label.length > 11 ? `${s.label.slice(0, 10)}…` : s.label;
                return <text x={x(li) + 14} y={y(v) + 4} style={{ fill: on ? C.ink : C.ink2, fontWeight: on ? 700 : 400 }}>{name}</text>;
              })()}
            </g>
          );
        })}
      </svg>
      <TipView tip={tip} width={w} />
    </div>
  );
}

/** Legend buttons: keyboard- and touch-friendly way to pick a line. */
export function SeriesPicker({ series, activeId, pickedId, onPick, onActive }: { series: LineSeries[]; activeId: string | null; pickedId?: string | null; onPick: (id: string) => void; onActive: (id: string | null) => void }) {
  return (
    <div className="legend" role="group" aria-label="Lines">
      {series.map((s) => (
        <button key={s.id} type="button" className="btn small ghost" style={{ height: 28, padding: "0 6px", color: s.id === activeId || s.id === pickedId ? C.ink : undefined, borderColor: s.id === pickedId ? s.color : "transparent" }} aria-pressed={s.id === pickedId} onClick={() => onPick(s.id)} onMouseEnter={() => onActive(s.id)} onMouseLeave={() => onActive(null)} onFocus={() => onActive(s.id)} onBlur={() => onActive(null)}>
          <i style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} /> {s.label}
        </button>
      ))}
    </div>
  );
}
