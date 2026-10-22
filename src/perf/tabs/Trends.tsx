import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePerf } from "../data";
import { gamesFor, summarizeGames } from "../engine";
import { TrendChart, type TrendLine, type TrendPoint } from "../charts/trendsChart";
import { InfoTip, PerfFrame, Unavailable, useTeamColors } from "../ui";
import {
  buildSeries, contribution, direction, gameDetail, higherIsBetter, leagueValue, meanOf, rollLabel, seriesDirection, trendMetrics, trendSentence,
  type SeriesPoint, type Side, type TMetric,
} from "../trendsCalc";
import { poss } from "../matchupCalc";
import type { PerfData, PerfSelection } from "../types";

const ROLLS = [1, 2, 3, 4, 5];
const ADJ_STEP = 0.5;

const abbr = (data: PerfData, id: string) => data.teams[id]?.abbr ?? id;
const where = (h: number) => (h === 0 ? "at" : "vs");

function GameDetail({ p, data, sel, team, metric, side, adj, onClose }: { p: SeriesPoint; data: PerfData; sel: PerfSelection; team: string; metric: TMetric; side: Side; adj: { week: number; total: number; off: number; def: number } | null; onClose: () => void }) {
  const { adapter } = usePerf();
  const c = useMemo(() => contribution(data, sel, team, metric, side, p.g), [data, sel, team, metric, side, p.g]);
  const lg = useMemo(() => leagueValue(data, sel, metric, side), [data, sel, metric, side]);
  const det = useMemo(() => gameDetail(data, sel, p.row, side), [data, sel, p.row, side]);
  const game = data.games.find((g) => g.id === p.g);
  const better = higherIsBetter(metric, side);
  const diff = p.value != null && c.all != null ? p.value - c.all : null;
  const good = diff == null ? null : better ? diff > 0 : diff < 0;
  const unit = side === "off" ? "offense" : "defense";
  const name = adapter.short(team);
  const t = det.tally;
  return (
    <div className="panel tr-detail" role="region" aria-label={`Week ${p.week} game details`}>
      <div className="phead">
        <div>
          <h2>Week {p.week} · {where(p.home)} {adapter.name(p.opp)} · {p.result} {p.scoreFor}–{p.scoreAgainst}</h2>
          <p className="sub" style={{ margin: 0 }}>{game?.date ? `${game.date} · ` : ""}{p.home === 2 ? "Neutral site · " : ""}Final{game?.ot ? " (overtime)" : ""}</p>
        </div>
        <button type="button" className="btn small" onClick={onClose}>Close</button>
      </div>
      <p className="tr-sent">
        {p.value == null ? `No ${metric.label.toLowerCase()} figure for this game.` : <>In this game {poss(name)} {unit} had {metric.long(p.value)}
          {c.all != null && diff != null && <>, {Math.abs(diff) < metric.step / 5 ? "right at" : good ? "better than" : "worse than"} its season figure of {metric.fmt(c.all)}</>}.
          {c.without != null && c.all != null && c.games > 1 && <> Without this game, the season figure would be {metric.fmt(c.without)} instead of {metric.fmt(c.all)}.</>}</>}
        {p.small && ` This game has a small sample (${p.plays} ${metric.sampleUnit}).`}
      </p>
      <dl className="kv">
        <div><dt>This game</dt><dd>{metric.fmt(p.value)}</dd></div>
        <div><dt>Season figure ({c.games} games)</dt><dd>{metric.fmt(c.all)}</dd></div>
        <div><dt>Without this game</dt><dd>{metric.fmt(c.without)}</dd></div>
        <div><dt>League average</dt><dd>{metric.fmt(lg)}</dd></div>
        <div><dt>Sample</dt><dd>{p.plays} {metric.sampleUnit}{p.small ? " (small)" : ""}</dd></div>
        {adj && <div><dt>{adapter.adjustedLabel}, after this week</dt><dd>{side === "off" ? `offense ${adj.off.toFixed(1)}` : `defense ${adj.def.toFixed(1)}`} (adjusted)</dd></div>}
      </dl>

      <h3>{side === "off" ? `${poss(name)} drives` : `Drives against ${poss(name)} defense`}</h3>
      {!det.hasRow ? <p className="sub">The other team's play-by-play for this game is not in the file, so its drives cannot be listed.</p> : det.lines.length === 0 ? <p className="sub">No counted drives in this game under the current filters.</p> : (
        <>
          <p className="sub">{det.lines.length} drives: {t.td} touchdown{t.td === 1 ? "" : "s"}, {t.fg} field goal{t.fg === 1 ? "" : "s"}, {t.punt} punt{t.punt === 1 ? "" : "s"}, {t.turnover} turnover{t.turnover === 1 ? "" : "s"}{t.other ? `, ${t.other} other` : ""}.{sel.garbage === "skip" ? " Garbage-time drives are skipped." : ""}</p>
          <div className="tbl-wrap">
            <table className="tbl" aria-label="Drives in this game">
              <thead><tr><th>Qtr</th><th>Started</th><th>Plays–yards</th><th>Result</th><th className="r">Pts</th></tr></thead>
              <tbody>{det.lines.map((l, i) => <tr key={i}><td>{l.period > 4 ? "OT" : l.period}</td><td>{l.start}</td><td>{l.plays}–{l.yards}</td><td>{l.result}</td><td className="r">{l.pts}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      <h3>{side === "off" ? "Biggest plays" : "Biggest plays allowed"}</h3>
      {det.plays.length === 0 ? <p className="sub">No explosive plays recorded for this side in this game.</p> : (
        <ol className="tr-plays">
          {det.plays.map((k, i) => (
            <li key={i}><b>{k[2]} yards</b> <span className="tr-kind">{k[3] ? "pass" : "run"} · {k[0] > 4 ? "OT" : `Q${k[0]}`} {k[1]}</span><span className="tr-desc">{k[4]}</span></li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function Trends() {
  const { data, sel, set, adapter } = usePerf();
  const colors = useTeamColors();
  const [roll, setRoll] = useState(3);
  const [view, setView] = useState<"raw" | "adj">("raw");
  const root = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const hasEpa = data?.config.hasEpa ?? false;
  const metrics = useMemo(() => trendMetrics(hasEpa), [hasEpa]);
  const metric = metrics.find((m) => `tr:${m.id}` === sel.metric) ?? metrics[0];
  const side: Side = sel.side;
  const team = sel.team, oppId = sel.opp;
  const adjusted = view === "adj";

  const pts = useMemo(() => (data && team ? buildSeries(data, sel, team, metric, side, roll) : []), [data, sel, team, metric, side, roll]);
  const oppPts = useMemo(() => (data && oppId && sel.bench === "opp" ? buildSeries(data, sel, oppId, metric, side, roll) : []), [data, sel, oppId, metric, side, roll]);
  const adjRows = team ? adapter.adjusted(team) : null;
  const adjOpp = oppId ? adapter.adjusted(oppId) : null;
  const adjAt = (rows: typeof adjRows, week: number) => rows?.find((r) => r.week === week) ?? null;
  const adjVal = (r: ReturnType<typeof adjAt>) => (r ? (side === "off" ? r.off : r.def) : null);

  const selected = pts.find((p) => p.g === sel.game) ?? null;
  const league = useMemo(() => (data && !adjusted && sel.bench === "league" ? leagueValue(data, sel, metric, side) : null), [data, sel, metric, side, adjusted]);
  const seasonAll = useMemo(() => (data && team && pts.length ? metric.read(summarizeGames(data, team, gamesFor(data, team, { ...sel, window: "season" }), sel.garbage), side, false) : null), [data, team, pts.length, sel, metric, side]);

  // Direction and takeaway.
  const adjUsable = adjusted && !!adjRows && pts.some((p) => adjAt(adjRows, p.week));
  const dir = useMemo(() => {
    if (!data || !team) return null;
    if (adjUsable) return direction(pts.map((p) => adjVal(adjAt(adjRows, p.week))), side === "off" ? "high" : "low", ADJ_STEP);
    return seriesDirection(data, sel, team, metric, side, pts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sel, team, metric, side, pts, adjUsable, adjRows]);
  const name = team ? adapter.short(team) : "";
  const take = dir && team && !(adjusted && !adjUsable)
    ? trendSentence({ name, side, label: metric.label, d: dir, fmt: adjUsable ? (v) => (v == null ? "—" : v.toFixed(1)) : metric.fmt, adjusted: adjUsable ? `its ${adapter.adjustedLabel}` : null })
    : null;
  const takeSmall = dir
    ? adjUsable ? `Opponent-adjusted: ${adapter.adjustedLabel} accounts for who ${name} played. It describes what happened, not why.`
      : `Raw results, not adjusted for opponent strength. Describes the games played, not why they went that way or what comes next. ${pts.length} game${pts.length === 1 ? "" : "s"}${sel.garbage === "skip" ? ", garbage time skipped" : ""}.`
    : undefined;

  const trendPts: TrendPoint[] = pts.map((p) => {
    const opp = `${p.home === 0 ? "@" : ""}${data ? abbr(data, p.opp) : p.opp}`;
    const res = `${p.result} ${p.scoreFor}–${p.scoreAgainst}`;
    const a = adjAt(adjRows, p.week);
    const y = adjusted ? adjVal(a) : p.value;
    const f = adjusted ? (v: number | null) => (v == null ? "—" : v.toFixed(1)) : metric.fmt;
    const oppAt = oppPts.find((q) => q.week === p.week);
    const rows: [string, string][] = [["Result", res], [adjusted ? adapter.adjustedLabel : metric.label, f(y)]];
    if (!adjusted && p.rolling != null) rows.push([`${roll}-game average`, metric.fmt(p.rolling)]);
    if (!adjusted) rows.push(["Sample", `${p.plays} ${metric.sampleUnit}${p.small ? " (small)" : ""}`]);
    if (!adjusted && oppId && sel.bench === "opp" && oppAt?.value != null) rows.push([adapter.short(oppId), metric.fmt(oppAt.value)]);
    rows.push([adjusted ? "Adjusted for opponent" : "Not adjusted for opponent", ""]);
    return {
      g: p.g, week: p.week, opp, y, roll: adjusted ? null : p.rolling, logo: adapter.mark(p.opp, 18), tipTitle: `Week ${p.week} ${where(p.home)} ${abbr(data!, p.opp)}`, tip: rows, small: !adjusted && p.small,
      aria: `Week ${p.week}, ${where(p.home)} ${adapter.name(p.opp)}, ${res}. ${adjusted ? adapter.adjustedLabel : metric.label} ${f(y)}. Press Enter to ${p.g === sel.game ? "close" : "inspect"} this game.`,
    };
  });
  const oppLine: TrendLine | null = oppId && sel.bench === "opp" && data
    ? adjusted
      ? { label: abbr(data, oppId), color: colors.b, pts: pts.length ? (adjOpp ?? []).filter((r) => r.week >= 1).map((r) => ({ week: r.week, v: adjVal(r)! })).filter((q) => q.week <= Math.max(...pts.map((p) => p.week))) : [] }
      : { label: abbr(data, oppId), color: colors.b, pts: oppPts.flatMap((q) => { const v = roll > 1 ? q.rolling : q.value; return v == null ? [] : [{ week: q.week, v }]; }) }
    : null;
  const invert = adjusted ? side === "def" : !higherIsBetter(metric, side);
  const rl = rollLabel(roll);

  const pick = (g: string | null) => { set({ game: g }); if (g) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && selected) { set({ game: null }); } };

  const tableVal = (p: SeriesPoint) => (adjusted ? adjVal(adjAt(adjRows, p.week)) : p.value);
  const tf = adjusted ? (v: number | null) => (v == null ? "—" : v.toFixed(1)) : metric.fmt;
  const adjMean = adjUsable ? meanOf(pts.map((p) => adjVal(adjAt(adjRows, p.week)))) : null;
  const avg = adjusted ? adjMean : seasonAll;
  const better = adjusted ? side === "off" : higherIsBetter(metric, side);

  return (
    <PerfFrame
      title="Trends" question="Is this team getting better?"
      show={{ opp: true, bench: true, side: true, garbage: true }}
      takeaway={take} takeSmall={takeSmall}
      defs={["efficiency", "success", "explosive", "drive", "garbage"]}
    >
      <div ref={root} className="tr" onKeyDown={onKey}>
        {!hasEpa && <Unavailable what="Expected points added (EPA)" instead="College data does not include it, so efficiency here is the share of plays that were successful." />}

        <div className="tr-tools">
          <div className="field">
            <span id="tr-m">Measure</span>
            <div className="tr-chips" role="group" aria-labelledby="tr-m">
              {metrics.map((m) => <button key={m.id} type="button" className={`btn small${m.id === metric.id ? " on" : ""}`} aria-pressed={m.id === metric.id} disabled={adjusted} onClick={() => set({ metric: `tr:${m.id}` })}>{m.label}</button>)}
            </div>
          </div>
          <div className="field">
            <span id="tr-v">Results</span>
            <div className="seg" role="group" aria-labelledby="tr-v">
              <button type="button" aria-pressed={!adjusted} onClick={() => setView("raw")}>Raw</button>
              <button type="button" aria-pressed={adjusted} onClick={() => setView("adj")}>Opponent-adjusted</button>
            </div>
          </div>
          <div className="field">
            <span id="tr-r">Rolling average <InfoTip label="rolling average">Each point on the thick line is the team's figure over its most recent games (all plays pooled), so one big game moves it less. It starts once that many games are played.</InfoTip></span>
            <div className="seg" role="group" aria-labelledby="tr-r">
              {ROLLS.map((n) => <button key={n} type="button" aria-pressed={roll === n} disabled={adjusted} onClick={() => setRoll(n)}>{n === 1 ? "Off" : n}</button>)}
            </div>
          </div>
        </div>

        {team && data && (
          <section className="panel tr-panel" aria-label="Trend chart">
            <div className="phead">
              <div>
                <h2>{name} {side === "off" ? "offense" : "defense"}: {adjusted ? `${adapter.adjustedLabel}` : metric.label}</h2>
                <p className="sub" style={{ margin: 0 }}>
                  {adjusted ? <>Adjusted for opponent strength using the {adapter.adjustedLabel}. <InfoTip label={adapter.adjustedLabel}>{adapter.adjustedNote}</InfoTip></> : <>Raw results: not adjusted for opponent strength. {metric.plain}.</>}
                  {" "}{invert ? "Up is better; the axis is flipped because lower is better here." : "Up is better."}
                </p>
              </div>
            </div>
            {adjusted && !adjUsable ? (
              <Unavailable what={`${adapter.adjustedLabel} for ${adapter.name(team)}`} instead="Opponent-adjusted weekly ratings do not exist for this team yet. Switch to Raw to see the game-by-game results, which are not adjusted for opponent strength." />
            ) : pts.length === 0 ? <p className="empty">No games with data for {adapter.name(team)} under the current filters.</p> : (
              <>
                <TrendChart
                  pts={trendPts} color={colors.a} teamLabel={abbr(data, team)} rollLabel={adjusted ? null : rl} opp={oppLine} league={league != null ? { v: league, label: "League average" } : null}
                  invert={invert} yFormat={adjusted ? (v) => v.toFixed(1) : (v) => metric.fmt(v)} yTitle={metric.label} selected={sel.game} onSelect={pick}
                  ariaLabel={`${name} ${side === "off" ? "offense" : "defense"} by game. Use the arrow keys to move between games and Enter to inspect one.`}
                />
                <div className="legend" aria-label="Legend">
                  <span><svg width="22" height="10" aria-hidden="true"><circle cx="11" cy="5" r="4" fill={colors.a} /></svg>{name}, each game{!adjusted ? " (hollow dot: small sample)" : ""}</span>
                  {!adjusted && rl && <span><svg width="22" height="10" aria-hidden="true"><line x1="1" x2="21" y1="5" y2="5" stroke={colors.a} strokeWidth="3.5" strokeLinecap="round" /></svg>{rl}</span>}
                  {league != null && <span><svg width="22" height="10" aria-hidden="true"><line x1="1" x2="21" y1="5" y2="5" stroke="currentColor" strokeDasharray="2 3" strokeWidth="1.5" /></svg>League average, full season</span>}
                  {oppLine && oppId && <span><svg width="22" height="10" aria-hidden="true"><line x1="1" x2="21" y1="5" y2="5" stroke={colors.b} strokeWidth="2" strokeDasharray="5 3" /></svg>{adapter.short(oppId)}{!adjusted && roll > 1 ? ` (${roll}-game avg)` : ""}</span>}
                  {adjusted && sel.bench === "league" && <span>No league line: opponent-adjusted ratings have no single league average here.</span>}
                  {sel.bench === "opp" && !oppId && <span>Choose a team in "Compare with" to draw its line.</span>}
                </div>
              </>
            )}
          </section>
        )}

        <div ref={detailRef}>
          {selected && data && team && <GameDetail p={selected} data={data} sel={sel} team={team} metric={metric} side={side} adj={adjAt(adjRows, selected.week)} onClose={() => set({ game: null })} />}
        </div>

        {team && data && pts.length > 0 && !(adjusted && !adjUsable) && (
          <section className="panel" aria-label="Games">
            <h2>Game by game</h2>
            <p className="sub">Select a game to see the drives and biggest plays behind it. The difference column compares each game with the {adjusted ? "average of the weekly ratings" : "season figure"}{avg != null ? ` (${tf(avg)})` : ""}.</p>
            <div className="tbl-wrap">
              <table className="tbl tr-tbl" aria-label="Games and results">
                <thead><tr><th>Week</th><th>Opponent</th><th>Result</th><th className="r">{adjusted ? adapter.adjustedLabel : metric.label}</th><th className="r">vs {adjusted ? "average" : "season"}</th></tr></thead>
                <tbody>
                  {pts.map((p) => {
                    const v = tableVal(p);
                    const d = v != null && avg != null ? v - avg : null;
                    const isSel = p.g === sel.game;
                    const goodD = d == null ? null : better ? d > 0 : d < 0;
                    return (
                      <tr key={p.g} className={isSel ? "sel" : undefined} onClick={() => pick(isSel ? null : p.g)}>
                        <td><button type="button" className="tr-rowbtn" aria-pressed={isSel} onClick={() => pick(isSel ? null : p.g)}>{p.week}</button></td>
                        <td><span className="tm">{adapter.mark(p.opp, 18)}{where(p.home)} {abbr(data, p.opp)}</span></td>
                        <td>{p.result} {p.scoreFor}–{p.scoreAgainst}</td>
                        <td className="r">{tf(v)}{!adjusted && p.small && <small className="small-flag"> small</small>}</td>
                        <td className="r">{d == null ? "—" : <span className={Math.abs(d) < 1e-9 ? "delta flat" : goodD ? "delta up" : "delta down"}>{`${d >= 0 ? "+" : "−"}${tf(Math.abs(d)).replace(/^\+/, "")}`} {goodD == null || Math.abs(d) < 1e-9 ? "" : goodD ? "better" : "worse"}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </PerfFrame>
  );
}
