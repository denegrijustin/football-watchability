import { useState } from "react";
import { Crosshair, Play, TrendingUp } from "lucide-react";
import type { WpPoint } from "../insanity";
import "../flow2.css";

type Side = { abbr: string; name: string; logo?: string };
type Status = { state: string; period: number; clock: string };

const W = 600;
const H = 250;
const MID = H / 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

/**
 * The Game Center's game flow: each team's win probability, a momentum meter, the win-probability line across the game with the time still to play
 * hatched, three readouts, the current play and a one-line takeaway. wp holds the HOME team's win probability after every play, so the line is drawn
 * as the away team's lead (up) or the home team's (down).
 */
export function GameFlowPanel({ wp, status, away, home }: { wp: WpPoint[]; status: Status; away: Side; home: Side }) {
  const [active, setActive] = useState<number | null>(null);
  const pts = wp.filter((p) => Number.isFinite(p[0]));
  if (pts.length < 4) return null;

  const lastPeriod = Math.max(4, status.period || 0, ...pts.map((p) => p[1] ?? 0));
  const duration = lastPeriod * 900;
  const elapsed = (period: number, clock: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(clock);
    return clamp((period - 1) * 900 + (m ? 900 - Number(m[1]) * 60 - Number(m[2]) : 0), 0, duration);
  };
  // A play without a readable clock is spread evenly through its quarter, so a feed with gaps still draws a line, not a stack.
  const parsed = pts.map((p) => /^(\d{1,2}):(\d{2})$/.test(p[2]?.clock ?? ""));
  const perPeriod = new Map<number, number>();
  const seen = new Map<number, number>();
  pts.forEach((p, i) => { if (!parsed[i]) perPeriod.set(p[1] ?? 1, (perPeriod.get(p[1] ?? 1) ?? 0) + 1); });
  const times = pts.map((p, i) => {
    const q = p[1] ?? 1;
    if (parsed[i]) return elapsed(q, p[2]?.clock ?? "");
    const k = (seen.get(q) ?? 0) + 1;
    seen.set(q, k);
    return (q - 1) * 900 + (k / ((perPeriod.get(q) ?? 1) + 1)) * 900;
  });
  const post = status.state === "post";
  const now = post ? duration : status.state === "in" ? elapsed(status.period || 1, status.clock) : (times.at(-1) ?? 0);
  for (let i = 0; i < times.length; i++) times[i] = Math.min(times[i], now); // nothing is drawn past the present
  const lead = pts.map((p) => 50 - p[0]); // + favors the away team
  const maxAbs = Math.max(...lead.map(Math.abs));
  const D = clamp(Math.ceil(Math.max(20, maxAbs) / 10) * 10, 20, 50);
  const x = (t: number) => (t / duration) * W;
  const y = (v: number) => MID - (v / D) * (MID - 14);

  const last = pts.length - 1;
  const awayWin = Math.round(100 - pts[last][0]);
  const homeWin = Math.round(pts[last][0]);
  const n = Math.min(12, last);
  const swingHome = pts[last][0] - pts[last - n][0]; // + toward home
  const side = Math.abs(swingHome) < 3 ? null : swingHome > 0 ? home : away;
  const avg = lead.slice(-n - 1).reduce((s, v, i, a) => (i ? s + Math.abs(v - a[i - 1]) : s), 0) / n;
  const sinceStart = lead[last] - lead[0];
  const leader = lead[last] >= 0 ? away : home;

  const sel = active ?? last;
  const selMove = sel ? lead[sel] - lead[sel - 1] : 0;
  const selPlay = pts[sel]?.[2];
  const selClock = `${pts[sel]?.[1] ? `Q${pts[sel][1]} ` : ""}${selPlay?.clock ?? ""}`.trim();

  const path = lead.map((v, i) => `${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`);
  const xNow = x(now);
  const area = `M ${x(times[0])},${MID} L ${path.join(" L ")} L ${x(times[last])},${MID} Z`;
  const meterAt = clamp(Math.round(5 + (clamp(swingHome, -25, 25) / 25) * 5), 0, 10);
  const marks = Array.from({ length: lastPeriod + 1 }, (_, q) => q);
  const label = (q: number) => (q === 0 ? "Start" : q === lastPeriod ? "End" : q === lastPeriod / 2 ? "Half" : q <= 4 ? `Q${q + 1}` : `OT${q - 4}`);
  const currentLabel = post ? "Final" : `Q${status.period} ${status.clock}`;

  return (
    <section className="gc-panel gc-wide gf" aria-label="Game flow and momentum">
      <h3 className="gf-title"><i aria-hidden="true" />Game flow &amp; momentum</h3>

      <div className="gf-top">
        <div className="gf-team away">
          {away.logo && <img src={away.logo} alt="" width="56" height="56" />}
          <div><b>{awayWin}%</b><span>Win prob</span></div>
        </div>
        <div className="gf-meter" role="img" aria-label={side ? `Momentum toward ${side.name}` : "Momentum even"}>
          <strong>Momentum: {side ? side.abbr : "Even"}</strong>
          <div className="gf-blocks" aria-hidden="true">
            {Array.from({ length: 11 }, (_, i) => <i key={i} className={i < 5 ? "a" : i > 5 ? "h" : "m"} style={{ opacity: i < 5 ? 1 - (4 - i) * 0.14 : i > 5 ? 1 - (i - 6) * 0.14 : 1 }} />)}
            <b style={{ left: `${(meterAt + 0.5) * (100 / 11)}%` }} />
          </div>
        </div>
        <div className="gf-team home">
          <div><b>{homeWin}%</b><span>Win prob</span></div>
          {home.logo && <img src={home.logo} alt="" width="56" height="56" />}
        </div>
      </div>

      <div className="gf-chart">
        <div className="gf-y" aria-hidden="true"><span>{away.abbr}<br />+{D}%</span><span>Even</span><span>{home.abbr}<br />+{D}%</span></div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Win probability across the game: ${leader.name} leads by ${Math.abs(lead[last]).toFixed(0)} points of win probability`}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const t = ((e.clientX - r.left) / r.width) * duration; let best = 0; for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[best] - t)) best = i; setActive(best); }}
          onPointerLeave={() => setActive(null)}>
          <defs>
            <linearGradient id="gf-fill-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--away-alt, var(--away-bg, #d9302c))" stopOpacity=".55" /><stop offset="1" stopColor="var(--away-bg, #d9302c)" stopOpacity="0" /></linearGradient>
            <pattern id="gf-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="currentColor" strokeOpacity=".14" strokeWidth="2" /></pattern>
            <clipPath id="gf-past"><rect x="0" y="0" width={Math.max(0, xNow)} height={H} /></clipPath>
          </defs>
          {!post && <rect x={xNow} y="0" width={W - xNow} height={H} fill="url(#gf-hatch)" opacity=".9" />}
          {marks.map((q) => <line key={q} x1={x(q * 900)} x2={x(q * 900)} y1="0" y2={H} className={q === 0 || q === lastPeriod ? "gf-axis" : "gf-grid"} />)}
          <line x1="0" x2={W} y1={MID} y2={MID} className="gf-even" />
          <g clipPath="url(#gf-past)">
            <path d={area} fill="url(#gf-fill-a)" />
            <polyline points={path.join(" ")} className="gf-line" />
          </g>
          <line x1="0" x2="0" y1="0" y2={H} className="gf-axis" />
          <circle cx={x(times[sel])} cy={y(lead[sel])} r="7" className="gf-dot" />
        </svg>
        <div className="gf-x" aria-hidden="true">
          {marks.map((q) => <span key={q} className={q === lastPeriod / 2 ? "half" : ""} style={{ left: `${(q / lastPeriod) * 100}%` }}>{label(q)}<small>{q * 15}m</small></span>)}
        </div>
      </div>

      <div className="gf-stats">
        <div><span className="ico"><TrendingUp size={22} aria-hidden="true" /></span><div><b>{pp(sinceStart)} pp</b><small>{away.abbr} since kickoff</small></div></div>
        <div><div><b>{avg.toFixed(1)} pp</b><small>Avg change<br />(last {n} plays)</small></div></div>
        <div><span className="ico play"><Play size={22} aria-hidden="true" /></span><div><b>{currentLabel}</b><small>Current play</small></div></div>
      </div>

      <div className="gf-play" role="status" aria-live="polite">
        <i aria-hidden="true" />
        <div>
          <p><b>{active == null ? "Current play" : "Play"}</b>{selClock && <> <em>/</em> <strong>{selClock}</strong></>} <em>·</em> <strong>{pp(selMove)} pp to {selMove >= 0 ? away.abbr : home.abbr}</strong></p>
          <p className="txt">{selPlay?.text ?? "Play description unavailable"}</p>
        </div>
      </div>

      <div className="gf-take">
        <span className="gf-take-h"><Crosshair size={34} aria-hidden="true" /><b>Key takeaway</b></span>
        <div>
          {post ? <><strong>Game over.</strong><p>{leader.name} finished with {Math.max(awayWin, homeWin)}% win probability.</p></>
            : side ? <><strong>{side.abbr} is gaining ground.</strong><p>Win probability moved {Math.abs(swingHome).toFixed(1)} pp toward {side.abbr} over the last {n} plays.</p></>
            : <><strong>Win probability is stable.</strong><p>Momentum is balanced over the last {n} plays.</p></>}
        </div>
      </div>
    </section>
  );
}
