import { useState } from "react";

export type TrendGame = {
  wk: number | null;
  opp: string;
  oppName?: string;
  oppRank?: number | null;
  home: boolean;
  neutral?: boolean;
  pf: number;
  pa: number;
  post?: boolean;
};
export type Trend = {
  games: TrendGame[];
  ppg: number;
  oppg: number;
  margin: number;
  streak: string;
  last3Margin: number | null;
};

const result = (g: TrendGame) => (g.pf > g.pa ? "W" : g.pf < g.pa ? "L" : "T");
export const gameLabel = (g: TrendGame) =>
  `${g.wk ? `Wk ${g.wk}` : g.post ? "Bowl" : ""} ${g.neutral ? "vs" : g.home ? "vs" : "at"} ${g.oppRank ? `#${g.oppRank} ` : ""}${g.oppName ?? g.opp} · ${result(g)} ${g.pf}–${g.pa}`.trim();
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/**
 * Scoring margin per game: wins rise above the midline (blue), losses drop
 * below it (red). `up`/`down` are shared across both teams on a card so bars are
 * comparable. Each game is a focusable hit area with a tooltip.
 */
export function MarginBars({
  games,
  up,
  down,
  slots,
  height = 40,
  showWeeks = false,
  label,
}: {
  games: TrendGame[];
  /** Largest win margin and largest loss margin across the teams being compared. */
  up: number;
  down: number;
  slots: number;
  height?: number;
  showWeeks?: boolean;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 240;
  const axisH = showWeeks ? 14 : 0;
  const H = height;
  // Baseline sits where the wins/losses split the height, so an all-wins card
  // doesn't waste half its space; both teams share up/down so bars compare.
  const span = up + down || 1;
  const mid = Math.max(6, Math.min(H - 6, (up / span) * H));
  const slot = W / Math.max(slots, 1);
  const bw = Math.min(24, slot * 0.62);
  const r = 4;
  const bar = (g: TrendGame, i: number) => {
    const m = g.pf - g.pa;
    const x = i * slot + (slot - bw) / 2;
    const room = m >= 0 ? mid - 2 : H - mid - 2;
    const h = Math.max(2, (Math.abs(m) / (m >= 0 ? up || 1 : down || 1)) * room);
    const rr = Math.min(r, h, bw / 2);
    if (m === 0) return <circle cx={x + bw / 2} cy={mid} r={4} className="mb-tie" />;
    if (m > 0) {
      const y = mid - h;
      return (
        <path
          className="mb-win"
          d={`M${x},${mid} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${mid} Z`}
        />
      );
    }
    const y = mid + h;
    return (
      <path
        className="mb-loss"
        d={`M${x},${mid} V${y - rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y - rr} V${mid} Z`}
      />
    );
  };
  return (
    <div className="mb-wrap">
      <svg
        viewBox={`0 0 ${W} ${H + axisH}`}
        className="mb-svg"
        role="img"
        aria-label={`${label}: ${games.map(gameLabel).join("; ")}`}
        preserveAspectRatio="none"
      >
        <line x1={0} x2={W} y1={mid} y2={mid} className="mb-base" />
        {games.map((g, i) => (
          <g key={i} className={active === i ? "mb-active" : undefined}>
            {bar(g, i)}
            <rect
              x={i * slot}
              y={0}
              width={slot}
              height={H}
              fill="transparent"
              tabIndex={0}
              aria-label={gameLabel(g)}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
            {showWeeks && (
              <text x={i * slot + slot / 2} y={H + 11} className="mb-week" textAnchor="middle">
                {g.wk ? `W${g.wk}` : "B"}
              </text>
            )}
          </g>
        ))}
      </svg>
      {active != null && games[active] && (
        <div
          className="mb-tip"
          style={{ left: `${((active + 0.5) / Math.max(slots, 1)) * 100}%` }}
          role="status"
        >
          <strong>
            {result(games[active])} {games[active].pf}–{games[active].pa}
          </strong>
          <span>
            {games[active].wk ? `Wk ${games[active].wk} · ` : ""}
            {games[active].home || games[active].neutral ? "vs" : "at"}{" "}
            {games[active].oppRank ? `#${games[active].oppRank} ` : ""}
            {games[active].oppName ?? games[active].opp}
          </span>
        </div>
      )}
    </div>
  );
}
