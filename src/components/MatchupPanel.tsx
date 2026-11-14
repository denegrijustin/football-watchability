import { useState } from "react";
import { CloudSun, Droplet, Wind } from "lucide-react";
import { cleanRank, logos, type Game } from "../data";
import { gameLabel, type Trend } from "./MarginBars";
import "../matchup2.css";

type T = { name: string; abbr?: string; logoId: string; record: string; rankings?: string[]; playoffOdds?: number[]; trend?: Trend | null };
type Wx = { icon?: string; title?: string; detail?: string; hours?: { tempF: number; precip: number; windMph: number; gustMph: number }[] };

/** "LSU -4.5 • O/U 46.5" inside the saved meta line, as the spread and the total. */
function lineParts(meta: string | undefined) {
  const m = /([^·]*?\s[-+]\d+(?:\.\d+)?)\s*[•·]\s*O\/U\s*(\d+(?:\.\d+)?)/.exec(meta ?? "");
  return m ? { spread: m[1].trim().split(/\s+/).slice(-2).join(" "), total: m[2] } : null;
}

const W = 560;
const H = 210;

/**
 * Matchup & season: game conditions, win probability, spread, total, rank and playoff odds, the last eight games for each team as win/loss squares,
 * and the scoring margin of every game as a bar chart.
 */
