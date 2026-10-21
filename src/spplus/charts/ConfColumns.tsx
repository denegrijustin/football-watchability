import { useRef } from "react";
import { ConfLogoSvg, hasConfLogo } from "../../ConfMark";
import { LogoMark } from "../../logoTone";
import { C, TipView, centreIn, niceTicks, useTip, useWidth } from "./kit";

export interface StripGroup {
  id: string; label: string; color: string;
  dots: { id: string; name: string; value: number; tip: [string, string][]; logo?: string }[];
}

const quant = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); const p = (s.length - 1) * q; const lo = Math.floor(p); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (p - lo); };

const R = 10; // a team's logo chip
const HEAD = 70; // conference logo and name above each column
const FOOT = 26; // the conference average under each column
const AXIS_W = 40;

/**
 * Conference strength chart: one column per conference (strongest on the left), every team a logo placed at its rating (best at the top),
 * the middle half of the conference shaded and its average ticked with a dashed line. Columns scroll sideways when there are too many to fit.
 */
export function ConfColumns({ groups, selected, onSelect, axisTitle, lowerBetter, ariaLabel, natMean, division, fmtValue }: {
  division?: string; groups: StripGroup[]; selected: string | null; onSelect: (id: string) => void; axisTitle: string; lowerBetter?: boolean; ariaLabel: string; natMean?: number; fmtValue?: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const scroller = useRef<HTMLDivElement>(null);
  const all = groups.flatMap((g) => g.dots.map((d) => d.value));
  if (!all.length) return <p className="empty">No data.</p>;

  const avail = Math.max(width - AXIS_W, 240);
  const colW = Math.max(groups.length <= 3 ? 150 : 84, Math.floor(avail / Math.max(groups.length, 1)));
  const w = colW * groups.length;
  const narrow = width < 520;
  const h = narrow ? 440 : 520;
  const top = HEAD, bottom = h - FOOT;
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.05 || 1;
  const y = (v: number) => { const f = (v - (lo - pad)) / (hi - lo + 2 * pad); return top + (lowerBetter ? f : 1 - f) * (bottom - top); };
  const ticks = niceTicks(lo, hi, narrow ? 6 : 9);
  const f = fmtValue ?? ((v: number) => String(Math.round(v * 10) / 10));

  // Each column: teams placed at their rating, nudged sideways until their logos stop overlapping.
  const cols = groups.map((g, gi) => {
    const cx = gi * colW + colW / 2;
    const max = colW / 2 - R - 3;
    const placed: { d: StripGroup["dots"][number]; px: number; py: number }[] = [];
    for (const d of [...g.dots].sort((a, b) => (lowerBetter ? a.value - b.value : b.value - a.value))) {
      const py = y(d.value);
      let best = 0, bestGap = -1;
      for (let k = 0; k <= 40; k++) {
        const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (R * 0.9);
        if (Math.abs(off) > max) continue;
        const gap = Math.min(Infinity, ...placed.map((p) => Math.hypot(p.px - (cx + off), p.py - py)));
        if (gap >= R * 2 + 1) { best = off; bestGap = gap; break; }
        if (gap > bestGap) { best = off; bestGap = gap; }
      }
      placed.push({ d, px: cx + best, py });
    }
    const vals = g.dots.map((d) => d.value);
    return { g, cx, placed, mean: vals.reduce((s, v) => s + v, 0) / vals.length, q1: quant(vals, 0.25), q3: quant(vals, 0.75) };
  });

  return (
    <div className="chart ccols" ref={ref}>
      <div className="ccols-wrap">
        <svg className="ccols-axis" width={AXIS_W} height={h} style={{ width: AXIS_W, height: h }} role="img" aria-hidden="true">
          <g className="axis">
            {ticks.map((t) => <text key={t} x={AXIS_W - 6} y={y(t) + 4} textAnchor="end">{t}</text>)}
          </g>
        </svg>
        <div className="ccols-scroll" ref={scroller}>
          <svg width={w} height={h} style={{ width: w, height: h }} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={ariaLabel} onPointerLeave={hide}>
            <g className="grid">{ticks.map((t) => <line key={t} x1={0} x2={w} y1={y(t)} y2={y(t)} />)}</g>
            {natMean != null && <line x1={0} x2={w} y1={y(natMean)} y2={y(natMean)} stroke={C.muted} strokeDasharray="2 5" strokeOpacity={0.8} />}
            {cols.map(({ g, cx, placed, mean, q1, q3 }, gi) => (
              <g key={g.id}>
                {gi > 0 && <line x1={gi * colW} x2={gi * colW} y1={6} y2={h - 4} stroke={C.axis} />}
                {/* the conference, at the head of its column */}
                {hasConfLogo(g.id, division)
                  ? <ConfLogoSvg conf={g.id} division={division} x={cx - 19} y={8} size={38} />
                  : <g aria-hidden="true"><rect x={cx - 19} y={14} width={38} height={26} rx={7} fill={g.color} opacity={0.9} /><text x={cx} y={32} textAnchor="middle" style={{ fill: "#fff", fontSize: 10, fontWeight: 700 }}>{g.label.slice(0, 4).toUpperCase()}</text></g>}
                <text x={cx} y={60} textAnchor="middle" style={{ fill: C.ink, fontWeight: 600, fontSize: 11 }}>{g.label.length > (colW < 100 ? 11 : 16) ? `${g.label.slice(0, colW < 100 ? 10 : 15)}…` : g.label}</text>
                {/* middle half, and the conference average */}
                <rect x={gi * colW + 6} y={Math.min(y(q1), y(q3))} width={colW - 12} height={Math.max(Math.abs(y(q3) - y(q1)), 2)} rx={4} fill="#d9b26a" fillOpacity={0.2} />
                <line x1={gi * colW + 6} x2={(gi + 1) * colW - 6} y1={y(mean)} y2={y(mean)} stroke="#d9a441" strokeWidth={2} strokeDasharray="5 3" />
                <text x={cx} y={h - 8} textAnchor="middle" style={{ fill: C.ink2, fontSize: 10.5 }}>avg {f(mean)} · {g.dots.length}</text>
                {placed.map(({ d, px, py }) => {
                  const on = d.id === selected;
                  const open = (el?: Element | null) => { const c = el ? centreIn(ref.current, el) : { x: px, y: py }; show({ x: c.x, y: c.y, title: d.name, swatch: g.color, rows: d.tip }); };
                  return (
                    <g key={d.id} className="pt" tabIndex={0} role="button" aria-pressed={on} aria-label={`${d.name}, ${g.label}, ${f(d.value)}`} onClick={() => onSelect(d.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(d.id); } }}
                      onPointerEnter={(e) => { const c = centreIn(ref.current, e.currentTarget); show({ x: c.x, y: c.y, title: d.name, swatch: g.color, rows: d.tip }); }}
                      onFocus={(e) => { open(e.currentTarget); const el = scroller.current; if (el) { const l = px - el.clientWidth / 2; el.scrollTo({ left: Math.max(0, l), behavior: "smooth" }); } }} onBlur={hide}>
                      <circle cx={px} cy={py} r={R + 3} fill="transparent" />
                      {d.logo ? (
                        <>
                          <LogoMark src={d.logo} cx={px} cy={py} size={R * 1.45} chipOpacity={1} />
                          <circle cx={px} cy={py} r={on ? R + 1.5 : R} fill="none" stroke={on ? C.ink : g.color} strokeWidth={on ? 2.5 : 1.4} />
                        </>
                      ) : (
                        <circle cx={px} cy={py} r={on ? R - 2.5 : R - 3.5} fill={g.color} stroke={on ? C.ink : C.surface} strokeWidth={on ? 2.5 : 1.5} />
                      )}
                      <circle className="ring" cx={px} cy={py} r={R + 4} fill="none" />
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      </div>
      <p className="ccols-axis-title">{axisTitle}</p>
      <div className="legend"><span><i style={{ background: "#d9b26a", opacity: 0.45 }} />Middle half of the conference</span><span><i style={{ borderTop: "2px dashed #d9a441", background: "transparent", height: 0, width: 14 }} />Conference average</span>{natMean != null && <span><i style={{ borderTop: "2px dotted var(--muted)", background: "transparent", height: 0, width: 14 }} />Division average</span>}</div>
      <TipView tip={tip} width={Math.max(width, 300)} />
    </div>
  );
}
