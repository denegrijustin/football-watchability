import { C, TipView, centreIn, niceTicks, useTip, useWidth } from "./kit";

export interface DotRow {
  id: string; label: string; hint?: string;
  /** Every team in the division, for context (faint ticks). */
  field: number[];
  /** True when a lower number is the better one: the axis is reversed so right is always better. */
  lowerBetter?: boolean;
  items: { id: string; name: string; color: string; value: number | null; rank: number | null; rankOf: number }[];
}

export function CompareDots({ rows, ariaLabel }: { rows: DotRow[]; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const w = Math.max(width, 300);
  const narrow = w < 520;
  const m = { l: narrow ? 74 : 112, r: 20 };
  const rh = 92;
  const h = rows.length * rh + 6;
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={ariaLabel} onPointerLeave={hide}>
        {rows.map((r, ri) => {
          const y0 = ri * rh;
          const cy = y0 + 46;
          const lo = Math.min(...r.field), hi = Math.max(...r.field);
          const x = (v: number) => {
            const f = (v - lo) / (hi - lo || 1);
            return m.l + (r.lowerBetter ? 1 - f : f) * (w - m.l - m.r);
          };
          const ticks = niceTicks(lo, hi, narrow ? 4 : 6);
          // Stagger value labels so close dots do not collide.
          const placed = r.items.filter((i) => i.value != null).sort((a, b) => x(a.value!) - x(b.value!));
          return (
            <g key={r.id}>
              <text x={0} y={cy - 2} style={{ fill: C.ink, fontWeight: 600 }}>{r.label}</text>
              {r.hint && <text x={0} y={cy + 12} className="lbl" style={{ fontSize: 10 }}>{r.hint}</text>}
              <line x1={m.l} x2={w - m.r} y1={cy} y2={cy} stroke={C.axis} />
              {ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={cy - 3} y2={cy + 3} stroke={C.axis} /><text x={x(t)} y={y0 + 90} textAnchor="middle" className="lbl" style={{ fontSize: 10 }}>{t}</text></g>)}
              {r.field.map((v, i) => <line key={i} x1={x(v)} x2={x(v)} y1={cy - 6} y2={cy + 6} stroke={C.muted} strokeOpacity={0.28} />)}
              {placed.map((it, k) => {
                const level = [-13, 25, -27, 39][k % 4];
                const lx = Math.max(m.l + 28, Math.min(w - m.r - 28, x(it.value!)));
                const open = (px: number) => show({ x: px, y: cy, title: it.name, swatch: it.color, rows: [["Rating", it.value!.toFixed(1)], ["Rank", it.rank == null ? "—" : `${it.rank} of ${it.rankOf}`]] });
                return (
                  <g key={it.id} className="pt" tabIndex={0} role="img" aria-label={`${it.name}, ${r.label} ${it.value}, rank ${it.rank}`} onPointerEnter={() => open(x(it.value!))} onFocus={(e) => { const p = centreIn(ref.current, e.currentTarget); open(p.x); }} onBlur={hide}>
                    <circle cx={x(it.value!)} cy={cy} r={7} fill={it.color} stroke={C.surface} strokeWidth={2} />
                    <circle className="ring" cx={x(it.value!)} cy={cy} r={10} fill="none" />
                    {Math.abs(lx - x(it.value!)) > 1 || level === -27 || level === 39 ? <line x1={x(it.value!)} x2={lx} y1={cy + (level < 0 ? -8 : 8)} y2={cy + level + (level < 0 ? 3 : -11)} stroke={it.color} strokeOpacity={0.6} /> : null}
                    <text x={lx} y={cy + level} textAnchor="middle" style={{ fill: C.ink, fontWeight: 700, fontSize: 11, paintOrder: "stroke", stroke: C.surface, strokeWidth: 3 }}>{it.value!.toFixed(1)}{it.rank != null ? ` · #${it.rank}` : ""}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <TipView tip={tip} width={w} />
    </div>
  );
}
