import { C, TipView, centreIn, useTip, useWidth } from "./kit";
import { BREAK_EVEN, recordText, type WeekLine } from "../data/ats";

/** Weekly ATS % as bars (game count under each), with the season-to-date % as a line. */
export function AtsChart({ weeks, ariaLabel }: { weeks: WeekLine[]; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const w = Math.max(width, 300), h = 300, m = { l: 44, r: 14, t: 18, b: 52 };
  // The range grows when a small week lands outside 30-80%.
  const pcts = weeks.map((x) => x.rec.pct).filter((x): x is number => x != null);
  const lo = Math.min(0.3, Math.floor((Math.min(...pcts, 0.5) - 0.001) * 10) / 10), hi = Math.max(0.8, Math.ceil((Math.max(...pcts, 0.5) + 0.001) * 10) / 10);
  const y = (v: number) => h - m.b - ((v - lo) / (hi - lo)) * (h - m.t - m.b);
  const slot = (w - m.l - m.r) / Math.max(weeks.length, 1);
  const bw = Math.min(46, slot * 0.58);
  const cx = (i: number) => m.l + slot * i + slot / 2;
  const ticks = Array.from({ length: Math.round((hi - lo) * 10) + 1 }, (_, i) => Math.round((lo + i / 10) * 10) / 10);
  const line = weeks.map((wk, i) => (wk.cumulative.pct == null ? null : `${i ? "L" : "M"}${cx(i).toFixed(1)},${y(wk.cumulative.pct).toFixed(1)}`)).filter(Boolean).join("");
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={ariaLabel} onPointerLeave={hide}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">{ticks.map((t) => <text key={t} x={m.l - 6} y={y(t) + 4} textAnchor="end">{Math.round(t * 100)}%</text>)}<text x={4} y={10} className="lbl" style={{ fontSize: 10 }}>Share of picks that covered</text></g>
        <line x1={m.l} x2={w - m.r} y1={y(0.5)} y2={y(0.5)} stroke={C.muted} strokeDasharray="4 4" />
        <line x1={m.l} x2={w - m.r} y1={y(BREAK_EVEN)} y2={y(BREAK_EVEN)} stroke={C.s[3]} strokeDasharray="2 3" />
        <text x={m.l + 4} y={y(0.5) + 12} className="lbl" style={{ fontSize: 10 }}>50%</text>
        <text x={m.l + 4} y={y(BREAK_EVEN) - 4} style={{ fontSize: 10, fill: C.s[3] }}>break-even 52.4%</text>
        {weeks.map((wk, i) => {
          const p = wk.rec.pct;
          const rows: [string, string][] = [["Week record", recordText(wk.rec)], ["ATS %", p == null ? "—" : `${(p * 100).toFixed(1)}%`], ["Season to date", `${recordText(wk.cumulative)} · ${wk.cumulative.pct == null ? "—" : (wk.cumulative.pct * 100).toFixed(1)}%`], ["Avg. cover margin", `${wk.avgCoverBy == null ? "—" : (wk.avgCoverBy > 0 ? "+" : "") + wk.avgCoverBy.toFixed(1)} pts`]];
          const open = (px: number, py: number) => show({ x: px, y: py, title: `Week ${wk.week}`, rows });
          return (
            <g key={wk.week} className="pt" tabIndex={0} role="img" aria-label={`Week ${wk.week}: ${recordText(wk.rec)}, ${p == null ? "no decided picks" : `${(p * 100).toFixed(1)} percent`}`}
              onPointerEnter={() => open(cx(i), p == null ? y(0.5) : y(p))} onFocus={(e) => { const c = centreIn(ref.current, e.currentTarget); open(c.x, c.y); }} onBlur={hide}>
              <rect x={cx(i) - slot / 2} y={m.t} width={slot} height={h - m.t - m.b + 30} fill="transparent" />
              {p != null && <rect x={cx(i) - bw / 2} y={Math.min(y(p), y(lo))} width={bw} height={Math.abs(y(lo) - y(p))} rx={3} fill={p >= BREAK_EVEN ? C.hi : C.lo} fillOpacity={0.85} />}
              {p != null && <text x={cx(i)} y={y(p) - 5} textAnchor="middle" style={{ fill: C.ink, fontWeight: 600, fontSize: 11 }}>{Math.round(p * 100)}%</text>}
              <text x={cx(i)} y={h - 32} textAnchor="middle">{wk.label}</text>
              <text x={cx(i)} y={h - 18} textAnchor="middle" className="lbl" style={{ fontSize: 10 }}>{recordText(wk.rec)}</text>
              <rect className="ring" x={cx(i) - bw / 2 - 3} y={m.t} width={bw + 6} height={h - m.t - m.b} rx={4} fill="none" />
            </g>
          );
        })}
        {line && <path d={line} fill="none" stroke={C.ink} strokeWidth={2} strokeLinejoin="round" />}
        {weeks.map((wk, i) => wk.cumulative.pct == null ? null : <circle key={i} cx={cx(i)} cy={y(wk.cumulative.pct)} r={4} fill={C.surface} stroke={C.ink} strokeWidth={2} />)}
      </svg>
      <div className="legend"><span><i style={{ background: C.hi }} />Week at or above break-even</span><span><i style={{ background: C.lo }} />Week below it</span><span><i style={{ background: C.surface, border: `2px solid ${C.ink}`, borderRadius: 6 }} />Season to date</span></div>
      <TipView tip={tip} width={w} />
    </div>
  );
}
