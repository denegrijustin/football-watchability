import { useRef } from "react";
import { centreIn, TipView, useTip, useWidth } from "../../spplus/charts/kit";
import type { TurnoverGame } from "../fieldCalc";
import { poss } from "../drivesCalc";

const H = 284, UP = 100, MID = 112, DOWN = 100;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** One column per game: takeaways rise above the line, giveaways drop below it, the margin and the running margin sit underneath. */
export function TurnoverChart({ games, selected, onSelect, abbr, teamName }: { games: TurnoverGame[]; selected: string | null; onSelect: (g: string | null) => void; abbr: (id: string) => string; teamName: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const wrap = useRef<HTMLDivElement>(null);
  const { tip, show, hide } = useTip();
  const max = Math.max(2, ...games.flatMap((g) => [g.gives, g.takes]));
  const L = 6, cw = games.length ? (w - L * 2) / games.length : 0;
  const bw = Math.min(26, Math.max(8, cw * 0.62));
  const unit = Math.min(26, (UP - 18) / max);
  const wide = cw >= 34;
  const tipOf = (g: TurnoverGame, el: Element) =>
    show({ ...centreIn(wrap.current, el), title: `Week ${g.week} ${g.row.h === 0 ? "at" : "vs"} ${abbr(g.opp)}`, rows: [["Takeaways", String(g.takes)], ["Giveaways", String(g.gives)], ["Margin", signed(g.margin)], ["Season margin so far", signed(g.running)]] });
  return (
    <div ref={ref} className="fl-turn">
      <div ref={wrap} className="fl-wrap" onPointerLeave={hide}>
        {w > 0 && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="group" aria-label={`${poss(teamName)} takeaways and giveaways by game. Tap a column to open that game.`}>
            <defs>
              <pattern id="fl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--rs-turnover)" /><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.4)" strokeWidth="2.5" /></pattern>
            </defs>
            <text x={L} y={11} className="fl-yt">Takeaways ▲</text>
            <text x={L} y={MID + DOWN + 12} className="fl-yt">Giveaways ▼</text>
            {games.map((g, i) => {
              const cx = L + cw * i + cw / 2, on = selected === g.row.g;
              const label = `Week ${g.week} ${g.row.h === 0 ? "at" : "vs"} ${abbr(g.opp)}: ${g.takes} takeaway${g.takes === 1 ? "" : "s"}, ${g.gives} giveaway${g.gives === 1 ? "" : "s"}, margin ${signed(g.margin)}`;
              return (
                <g
                  key={g.row.g} role="button" tabIndex={0} aria-pressed={on} aria-label={label} className="fl-col"
                  onClick={() => onSelect(on ? null : g.row.g)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(on ? null : g.row.g); } }}
                  onPointerEnter={(e) => e.pointerType === "mouse" && tipOf(g, e.currentTarget as unknown as Element)} onPointerLeave={hide}
                  onFocus={(e) => e.currentTarget.matches(":focus-visible") && tipOf(g, e.currentTarget as unknown as Element)} onBlur={hide}
                >
                  <rect x={cx - cw / 2} y={0} width={cw} height={H} className={`fl-colbg${on ? " on" : ""}`} />
                  {g.takes > 0 && <rect x={cx - bw / 2} y={MID - g.takes * unit} width={bw} height={g.takes * unit} rx={3} fill="var(--rs-td)" />}
                  {g.takes > 0 && <text x={cx} y={MID - g.takes * unit - 4} textAnchor="middle" className="fl-n">{g.takes}</text>}
                  {g.gives > 0 && <rect x={cx - bw / 2} y={MID} width={bw} height={g.gives * unit} rx={3} fill="url(#fl-hatch)" />}
                  {g.gives > 0 && <text x={cx} y={MID + g.gives * unit + 12} textAnchor="middle" className="fl-n">{g.gives}</text>}
                  <text x={cx} y={MID + DOWN + 30} textAnchor="middle" className="fl-xt">{wide ? `${g.week} ${abbr(g.opp).slice(0, 4)}` : g.week}</text>
                  <text x={cx} y={MID + DOWN + 46} textAnchor="middle" className={`fl-m ${g.margin > 0 ? "up" : g.margin < 0 ? "down" : ""}`}>{signed(g.margin)}</text>
                  <text x={cx} y={MID + DOWN + 60} textAnchor="middle" className="fl-xt">{signed(g.running)}</text>
                </g>
              );
            })}
            <line x1={L} x2={w - L} y1={MID} y2={MID} className="fl-axis" />
          </svg>
        )}
        <TipView tip={tip} width={w} />
      </div>
      <p className="sub fl-rowkey">Under each column: week and opponent, the game's margin (takeaways minus giveaways), and the margin so far this season.</p>
    </div>
  );
}
