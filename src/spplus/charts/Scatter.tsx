import { useState } from "react";
import { C, TipView, centreIn, niceTicks, useTip, useWidth } from "./kit";

export interface ScatterPoint {
  id: string; name: string; x: number; y: number; color: string; logo?: string;
  dim?: boolean;
  tip: [string, string][];
}

function PointMark({ p, size, selected }: { p: ScatterPoint; size: number; selected: boolean }) {
  const [bad, setBad] = useState(false);
  const showLogo = p.logo && !bad;
  return (
    <>
      {!showLogo && <circle r={size / 2 - 3} fill={p.color} stroke={C.surface} strokeWidth={2} />}
      {showLogo && <circle r={size / 2} fill={C.surface} fillOpacity={0.7} />}
      {showLogo && <image href={p.logo} x={-size / 2} y={-size / 2} width={size} height={size} onError={() => setBad(true)} />}
      <circle className="ring" r={size / 2 + 3} fill="none" stroke={selected ? C.ink : "none"} strokeWidth={2} />
    </>
  );
}

export function Scatter({ points, xTitle, yTitle, invertX, invertY, refLines, diagonal, trend, selected, onSelect, ariaLabel, height, markSize }: {
  points: ScatterPoint[]; xTitle: string; yTitle: string; invertX?: boolean; invertY?: boolean;
  refLines?: { x?: number; y?: number; label: string };
  /** y = x reference line. */
  diagonal?: string;
  trend?: { slope: number; icpt: number } | null;
  selected: string | null; onSelect: (id: string) => void; ariaLabel: string; height?: number; markSize?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const w = Math.max(width, 300);
  const h = height ?? Math.max(340, Math.min(520, Math.round(w * 0.78)));
  const m = { l: 48, r: 18, t: 16, b: 44 };
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  if (!points.length) return <p className="empty">No teams have both values.</p>;
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (diagonal) { const lo = Math.min(x0, y0), hi = Math.max(x1, y1); x0 = y0 = lo; x1 = y1 = hi; }
  const px = (x1 - x0) * 0.05 || 1, py = (y1 - y0) * 0.05 || 1;
  x0 -= px; x1 += px; y0 -= py; y1 += py;
  const fx = (v: number) => { const f = (v - x0) / (x1 - x0); return m.l + (invertX ? 1 - f : f) * (w - m.l - m.r); };
  const fy = (v: number) => { const f = (v - y0) / (y1 - y0); return invertY ? m.t + f * (h - m.t - m.b) : h - m.b - f * (h - m.t - m.b); };
  const xt = niceTicks(x0, x1, w < 520 ? 5 : 8), yt = niceTicks(y0, y1, 6);
  const size = markSize ?? (points.length > 80 ? 20 : 26);
  const ordered = [...points].sort((a, b) => (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0) || (a.dim ? 0 : 1) - (b.dim ? 0 : 1));
  const anyDim = points.some((p) => p.dim);
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={ariaLabel} onPointerLeave={hide}>
        <g className="grid">{xt.map((t) => <line key={`x${t}`} x1={fx(t)} x2={fx(t)} y1={m.t} y2={h - m.b} />)}{yt.map((t) => <line key={`y${t}`} x1={m.l} x2={w - m.r} y1={fy(t)} y2={fy(t)} />)}</g>
        <g className="axis">
          {xt.map((t) => <text key={`xt${t}`} x={fx(t)} y={h - m.b + 14} textAnchor="middle">{t}</text>)}
          {yt.map((t) => <text key={`yt${t}`} x={m.l - 6} y={fy(t) + 4} textAnchor="end">{t}</text>)}
          <text x={(m.l + w - m.r) / 2} y={h - 6} textAnchor="middle" style={{ fill: C.ink2 }}>{xTitle}</text>
          <text x={12} y={(m.t + h - m.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(m.t + h - m.b) / 2})`} style={{ fill: C.ink2 }}>{yTitle}</text>
        </g>
        {refLines?.x != null && <line x1={fx(refLines.x)} x2={fx(refLines.x)} y1={m.t} y2={h - m.b} stroke={C.muted} strokeDasharray="4 4" />}
        {refLines?.y != null && <line x1={m.l} x2={w - m.r} y1={fy(refLines.y)} y2={fy(refLines.y)} stroke={C.muted} strokeDasharray="4 4" />}
        {refLines && <text x={w - m.r - 4} y={m.t + 10} textAnchor="end" className="lbl" style={{ fontSize: 10 }}>dashed: {refLines.label}</text>}
        {diagonal && <><line x1={fx(x0)} y1={fy(x0)} x2={fx(x1)} y2={fy(x1)} stroke={C.muted} strokeDasharray="4 4" /><text x={w - m.r - 4} y={m.t + 10} textAnchor="end" className="lbl" style={{ fontSize: 10 }}>dashed: {diagonal}</text></>}
        {trend && <line x1={fx(x0)} y1={fy(trend.slope * x0 + trend.icpt)} x2={fx(x1)} y2={fy(trend.slope * x1 + trend.icpt)} stroke={C.s[7]} strokeWidth={1.5} strokeOpacity={0.8} />}
        {ordered.map((p) => {
          const cx = fx(p.x), cy = fy(p.y);
          const on = p.id === selected;
          const open = (ax: number, ay: number) => show({ x: ax, y: ay, title: p.name, swatch: p.color, rows: p.tip });
          return (
            <g key={p.id} className="pt" transform={`translate(${cx},${cy})`} tabIndex={0} role="button" aria-pressed={on} aria-label={`${p.name}: ${xTitle} ${p.x}, ${yTitle} ${p.y}`} opacity={anyDim && p.dim && !on ? 0.22 : 1}
              onClick={() => onSelect(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p.id); } }}
              onPointerEnter={() => open(cx, cy)} onFocus={(e) => { const c = centreIn(ref.current, e.currentTarget); open(c.x, c.y); }} onBlur={hide}>
              <circle r={size / 2 + 4} fill="transparent" />
              <PointMark p={p} size={size} selected={on} />
            </g>
          );
        })}
        {selected && (() => { const p = points.find((q) => q.id === selected); return p ? <text x={fx(p.x)} y={fy(p.y) - size / 2 - 6} textAnchor="middle" style={{ fill: C.ink, fontWeight: 700, fontSize: 12, paintOrder: "stroke", stroke: C.surface, strokeWidth: 3 }}>{p.name}</text> : null; })()}
      </svg>
      <TipView tip={tip} width={w} />
    </div>
  );
}
