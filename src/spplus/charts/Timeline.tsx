import { C, LogoImg, TipView, centreIn, useTip, useWidth } from "./kit";
import type { GameResult } from "../data/types";

/** One bar per game in date order: final margin (blue win, red loss), a dot for the sheet's adjusted margin. */
export function ResultsTimeline({ games, selected, onSelect, oppLabel, logoFor }: { games: GameResult[]; selected: string | null; onSelect: (id: string) => void; oppLabel: (g: GameResult) => string; logoFor: (name: string) => string | undefined }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const w = Math.max(width, 300), h = 240, m = { t: 14, b: 58, l: 40, r: 8 };
  const vals = games.flatMap((g) => [g.margin, g.adjMgn]).filter((v): v is number => v != null);
  const ext = Math.max(10, ...vals.map(Math.abs));
  const lim = Math.ceil(ext / 10) * 10;
  const y = (v: number) => m.t + ((lim - v) / (2 * lim)) * (h - m.t - m.b);
  const cw = (w - m.l - m.r) / Math.max(games.length, 1);
  const bw = Math.min(28, cw * 0.55);
  const ticks = [-lim, -lim / 2, 0, lim / 2, lim];
  if (!games.length) return <p className="empty">No games in the sheet for this team.</p>;
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Final margin and adjusted margin by game" onPointerLeave={hide}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} style={t === 0 ? { stroke: C.axis, strokeWidth: 1.5 } : undefined} />)}</g>
        <g className="axis">{ticks.map((t) => <text key={t} x={m.l - 6} y={y(t) + 4} textAnchor="end">{t > 0 ? `+${t}` : t}</text>)}<text x={0} y={10} className="lbl" style={{ fontSize: 10 }}>Margin (pts)</text></g>
        {games.map((g, i) => {
          const cx = m.l + cw * i + cw / 2;
          const win = g.win === 1;
          const mv = g.margin ?? 0;
          const top = Math.min(y(0), y(mv)), bh = Math.max(Math.abs(y(mv) - y(0)), 1.5);
          const on = selected === g.id;
          const rows: [string, string][] = [["Result", `${win ? "W" : "L"} ${g.pts ?? "—"}–${g.oppPts ?? "—"}`], ["Margin", g.margin == null ? "—" : String(g.margin)], ["Adj. margin", g.adjMgn == null ? "—" : g.adjMgn.toFixed(1)], ["Postgame win exp.", g.pgwe == null ? "—" : `${Math.round(g.pgwe * 100)}%`]];
          const open = (px: number, py: number) => show({ x: px, y: py, title: `${oppLabel(g)} · ${g.date.slice(5)}`, rows });
          const logo = logoFor(g.opp);
          return (
            <g key={g.id} className="pt" tabIndex={0} role="button" aria-pressed={on} aria-label={`${g.date}, ${win ? "win" : "loss"} versus ${g.opp}, ${g.pts} to ${g.oppPts}`}
              onClick={() => onSelect(g.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(g.id); } }}
              onPointerEnter={() => open(cx, y(mv))} onFocus={(e) => { const p = centreIn(ref.current, e.currentTarget); open(p.x, p.y); }} onBlur={hide}>
              <rect x={cx - cw / 2} y={m.t} width={cw} height={h - m.t - m.b + 40} fill="transparent" />
              <rect x={cx - bw / 2} y={top} width={bw} height={bh} rx={3} fill={win ? C.hi : C.lo} opacity={on ? 1 : 0.85} />
              {on && <rect className="ring" x={cx - bw / 2 - 3} y={top - 3} width={bw + 6} height={bh + 6} rx={5} fill="none" stroke={C.ink} strokeWidth={1.5} />}
              {g.adjMgn != null && <circle cx={cx} cy={y(Math.max(-lim, Math.min(lim, g.adjMgn)))} r={4.5} fill={C.surface} stroke={C.ink} strokeWidth={2} />}
              <text x={cx} y={h - 44} textAnchor="middle" style={{ fontSize: 10, fill: C.ink2 }}>{g.date.slice(5).replace("-", "/")}</text>
              <LogoImg href={logo} x={cx - 9} y={h - 38} size={18} fallback={g.opp.slice(0, 4)} />
              <text x={cx} y={h - 8} textAnchor="middle" style={{ fontSize: 10, fill: win ? "#86b6ef" : "#f08a8a", fontWeight: 600 }}>{win ? "W" : "L"} {g.pts}-{g.oppPts}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i style={{ background: C.hi }} />Win margin</span><span><i style={{ background: C.lo }} />Loss margin</span><span><i style={{ background: C.surface, border: `2px solid ${C.ink}`, borderRadius: 6 }} />Adjusted margin (sheet)</span></div>
      <TipView tip={tip} width={w} />
    </div>
  );
}
