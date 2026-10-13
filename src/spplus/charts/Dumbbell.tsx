import { C, TipView, centreIn, niceTicks, useTip, useWidth } from "./kit";

export interface DumbRow { id: string; label: string; v1: number | null; v2: number | null; tip: [string, string][]; tipTitle: string }

/** One row per item: two dots joined by a line, so the gap between two numbers is the thing you see. */
export function Dumbbell({ rows, selected, onSelect, name1, name2, color1 = C.s[0], color2 = C.s[1], axisTitle, zeroLine, ariaLabel, domain }: {
  rows: DumbRow[]; selected: string | null; onSelect: (id: string) => void; name1: string; name2: string; color1?: string; color2?: string; axisTitle: string; zeroLine?: boolean; ariaLabel: string; domain?: [number, number];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const w = Math.max(width, 300);
  const narrow = w < 560;
  const m = { l: narrow ? 128 : 230, r: 14, t: 24, b: 6 };
  const rh = 24;
  const h = m.t + rows.length * rh + m.b + 18;
  const vals = rows.flatMap((r) => [r.v1, r.v2]).filter((v): v is number => v != null);
  const [lo, hi] = domain ?? [Math.min(0, ...vals), Math.max(0, ...vals)];
  const pad = (hi - lo) * 0.04 || 1;
  const x = (v: number) => m.l + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (w - m.l - m.r);
  const ticks = niceTicks(lo, hi, narrow ? 4 : 7);
  const cut = narrow ? 17 : 34;
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={ariaLabel} onPointerLeave={hide}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={m.t - 4} y2={h - m.b - 18} />)}</g>
        {zeroLine && <line x1={x(0)} x2={x(0)} y1={m.t - 4} y2={h - m.b - 18} stroke={C.axis} strokeWidth={1.5} />}
        <g className="axis">{ticks.map((t) => <text key={t} x={x(t)} y={h - 4} textAnchor="middle">{t}</text>)}<text x={m.l} y={11} className="lbl" style={{ fontSize: 10 }}>{axisTitle}</text></g>
        {rows.map((r, i) => {
          const cy = m.t + i * rh + rh / 2;
          const on = selected === r.id;
          const open = (px: number) => show({ x: px, y: cy, title: r.tipTitle, rows: r.tip });
          return (
            <g key={r.id} className="pt" tabIndex={0} role="button" aria-pressed={on} aria-label={`${r.label}: ${name1} ${r.v1 ?? "none"}, ${name2} ${r.v2 ?? "none"}`}
              onClick={() => onSelect(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.id); } }}
              onPointerEnter={() => open(Math.min(w - 200, Math.max(m.l, x(r.v1 ?? r.v2 ?? 0))))} onFocus={(e) => { const p = centreIn(ref.current, e.currentTarget); open(Math.min(w - 200, Math.max(m.l, p.x))); }} onBlur={hide}>
              <rect x={0} y={cy - rh / 2} width={w} height={rh} fill={on ? "rgba(57,135,229,0.14)" : "transparent"} />
              <text x={m.l - 8} y={cy + 4} textAnchor="end" style={{ fill: on ? C.ink : C.ink2, fontWeight: on ? 700 : 400 }}>{r.label.length > cut ? `${r.label.slice(0, cut - 1)}…` : r.label}</text>
              {r.v1 != null && r.v2 != null && <line x1={x(r.v1)} x2={x(r.v2)} y1={cy} y2={cy} stroke={C.muted} strokeWidth={2} />}
              {r.v1 != null && <circle cx={x(r.v1)} cy={cy} r={5} fill={color1} stroke={C.surface} strokeWidth={2} />}
              {r.v2 != null && <rect x={x(r.v2) - 4.5} y={cy - 4.5} width={9} height={9} fill={color2} stroke={C.surface} strokeWidth={2} transform={`rotate(45 ${x(r.v2)} ${cy})`} />}
              <rect className="ring" x={1} y={cy - rh / 2 + 1} width={w - 2} height={rh - 2} fill="none" rx={4} />
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i style={{ background: color1, borderRadius: 6 }} />{name1}</span><span><i style={{ background: color2, transform: "rotate(45deg)", width: 9, height: 9 }} />{name2}</span></div>
      <TipView tip={tip} width={w} />
    </div>
  );
}
