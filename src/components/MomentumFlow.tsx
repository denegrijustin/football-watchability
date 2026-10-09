import { useState } from 'react';
import type { WpPoint } from '../insanity';
export function MomentumFlow({ wp, away, home, compact = false, pendingLabel = 'Awaiting play data' }: { wp: WpPoint[]; away: string; home: string; compact?: boolean; pendingLabel?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const points = wp.filter(p => Number.isFinite(p[0]));
  if (points.length < 2) return <div className={`momentum-flow ${compact ? 'flow-mini' : ''}`}><div className="flow-label"><strong>Game flow · Momentum</strong><span>{pendingLabel}</span></div><p className="flow-explain">Tracks which team is gaining the advantage, play by play.</p></div>;
  const swings = points.map((p,i)=>p[0]-points[Math.max(0,i-12)][0]);
  const moves = points.map((p,i)=>i ? p[0]-points[i-1][0] : 0);
  const recent = Math.max(1,points.length-12);
  const shift = moves.reduce((best,v,i)=>i>=recent && Math.abs(v)>Math.abs(moves[best]) ? i : best,recent);
  const selected = active ?? (compact ? shift : points.length-1);
  const swing = swings[points.length-1];
  const side = Math.abs(swing)<3 ? 'Even' : swing>0 ? home : away;
  const move = moves[selected], play = points[selected][2];
  const height = compact ? 58 : 140;
  const x = (i:number)=>6+i/(points.length-1)*288;
  const y = (v:number)=>height/2-v/100*(height/2-6);
  return <div className={`momentum-flow ${compact ? 'flow-mini' : ''}`}>
    <div className="flow-label"><strong>Momentum · {side === 'Even' ? 'Even' : `${side} gaining`}</strong><span>{Math.abs(swing).toFixed(1)} pp / last 12 plays</span></div>
    <div className="flow-legend"><span>↑ {home} advantage</span><span>↓ {away} advantage</span></div>
    <svg viewBox={`0 0 300 ${height}`} role="group" aria-label={`Momentum chart: above the center line favors ${home}; below favors ${away}`}>
      <line x1="6" x2="294" y1={height/2} y2={height/2} stroke="currentColor" opacity=".35" strokeDasharray="3 3" />
      <polyline points={swings.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--lime)" strokeWidth="2" />
      {swings.map((v,i)=> (!compact || i===shift) && <circle key={i} cx={x(i)} cy={y(v)} r={i===selected?5:4} fill={i===selected?'var(--lime)':'transparent'} tabIndex={compact?undefined:0} onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)} aria-label={`Play ${i+1}: ${points[i][2]?.text ?? 'Description unavailable'}`}><title>{points[i][2]?.text ?? 'Description unavailable'}</title></circle>)}
    </svg>
    <div className="flow-legend"><span>Kickoff</span><span>Now</span></div>
    <p className="flow-event" role="status"><strong>{compact?'Biggest recent shift':'Selected play'} · {points[selected][1]?`Q${points[selected][1]} `:''}{play?.clock} · {Math.abs(move).toFixed(1)} pp toward {move>=0?home:away}</strong><span>{play?.text ?? 'Play description unavailable'}</span></p>
    {!compact && <p className="flow-explain">Hover or focus a point for its play. Line = win-probability change over 12 plays; pp = percentage points. Highlighted event = change on that single play.</p>}
  </div>;
}
