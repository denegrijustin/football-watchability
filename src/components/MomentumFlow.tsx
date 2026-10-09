import { useState } from 'react';
import type { WpPoint } from '../insanity';
export function MomentumFlow({ wp, away, home, compact = false, pendingLabel = 'Awaiting play data', status }: { wp: WpPoint[]; away: string; home: string; compact?: boolean; pendingLabel?: string; status?: { state: string; period: number; clock: string } }) {
  const [active, setActive] = useState<number | null>(null);
  const points = wp.filter(p => Number.isFinite(p[0]));
  const swings = points.map((p,i)=>p[0]-points[Math.max(0,i-12)][0]);
  const moves = points.map((p,i)=>i ? p[0]-points[i-1][0] : 0);
  const recent = Math.min(points.length-1,Math.max(1,points.length-12));
  const shift = points.length ? moves.reduce((best,v,i)=>i>=recent && Math.abs(v)>Math.abs(moves[best]) ? i : best,recent) : 0;
  const selected = active ?? (compact ? shift : points.length-1);
  const swing = swings[points.length-1] ?? 0;
  const side = Math.abs(swing)<3 ? 'Even' : swing>0 ? home : away;
  const move = moves[selected] ?? 0, play = points[selected]?.[2];
  const height = compact ? 58 : 140;
  const lastPeriod = Math.max(4,status?.period ?? 0,...points.map(p=>p[1] ?? 0));
  const duration = lastPeriod * 15 * 60;
  const elapsed = (period:number, clock:string)=>{
    const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
    return Math.min(duration,Math.max(0,(period-1)*900+(match ? 900-Number(match[1])*60-Number(match[2]) : 0)));
  };
  const times = points.map(p=>elapsed(p[1] ?? 1,p[2]?.clock ?? ''));
  const current = status?.state === 'post' ? duration : status ? elapsed(status.period || 1,status.clock) : (times.at(-1) ?? 0);
  const xTime = (time:number)=>6+time/duration*288;
  const x = (i:number)=>xTime(times[i]);
  const y = (v:number)=>height/2-v/100*(height/2-6);
  return <div className={`momentum-flow ${compact ? 'flow-mini' : ''}`}>
    <div className="flow-label"><strong>Momentum · {points.length < 2 ? pendingLabel : side === 'Even' ? 'Even' : `${side} gaining`}</strong><span>{points.length >= 2 ? `${Math.abs(swing).toFixed(1)} pp / last 12 plays` : "Full game timeline"}</span></div>
    <div className="flow-legend"><span>↑ {home} advantage</span><span>↓ {away} advantage</span></div>
    <svg viewBox={`0 0 300 ${height}`} role="group" aria-label={`Momentum chart: above the center line favors ${home}; below favors ${away}`}>
      <rect x={xTime(current)} y="0" width={294-xTime(current)} height={height} fill="currentColor" opacity=".035" />
      {Array.from({length:lastPeriod+1},(_,q)=><line key={q} x1={xTime(q*900)} x2={xTime(q*900)} y1="2" y2={height-2} stroke="currentColor" opacity=".16" />)}
      <line x1="6" x2="294" y1={height/2} y2={height/2} stroke="currentColor" opacity=".35" strokeDasharray="3 3" />
      <polyline points={swings.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--lime)" strokeWidth="2" />
      {points.length > 0 && <circle cx={xTime(current)} cy={y(swings.at(-1) ?? 0)} r="3" fill="var(--lime)"><title>{status?.state === 'post' ? 'Final' : `Now: Q${status?.period ?? points.at(-1)?.[1]} ${status?.clock ?? points.at(-1)?.[2]?.clock ?? ''}`}</title></circle>}
      {swings.map((v,i)=> (!compact || i===shift) && <circle key={i} cx={x(i)} cy={y(v)} r={i===selected?5:4} fill={i===selected?'var(--lime)':'transparent'} tabIndex={compact?undefined:0} onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)} aria-label={`Play ${i+1}: ${points[i][2]?.text ?? 'Description unavailable'}`}><title>{points[i][2]?.text ?? 'Description unavailable'}</title></circle>)}
    </svg>
    <div className="flow-time-marks">{Array.from({length:lastPeriod+1},(_,q)=><span key={q}>{q===0?'Start':q===lastPeriod?'End':q===2?'Half':q<4?`Q${q+1}`:'OT'}<small>{q*15}m</small></span>)}</div>
    <p className="flow-explain">{status?.state==='post' ? 'Final · complete game' : status?.state==='in' ? `Now: Q${status.period} ${status.clock} · shaded area is still to play` : 'Start → final · line fills in as plays happen'}</p>
    {points.length >= 2 && <p className="flow-event" role="status"><strong>{compact?'Biggest recent shift':'Selected play'} · {points[selected]?.[1]?`Q${points[selected][1]} `:''}{play?.clock} · {Math.abs(move).toFixed(1)} pp toward {move>=0?home:away}</strong><span>{play?.text ?? 'Play description unavailable'}</span></p>}
    {!compact && <p className="flow-explain">Hover or focus a point for its play. Line = win-probability change over 12 plays; pp = percentage points. Highlighted event = change on that single play.</p>}
  </div>;
}
