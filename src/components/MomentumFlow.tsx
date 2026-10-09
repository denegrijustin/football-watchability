import { useState } from 'react';
export function MomentumFlow({ wp, away, home, compact = false, pendingLabel = "Awaiting play data" }: { wp: [number, number | null][]; away: string; home: string; compact?: boolean; pendingLabel?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const points = wp.filter(p => Number.isFinite(p[0]));
  if (points.length < 2) return <div className={`momentum-flow ${compact ? "flow-mini" : ""}`}><div className="flow-label"><strong>Game flow · Momentum</strong><span>{pendingLabel}</span></div><svg viewBox="0 0 300 28" role="img" aria-label={`Momentum: ${pendingLabel}`}><line x1="4" x2="296" y1="14" y2="14" stroke="currentColor" opacity=".25" strokeDasharray="4 4" /></svg></div>;
  const swings = points.map((p, i) => p[0] - points[Math.max(0, i - 12)][0]);
  const selected = active ?? points.length - 1, swing = swings[selected];
  const side = Math.abs(swing) < 3 ? 'Even' : swing > 0 ? home : away;
  const width = 300, height = compact ? 28 : 100;
  const x = (i: number) => 4 + i / (points.length - 1) * 292;
  const y = (v: number) => height / 2 - v / 100 * (height / 2 - 4);
  return <div className={`momentum-flow ${compact ? 'flow-mini' : ''}`}>
    <div className="flow-label"><strong>Momentum · {side}</strong><span>{Math.abs(swing).toFixed(1)} pp</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Momentum over time; ${side}, ${Math.abs(swing).toFixed(1)} percentage-point swing`}>
      <line x1="4" x2="296" y1={height / 2} y2={height / 2} stroke="currentColor" opacity=".25" />
      <polyline points={swings.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--lime)" strokeWidth="2" />
      {!compact && swings.map((v,i)=><circle key={i} cx={x(i)} cy={y(v)} r="4" fill={active===i?'var(--lime)':'transparent'} tabIndex={0} onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)} aria-label={`Play ${i+1}, ${points[i][1] ? `Q${points[i][1]}, ` : ''}${v.toFixed(1)} percentage-point momentum swing toward ${v>=0?home:away}`} />)}
    </svg>
    {!compact && <p className="gc-note" role="status">Play {selected+1}{points[selected][1] ? ` · Q${points[selected][1]}` : ''} · {side} · {Math.abs(swing).toFixed(1)} percentage points over the previous {Math.min(12, selected)} plays. Hover or focus the chart. Positive favors {home}; negative favors {away}.</p>}
  </div>;
}
