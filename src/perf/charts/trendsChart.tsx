import { useRef, useState } from "react";
import { C, TipView, niceTicks, useTip, useWidth } from "../../spplus/charts/kit";

export interface TrendPoint {
  g: string; week: number;
  /** Two-line x label: the week, and the opponent ("@LAR"). */
  opp: string;
  y: number | null; roll: number | null;
  logo?: import("react").ReactNode; tipTitle: string; tip: [string, string][]; aria: string; small?: boolean;
}
export interface TrendLine { label: string; color: string; pts: { week: number; v: number }[]; hollow?: boolean }

interface Props {
  pts: TrendPoint[];
  color: string;
  teamLabel: string;
  rollLabel: string | null;
  opp?: TrendLine | null;
  league?: { v: number; label: string } | null;
  /** Put the better direction at the top (for defenses where lower is better). */
  invert: boolean;
  yFormat: (v: number) => string;
  yTitle: string;
  selected: string | null;
  onSelect: (g: string | null) => void;
  ariaLabel: string;
}

/** Weekly line chart: raw game values as dots, an optional rolling line, a league line and a comparison team. Points are keyboard-reachable (arrows move, Enter selects). */
export function TrendChart(p: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const [focusIx, setFocusIx] = useState(0);
  const nodes = useRef<(SVGGElement | null)[]>([]);
  const w = Math.max(width, 280);
  const narrow = w < 520;
  const h = narrow ? 280 : 340;
  const m = { l: 46, r: narrow ? 40 : 58, t: 26, b: 40 };

  const weeks = [...p.pts.map((d) => d.week), ...(p.opp?.pts.map((d) => d.week) ?? [])];
  const w0 = Math.min(...weeks), w1 = Math.max(...weeks);
  const vals = [...p.pts.flatMap((d) => [d.y, d.roll]), ...(p.opp?.pts.map((d) => d.v) ?? []), p.league?.v ?? null].filter((v): v is number => v != null && Number.isFinite(v));
  if (!p.pts.length || !vals.length) return <p className="empty">No games to chart.</p>;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  lo -= pad; hi += pad;
  const x = (wk: number) => m.l + (w1 === w0 ? (w - m.l - m.r) / 2 : ((wk - w0) / (w1 - w0)) * (w - m.l - m.r));
  const y = (v: number) => { const f = (v - lo) / (hi - lo); return p.invert ? m.t + f * (h - m.t - m.b) : h - m.b - f * (h - m.t - m.b); };
  const ticks = niceTicks(lo, hi, 5);
  const path = (pts: { week: number; v: number | null }[]) => pts.reduce((d, q, i) => (q.v == null ? d : `${d}${d && pts[i - 1]?.v != null ? "L" : "M"}${x(q.week).toFixed(1)},${y(q.v).toFixed(1)}`), "");
  const slot = p.pts.length > 1 ? (w - m.l - m.r) / Math.max(1, w1 - w0) : 60;
  const showOpp = slot >= 34;
  const last = p.pts[p.pts.length - 1];
  const lastRoll = [...p.pts].reverse().find((d) => d.roll != null);

  const tipFor = (d: TrendPoint) => { if (d.y != null) show({ x: x(d.week), y: y(d.y), title: d.tipTitle, logo: d.logo, swatch: p.color, rows: d.tip }); };
  const move = (i: number) => { const j = Math.max(0, Math.min(p.pts.length - 1, i)); setFocusIx(j); nodes.current[j]?.focus(); };
  const nearest = (e: React.PointerEvent | React.MouseEvent) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0, bd = Infinity;
    p.pts.forEach((d, i) => { const dd = Math.abs(x(d.week) - px); if (dd < bd) { bd = dd; best = i; } });
    return p.pts[best];
  };
  const sel = p.pts.find((d) => d.g === p.selected) ?? null;

  return (
    <div className="chart tr-chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={p.ariaLabel} style={{ touchAction: "pan-y" }}
        onPointerMove={(e) => { if (e.pointerType === "mouse") tipFor(nearest(e)); }}
        onPointerLeave={hide}
        onClick={(e) => { const d = nearest(e); p.onSelect(d.g === p.selected ? null : d.g); tipFor(d); }}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={m.l - 6} y={y(t) + 4} textAnchor="end">{p.yFormat(t)}</text>)}
          {p.pts.map((d) => (
            <g key={d.g}>
              <text x={x(d.week)} y={h - 22} textAnchor="middle" style={d.g === p.selected ? { fill: C.ink, fontWeight: 700 } : undefined}>{narrow ? d.week : `Wk ${d.week}`}</text>
              {showOpp && <text x={x(d.week)} y={h - 8} textAnchor="middle" style={{ fontSize: 10, fill: d.g === p.selected ? C.ink : C.muted }}>{d.opp}</text>}
            </g>
          ))}
          <text x={4} y={10} className="lbl" style={{ fontSize: 10 }}>{p.invert ? "↑ better (axis flipped)" : "↑ higher"}</text>
        </g>
        {sel && <rect x={x(sel.week) - Math.min(22, slot / 2)} width={Math.min(44, slot)} y={m.t} height={h - m.t - m.b} fill={C.ink} opacity={0.07} rx={6} />}
        {p.league && (
          <g>
            <line x1={m.l} x2={w - m.r} y1={y(p.league.v)} y2={y(p.league.v)} stroke={C.muted} strokeDasharray="2 4" strokeWidth={1.5} />
            <text x={w - m.r + 4} y={y(p.league.v) + 4} className="lbl" style={{ fontSize: 10 }}>{narrow ? "Lg" : "League"}</text>
          </g>
        )}
        {p.opp && p.opp.pts.length > 0 && (
          <g>
            <path d={path(p.opp.pts)} fill="none" stroke={p.opp.color} strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
            {p.opp.pts.map((q) => <rect key={q.week} x={x(q.week) - 3.5} y={y(q.v) - 3.5} width={7} height={7} fill={C.surface} stroke={p.opp!.color} strokeWidth={2} transform={`rotate(45 ${x(q.week)} ${y(q.v)})`} />)}
            {(() => { const l = p.opp!.pts[p.opp!.pts.length - 1]; return <text x={x(l.week) + 8} y={y(l.v) + 4} style={{ fill: C.ink2, fontWeight: 600, fontSize: 11 }}>{p.opp!.label}</text>; })()}
          </g>
        )}
        <path d={path(p.pts.map((d) => ({ week: d.week, v: d.y })))} fill="none" stroke={p.color} strokeWidth={p.rollLabel ? 1.5 : 2.5} opacity={p.rollLabel ? 0.55 : 1} strokeLinecap="round" strokeLinejoin="round" />
        {p.rollLabel && <path d={path(p.pts.map((d) => ({ week: d.week, v: d.roll })))} fill="none" stroke={p.color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />}
        {p.rollLabel && lastRoll && <text x={x(lastRoll.week) + 8} y={y(lastRoll.roll!) + (last.y != null && Math.abs(y(last.y) - y(lastRoll.roll!)) < 12 ? 12 : 4)} style={{ fill: C.ink, fontWeight: 700, fontSize: 11 }}>{p.teamLabel}</text>}
        {!p.rollLabel && last.y != null && <text x={x(last.week) + 8} y={y(last.y) + 4} style={{ fill: C.ink, fontWeight: 700, fontSize: 11 }}>{p.teamLabel}</text>}
        {p.pts.map((d, i) => {
          if (d.y == null) return null;
          const on = d.g === p.selected;
          const cx = x(d.week), cy = y(d.y);
          return (
            <g key={d.g} className="pt" ref={(el) => { nodes.current[i] = el; }} role="button" tabIndex={i === focusIx ? 0 : -1} aria-label={d.aria} aria-pressed={on}
              onFocus={() => { setFocusIx(i); tipFor(d); }} onBlur={hide}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i + 1); }
                else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i - 1); }
                else if (e.key === "Home") { e.preventDefault(); move(0); }
                else if (e.key === "End") { e.preventDefault(); move(p.pts.length - 1); }
                else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); p.onSelect(on ? null : d.g); }
              }}
              onClick={(e) => { e.stopPropagation(); p.onSelect(on ? null : d.g); tipFor(d); }}>
              <circle cx={cx} cy={cy} r={18} fill="transparent" />
              <circle className="ring" cx={cx} cy={cy} r={9} fill="none" stroke={on ? C.ink : "none"} strokeWidth={2} />
              <circle cx={cx} cy={cy} r={on ? 6 : 5} fill={d.small ? C.surface : p.color} stroke={p.color} strokeWidth={2} />
            </g>
          );
        })}
      </svg>
      <TipView tip={tip} width={w} />
    </div>
  );
}
