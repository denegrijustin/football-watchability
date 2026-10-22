import { logos } from "../data";
import { dayOf, timeOf, tzAbbr, useTz } from "../tz";

export type LevTeam = { id: string; name: string; abbr: string; logoId: string | null; conf: string | null; record: string; cur: number; ifWin?: number | null; ifLoss?: number | null; bye?: boolean };
export type LevGame = { date: string | null; away: LevTeam; home: LevTeam; total: number };
export type Leverage = { week: number; rows: LevTeam[]; games: LevGame[] };

const pc = (n: number) => (n >= 99.5 ? ">99%" : n < 0.5 ? "<1%" : `${Math.round(n)}%`);

const W = 720, LEFT = 70, RIGHT = 70, ROW = 34, TOP = 8, R = 6, LOGO = 28;
const x = (p: number) => LEFT + (Math.max(0, Math.min(100, p)) / 100) * (W - LEFT - RIGHT);

/**
 * Every team's playoff odds now (the logo), after a loss in its next game (the orange end) and after a win (the blue end). The longer the bar, the more
 * that game matters. A team on a bye shows only where it stands.
 */
export function LeverageChart({ rows, label }: { rows: LevTeam[]; label: string }) {
  const h = TOP * 2 + rows.length * ROW;
  return (
    <figure className="lev-chart">
      <div className="lev-key" aria-hidden="true">
        <span><i className="o" /> odds if they lose</span>
        <span><i className="logo">●</i> odds now</span>
        <span><i className="b" /> odds if they win</span>
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label} className="lev-svg">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={x(g)} x2={x(g)} y1={TOP} y2={h - TOP} className="lev-grid" />
          </g>
        ))}
        {rows.map((r, i) => {
          const y = TOP + i * ROW + ROW / 2, src = r.logoId ? logos[r.logoId] : undefined;
          const lo = r.ifLoss ?? r.cur, hi = r.ifWin ?? r.cur;
          return (
            <g key={r.id}>
              <title>{r.bye ? `${r.name}: ${pc(r.cur)} to make the playoffs; bye week` : `${r.name}: ${pc(r.cur)} now, ${pc(lo)} with a loss, ${pc(hi)} with a win`}</title>
              {r.bye ? (
                <text x={r.cur > 65 ? x(r.cur) - LOGO / 2 - 6 : x(r.cur) + LOGO / 2 + 6} y={y + 4} textAnchor={r.cur > 65 ? "end" : "start"} className="lev-bye">{pc(r.cur)} (bye week)</text>
              ) : (
                <>
                  <line x1={x(lo)} x2={x(hi)} y1={y} y2={y} className="lev-bar" />
                  <circle cx={x(lo)} cy={y} r={R} className="lev-dot o" />
                  <circle cx={x(hi)} cy={y} r={R} className="lev-dot b" />
                  <text x={x(lo) - R - 6} y={y + 4} textAnchor="end" className="lev-n o">{pc(lo)}</text>
                  <text x={x(hi) + R + 6} y={y + 4} className="lev-n b">{pc(hi)}</text>
                </>
              )}
              {src ? <image href={src} x={x(r.cur) - LOGO / 2} y={y - LOGO / 2} width={LOGO} height={LOGO} preserveAspectRatio="xMidYMid meet" /> : (
                <g>
                  <circle cx={x(r.cur)} cy={y} r={LOGO / 2} className="lev-chip" />
                  <text x={x(r.cur)} y={y + 3.5} textAnchor="middle" className="lev-abbr">{r.abbr.slice(0, 3)}</text>
                </g>
              )}
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
        <span className="track"><i className="o" style={{ left: `${lo}%` }} /><i className="b" style={{ left: `${hi}%` }} /><em style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }} /></span>
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
