import { ConfLogoSvg } from "../../ConfMark";
import { C, TipView, centreIn, niceTicks, useTip, useWidth } from "./kit";

export interface StripGroup {
  id: string; label: string; color: string;
  dots: { id: string; name: string; value: number; tip: [string, string][]; logo?: string }[];
}

const quant = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); const p = (s.length - 1) * q; const lo = Math.floor(p); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (p - lo); };

/** One row per group: every team is a dot on the shared rating axis, with the middle half shaded and the median ticked. */
export function StripPlot({ groups, selected, onSelect, axisTitle, lowerBetter, ariaLabel, natMean }: { groups: StripGroup[]; selected: string | null; onSelect: (id: string) => void; axisTitle: string; lowerBetter?: boolean; ariaLabel: string; natMean?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const w = Math.max(width, 300);
  const narrow = w < 520;
  const m = { l: narrow ? 92 : 134, r: 18, t: 18, b: 30 };
  const all = groups.flatMap((g) => g.dots.map((d) => d.value));
  if (!all.length) return <p className="empty">No data.</p>;
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.04 || 1;
  const x = (v: number) => { const f = (v - (lo - pad)) / (hi - lo + 2 * pad); return m.l + (lowerBetter ? 1 - f : f) * (w - m.l - m.r); };
  // Teams are drawn as their logos where there is one: a light chip with the logo inside, ringed in the conference color.
  const r = 9;
  // Lane packing: put each dot in the first lane where it clears its neighbours.
  const laid = groups.map((g) => {
    const lanes: number[][] = [];
    const items = [...g.dots].sort((a, b) => a.value - b.value).map((d) => {
      const px = x(d.value);
      let lane = lanes.findIndex((l) => l.every((o) => Math.abs(o - px) > r * 2 + 1));
      if (lane < 0) { lane = lanes.length; lanes.push([]); }
      lanes[lane].push(px);
      return { d, px, lane };
    });
    return { g, items, nLanes: Math.max(lanes.length, 1) };
  });
  const rows = laid.map((l) => ({ ...l, h: Math.max(40, l.nLanes * (r * 2 + 2) + 14) }));
  let acc = m.t;
  const placed = rows.map((row) => { const y0 = acc; acc += row.h; return { ...row, y0 }; });
  const h = acc + m.b;
  const ticks = niceTicks(lo, hi, narrow ? 4 : 8);
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={ariaLabel} onPointerLeave={hide}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={m.t - 4} y2={h - m.b} />)}</g>
        <g className="axis">{ticks.map((t) => <text key={t} x={x(t)} y={h - 12} textAnchor="middle">{t}</text>)}<text x={(m.l + w - m.r) / 2} y={h - 0} textAnchor="middle" style={{ fill: C.ink2, fontSize: 10 }}>{axisTitle}</text></g>
        {natMean != null && <line x1={x(natMean)} x2={x(natMean)} y1={m.t - 4} y2={h - m.b} stroke={C.muted} strokeDasharray="4 4" />}
        {placed.map(({ g, items, y0, h: rh }) => {
          const vals = g.dots.map((d) => d.value);
          const cy = y0 + rh / 2;
          const q1 = quant(vals, 0.25), q3 = quant(vals, 0.75), med = quant(vals, 0.5);
          return (
            <g key={g.id}>
              <line x1={m.l} x2={w - m.r} y1={y0 + rh} y2={y0 + rh} stroke={C.grid} />
              <ConfLogoSvg conf={g.id} x={4} y={cy - 10} size={20} />
              <text x={m.l - 8} y={cy + 4} textAnchor="end" style={{ fill: C.ink, fontWeight: 600 }}>{g.label.length > (narrow ? 9 : 14) ? `${g.label.slice(0, narrow ? 8 : 13)}…` : g.label}</text>
              <rect x={Math.min(x(q1), x(q3))} y={cy - rh / 2 + 4} width={Math.abs(x(q3) - x(q1))} height={rh - 8} fill={g.color} fillOpacity={0.12} rx={4} />
              <line x1={x(med)} x2={x(med)} y1={cy - rh / 2 + 4} y2={cy + rh / 2 - 4} stroke={g.color} strokeWidth={2} />
              {items.map(({ d, px, lane }) => {
                const py = cy + (lane - (laid.find((l) => l.g === g)!.nLanes - 1) / 2) * (r * 2 + 2);
                const on = d.id === selected;
                return (
                  <g key={d.id} className="pt" tabIndex={0} role="button" aria-pressed={on} aria-label={`${d.name}, ${g.label}, ${d.value}`} onClick={() => onSelect(d.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(d.id); } }}
                    onPointerEnter={() => show({ x: px, y: py, title: d.name, swatch: g.color, rows: d.tip })} onFocus={(e) => { const c = centreIn(ref.current, e.currentTarget); show({ x: c.x, y: c.y, title: d.name, swatch: g.color, rows: d.tip }); }} onBlur={hide}>
                    <circle cx={px} cy={py} r={r + 3} fill="transparent" />
                    <circle cx={px} cy={py} r={on ? r + 1.5 : r} fill={d.logo ? "rgba(255,255,255,0.94)" : g.color} stroke={on ? C.ink : g.color} strokeWidth={on ? 2.5 : 1.5} />
                    {d.logo && <image href={d.logo} x={px - (r - 2)} y={py - (r - 2)} width={(r - 2) * 2} height={(r - 2) * 2} preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: "none" }} />}
                    <circle className="ring" cx={px} cy={py} r={r + 4} fill="none" />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i style={{ background: C.muted, opacity: 0.4 }} />Middle half of the conference</span><span><i style={{ background: C.muted, width: 3 }} />Median</span>{natMean != null && <span><i style={{ border: `1px dashed ${C.muted}`, background: "transparent" }} />Division average</span>}</div>
      <TipView tip={tip} width={w} />
    </div>
  );
}