export function MatchupPanel({ game }: { game: Game }) {
  const [tip, setTip] = useState<string | null>(null);
  const [a, h] = game.teams as unknown as [T, T];
  const wx = game.weather as unknown as Wx;
  const hour = wx.hours?.[0];
  const venue = (game as unknown as { meta?: string }).meta?.split("·").at(-1)?.trim();
  const homeWin = (game as unknown as { winProb?: { home: number } }).winProb?.home;
  const line = lineParts((game as unknown as { meta?: string }).meta);
  const aAbbr = a.abbr ?? a.name, hAbbr = h.abbr ?? h.name;
  const rank = (t: T) => (t.rankings?.[0] ? cleanRank(t.rankings[0]) : "NR");
  const forms = [a, h].map((t) => (t.trend?.games ?? []).slice(-8));
  const record = (g: { pf: number; pa: number }[]) => `${g.filter((x) => x.pf > x.pa).length}-${g.filter((x) => x.pf < x.pa).length}`;
  const slots = Math.max(0, ...[a, h].map((t) => Math.min(12, t.trend?.games.length ?? 0)));
  const margins = [a, h].map((t) => (t.trend?.games ?? []).slice(-12).map((g) => g.pf - g.pa));
  const all = margins.flat();
  const top = Math.max(10, Math.ceil(Math.max(0, ...all) / 10) * 10);
  const bot = Math.max(10, Math.ceil(Math.max(0, ...all.map((v) => -v)) / 10) * 10);
  const y = (v: number) => 10 + ((top - v) / (top + bot)) * (H - 24);
  const ticks = Array.from({ length: (top + bot) / 10 + 1 }, (_, i) => top - i * 10);
  const step = (W - 56) / Math.max(1, slots);

  return (
    <section className="gc-panel gc-wide mp" aria-label="Matchup and season analysis">
      <h3 className="mp-title"><i aria-hidden="true" />Matchup &amp; season analysis</h3>

      <div className="mp-top">
        <div className="mp-card mp-wx">
          <h4>Game conditions{venue && <small> ({venue})</small>}</h4>
          <div className="mp-wx-row">
            <span className="mp-sky" aria-hidden="true">{wx.icon ?? <CloudSun size={48} />}</span>
            <b className="mp-temp">{hour ? `${hour.tempF}°F` : "–"}</b>
            {hour && <span className="mp-wx-m"><Droplet size={18} aria-hidden="true" /><b>{hour.precip}%</b><small>Precip.</small></span>}
            {hour && <span className="mp-wx-m"><Wind size={18} aria-hidden="true" /><b>{Math.max(hour.windMph, hour.gustMph)} <small>mph</small></b><small>Wind</small></span>}
            {wx.title && <span className="mp-wx-m sky"><b>{wx.title}</b></span>}
          </div>
        </div>
        {homeWin != null && (
          <div className="mp-card mp-wp">
            <h4>Win probability</h4>
            <div className="mp-wp-row" role="img" aria-label={`Win probability: ${aAbbr} ${Math.round(100 - homeWin)}%, ${hAbbr} ${Math.round(homeWin)}%`}>
              <img src={logos[a.logoId]} alt="" width="44" height="44" /><b>{Math.round(100 - homeWin)}%</b>
              <span className="mp-bar"><i style={{ width: `${homeWin}%` }} /><em style={{ left: `${100 - homeWin}%` }} /></span>
              <b>{Math.round(homeWin)}%</b><img src={logos[h.logoId]} alt="" width="44" height="44" />
            </div>
          </div>
        )}
      </div>

      <div className="mp-tiles">
        <div className="mp-card"><h4>Current spread</h4><p>{line?.spread ?? "–"}</p></div>
        <div className="mp-card"><h4>Total (O/U)</h4><p>{line?.total ?? "–"}</p></div>
        <div className="mp-card"><h4>{game.league === "NFL" ? "FPI rank" : "AP rank"}</h4><p className="two"><img src={logos[a.logoId]} alt="" width="30" height="30" />{rank(a)}<img src={logos[h.logoId]} alt="" width="30" height="30" />{rank(h)}</p></div>
        <div className="mp-card"><h4>Playoff odds</h4><p className="two"><img src={logos[a.logoId]} alt="" width="30" height="30" />{a.playoffOdds?.[0] ?? "–"}%<img src={logos[h.logoId]} alt="" width="30" height="30" />{h.playoffOdds?.[0] ?? "–"}%</p></div>
      </div>

      {forms[0].length > 0 && (
        <div className="mp-charts">
          <div className="mp-card mp-form">
            <h4>Season form<small> (last {Math.max(forms[0].length, forms[1].length)} games)</small><span className="mp-key"><i className="w" />Win<i className="l" />Loss</span></h4>
            {[a, h].map((t, i) => (
              <div key={t.name} className="mp-form-row">
                <span className="mp-fteam"><img src={logos[t.logoId]} alt="" width="36" height="36" /><b>{t.abbr ?? t.name}</b></span>
                <span className="mp-sq" role="img" aria-label={`${t.name}: ${forms[i].map((g) => (g.pf > g.pa ? "W" : g.pf < g.pa ? "L" : "T")).join(" ")}`}>
                  {forms[i].map((g, k) => <i key={k} className={g.pf > g.pa ? "w" : g.pf < g.pa ? "l" : "t"} />)}
                </span>
                <b className="mp-rec">{record(forms[i])}</b>
              </div>
            ))}
          </div>
          <div className="mp-card mp-margin">
            <h4>Scoring margin by game<span className="mp-key"><i className="a" />{aAbbr}<i className="h" />{hAbbr}</span></h4>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scoring margin of each of the last games for both teams">
              {ticks.map((t) => (
                <g key={t}><line x1="48" x2={W} y1={y(t)} y2={y(t)} className={t === 0 ? "zero" : "grid"} /><text x="42" y={y(t) + 5} textAnchor="end">{t > 0 ? `+${t}` : t}</text></g>
              ))}
              {margins.map((ms, side) => ms.map((v, i) => {
                const x = 54 + i * step + side * (step * 0.36) + step * 0.06;
                const y0 = y(0), y1 = y(v);
                const g = (side ? h : a).trend!.games.slice(-12)[i];
                const label = `${side ? hAbbr : aAbbr}: ${gameLabel(g)}`;
                return <rect key={`${side}-${i}`} x={x} y={Math.min(y0, y1)} width={step * 0.34} height={Math.max(2, Math.abs(y1 - y0))} rx="2" className={side ? "h" : "a"} tabIndex={0} aria-label={label} onFocus={() => setTip(label)} onBlur={() => setTip(null)} onMouseEnter={() => setTip(label)} onMouseLeave={() => setTip(null)}><title>{label}</title></rect>;
              }))}
            </svg>
            {tip && <p className="mp-tip" role="status">{tip}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
