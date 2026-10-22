import { logos } from "../data";
import { dayOf, timeOf, tzAbbr, useTz } from "../tz";

export type LevTeam = { id: string; name: string; abbr: string; logoId: string | null; conf: string | null; record: string; cur: number; ifWin?: number | null; ifLoss?: number | null; bye?: boolean };
export type LevGame = { date: string | null; away: LevTeam; home: LevTeam; total: number };
export type Leverage = { week: number; rows: LevTeam[]; games: LevGame[] };

const pc = (n: number) => (n >= 99.5 ? ">99%" : n < 0.5 ? "<1%" : `${Math.round(n)}%`);

const W = 720, LEFT = 70, RIGHT = 70, ROW = 36, TOP = 14, R = 6, LOGO = 30, BAR = 9;
const x = (p: number) => LEFT + (Math.max(0, Math.min(100, p)) / 100) * (W - LEFT - RIGHT);

/** A smooth curve through the points (Catmull-Rom turned into cubic Béziers), as the tail of an SVG path. */
function curve(pts: [number, number][], from = 0) {
  let d = "";
  for (let i = from; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2, t = 0.18;
    d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Every team's playoff odds now (the logo), after a loss in its next game (the orange end) and after a win (the blue end). The longer the bar, the more
 * that game matters. The soft ribbon behind joins the ends of every bar, so the whole race reads as one flowing shape; a team on a bye shows only where it stands.
 */
export function LeverageChart({ rows, label }: { rows: LevTeam[]; label: string }) {
  const h = TOP * 2 + rows.length * ROW;
  const ys = rows.map((_, i) => TOP + i * ROW + ROW / 2);
  const lo = rows.map((r, i): [number, number] => [x(r.ifLoss ?? r.cur), ys[i]]);
  const hi = rows.map((r, i): [number, number] => [x(r.ifWin ?? r.cur), ys[i]]);
  const mid = rows.map((r, i): [number, number] => [x(r.cur), ys[i]]);
  const ribbon = rows.length > 1 ? `M${lo[0][0]},${lo[0][1]}${curve(lo)} L${hi.at(-1)![0]},${hi.at(-1)![1]}${curve([...hi].reverse())} Z` : "";
  const spine = rows.length > 1 ? `M${mid[0][0]},${mid[0][1]}${curve(mid)}` : "";
  return (
    <figure className="lev-chart">
      <div className="lev-key" aria-hidden="true">
        <span><i className="o" /> odds if they lose</span>
        <span><i className="logo">●</i> odds now</span>
        <span><i className="b" /> odds if they win</span>
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label} className="lev-svg">
        <defs>
          <linearGradient id="lev-bar" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--lev-o)" />
            <stop offset="0.5" stopColor="var(--lev-mid)" />
            <stop offset="1" stopColor="var(--lev-b)" />
          </linearGradient>
          <linearGradient id="lev-ribbon" gradientUnits="userSpaceOnUse" x1={x(0)} x2={x(100)} y1="0" y2="0">
            <stop offset="0" stopColor="var(--lev-o)" stopOpacity="0.22" />
            <stop offset="0.55" stopColor="var(--lev-mid)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--lev-b)" stopOpacity="0.24" />
          </linearGradient>
          <filter id="lev-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1.6" floodColor="#000" floodOpacity="0.45" /></filter>
        </defs>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={x(g)} x2={x(g)} y1={TOP} y2={h - TOP} className="lev-grid" />
            <text x={x(g)} y={h - 2} textAnchor="middle" className="lev-tick">{g}%</text>
          </g>
        ))}
        {ribbon && <path d={ribbon} fill="url(#lev-ribbon)" className="lev-ribbon" />}
        {spine && <path d={spine} className="lev-spine" />}
        {rows.map((r, i) => {
          const y = ys[i], src = r.logoId ? logos[r.logoId] : undefined;
          const l = r.ifLoss ?? r.cur, hh = r.ifWin ?? r.cur, wBar = Math.max(x(hh) - x(l), 2);
          const origin = hh > l ? ((r.cur - l) / (hh - l)) * 100 : 50;
          return (
            <g key={r.id} className="lev-row" style={{ ["--i" as string]: i }}>
              <title>{r.bye ? `${r.name}: ${pc(r.cur)} to make the playoffs; bye week` : `${r.name}: ${pc(r.cur)} now, ${pc(l)} with a loss, ${pc(hh)} with a win`}</title>
              <rect x={LEFT - 4} y={y - ROW / 2} width={W - LEFT - RIGHT + 8} height={ROW} rx="8" className="lev-hit" />
              {r.bye ? (
                <text x={r.cur > 65 ? x(r.cur) - LOGO / 2 - 8 : x(r.cur) + LOGO / 2 + 8} y={y + 4} textAnchor={r.cur > 65 ? "end" : "start"} className="lev-bye">{pc(r.cur)} · bye week</text>
              ) : (
                <>
                  <rect x={x(l)} y={y - BAR / 2} width={wBar} height={BAR} rx={BAR / 2} fill="url(#lev-bar)" className="lev-bar" style={{ transformOrigin: `${origin}% 50%` }} />
                  <circle cx={x(l)} cy={y} r={R} className="lev-dot o" />
                  <circle cx={x(hh)} cy={y} r={R} className="lev-dot b" />
                  <text x={x(l) - R - 7} y={y + 4} textAnchor="end" className="lev-n o">{pc(l)}</text>
                  <text x={x(hh) + R + 7} y={y + 4} className="lev-n b">{pc(hh)}</text>
                </>
              )}
              <circle cx={x(r.cur)} cy={y} r={LOGO / 2 + 2} className="lev-disc" filter="url(#lev-shadow)" />
              {src ? <image href={src} x={x(r.cur) - LOGO / 2 + 2} y={y - LOGO / 2 + 2} width={LOGO - 4} height={LOGO - 4} preserveAspectRatio="xMidYMid meet" /> : <text x={x(r.cur)} y={y + 3.5} textAnchor="middle" className="lev-abbr">{r.abbr.slice(0, 3)}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function Mini({ t }: { t: LevTeam }) {
  const src = t.logoId ? logos[t.logoId] : undefined;
  const lo = t.ifLoss ?? t.cur, hi = t.ifWin ?? t.cur;
  return (
    <div className="lev-side">
      {src ? <img src={src} alt="" width="34" height="34" loading="lazy" decoding="async" /> : <span className="ol-chip" aria-hidden="true">{t.abbr.slice(0, 3)}</span>}
      <strong>{t.name}</strong>
      <span className="lev-mini" title={`${pc(lo)} with a loss, ${pc(hi)} with a win`}>
        <b className="o">{pc(lo)}</b>
        <span className="track"><em style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }} /><i className="o" style={{ left: `${lo}%` }} /><i className="b" style={{ left: `${hi}%` }} /></span>
        <b className="b">{pc(hi)}</b>
      </span>
    </div>
  );
}

/** The week's games with both teams' swings added up: where the playoff races are decided. */
export function LeverageGames({ games }: { games: LevGame[] }) {
  useTz();
  const max = Math.max(1, ...games.map((g) => g.total));
  return (
    <ul className="lev-games" aria-label="Playoff leverage by game">
      {games.map((g, i) => (
        <li key={i}>
          <span className="lev-when">{g.date ? <><b>{dayOf(g.date)}</b>{timeOf(g.date, undefined, true)} <small>{tzAbbr()}</small></> : "–"}</span>
          <Mini t={g.away} />
          <span className="lev-at" aria-hidden="true">@</span>
          <Mini t={g.home} />
          <span className="lev-total" style={{ background: `color-mix(in srgb, var(--lime) ${Math.round(12 + (g.total / max) * 58)}%, var(--surface))` }} title="Both teams' swings added together">{g.total.toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}
