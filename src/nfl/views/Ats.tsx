import { useMemo, useState } from "react";
import { useNfl } from "../useNfl";
import { useNflRoute } from "../store";
import { atsGames, pendingPicks, type NflAtsGame } from "../model";
import { NflMark, NflTeamLink, Notes, Derived } from "../common";
import { SortTable, type Col } from "../../spplus/components/SortTable";
import { AtsChart } from "../../spplus/charts/AtsChart";
import { BREAK_EVEN, byEdge, recordText, tally, weeklyTracker } from "../../spplus/data/ats";
import { dateLabel, fmt, fmtPct, fmtSigned, timeLabel } from "../../spplus/data/derive";
import { normCdf } from "../../spplus/sim/rng";

const BUCKETS = [{ lo: 0, hi: 1.5, label: "Under 1.5" }, { lo: 1.5, hi: 3, label: "1.5 to 3" }, { lo: 3, hi: 5, label: "3 to 5" }, { lo: 5, hi: Infinity, label: "5 or more" }];

const wilson = (w: number, n: number): [number, number] | null => {
  if (!n) return null;
  const z = 1.96, p = w / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, e = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - e, c + e];
};

export default function Ats() {
  const { data } = useNfl();
  const [route, nav] = useNflRoute();
  const [limit, setLimit] = useState(100);
  if (!data) return null;
  const games = useMemo(() => atsGames(data), [data]);
  const weeks = useMemo(() => weeklyTracker(games, Array.from({ length: 18 }, (_, i) => i + 1)), [games]);
  const season = tally(games);
  const ci = wilson(season.w, season.w + season.l);
  const edges = useMemo(() => byEdge(games, BUCKETS), [games]);
  const side = useMemo(() => [["Home teams", games.filter((g) => g.pickIsHome)], ["Road teams", games.filter((g) => !g.pickIsHome)]] as [string, NflAtsGame[]][], [games]);
  const pending = useMemo(() => pendingPicks(data), [data]);
  const bt = data.backtest.calibration.ats;
  const sigma = data.params.model.sigma;

  const best = [...weeks].filter((w) => w.rec.w + w.rec.l >= 6).sort((a, b) => (b.rec.pct ?? 0) - (a.rec.pct ?? 0))[0];
  const worst = [...weeks].filter((w) => w.rec.w + w.rec.l >= 6).sort((a, b) => (a.rec.pct ?? 1) - (b.rec.pct ?? 1))[0];
  const notes: string[] = [];
  if (season.pct != null && ci) notes.push(`${recordText(season)} on ${season.w + season.l} decided picks: ${fmtPct(season.pct, 1)}. With this few games the plausible range is ${fmtPct(ci[0], 0)} to ${fmtPct(ci[1], 0)}; break-even at −110 is ${fmtPct(BREAK_EVEN, 1)}.`);
  notes.push(`Over ${data.params.trainedOn.join(", ")} the same picks went ${bt.all.w}-${bt.all.l}-${bt.all.p} (${fmtPct(bt.all.pct, 1)}) against the closing line. The line already holds what the ratings know, so a result near 50% is what to expect; this tracker shows whether that holds up.`);
  if (best && worst && best !== worst) notes.push(`Best week: ${best.label} at ${fmtPct(best.rec.pct, 1)} (${recordText(best.rec)}); weakest: ${worst.label} at ${fmtPct(worst.rec.pct, 1)} (${recordText(worst.rec)}).`);

  const cols: Col<NflAtsGame>[] = [
    { key: "date", label: "Date", get: (g) => g.date, render: (g) => dateLabel(g.date) },
    { key: "wk", label: "Wk", align: "r", get: (g) => g.week },
    { key: "game", label: "Game", get: (g) => g.game },
    { key: "pick", label: "Ratings pick", get: (g) => g.pick, render: (g) => <NflTeamLink abbr={g.pick} size={18} label={g.pick} /> },
    { key: "line", label: "Line", get: (g) => g.line },
    { key: "edge", label: "Gap to line", align: "r", first: "desc", get: (g) => g.edge, render: (g) => fmt(g.edge) },
    { key: "final", label: "Final", get: (g) => g.final },
    { key: "cover", label: "Covered by", align: "r", first: "desc", get: (g) => g.coverBy, render: (g) => fmtSigned(g.coverBy) },
    { key: "res", label: "Result", get: (g) => g.result, render: (g) => <span className={`delta ${g.result === "win" ? "up" : g.result === "loss" ? "down" : "flat"}`}>{g.result === "win" ? "✓ Covered" : g.result === "loss" ? "✗ Missed" : "Push"}</span> },
  ];

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead"><div><h2>Ratings picks against the spread</h2><p className="sub" style={{ margin: 0 }}>Each game's pick is the side the team ratings like better than the closing spread. Graded from nflverse's lines and results <Derived why="The ratings' margin compared with the closing spread, graded against the final margin" /> · updates as each week's games finish</p></div></div>
        <div className="atshead">
          <div><span className="muted">{data.season} season</span><b className="num">{recordText(season)}</b></div>
          <div><span className="muted">Against the spread</span><b className="num">{season.pct == null ? "—" : fmtPct(season.pct, 1)}</b></div>
          <div><span className="muted">Break-even (−110)</span><b className="num">{fmtPct(BREAK_EVEN, 1)}</b></div>
          <div><span className="muted">Picks graded</span><b className="num">{season.n}</b></div>
        </div>
        <AtsChart weeks={weeks} ariaLabel="Weekly against-the-spread percentage with the season to date" />
        <Notes items={notes} />
      </div>

      <div className="grid2" style={{ ["--cols" as string]: "minmax(0,1.5fr) minmax(0,1fr)" } as React.CSSProperties}>
        <div className="panel">
          <h2>Week by week</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Week</th><th className="r">Picks</th><th>Record</th><th className="r">ATS %</th><th>Season to date</th><th className="r">Season %</th><th className="r">Avg. cover margin</th></tr></thead>
            <tbody>
              {weeks.map((w) => <tr key={w.week}><td>{w.label}</td><td className="r num">{w.rec.n}</td><td className="num">{recordText(w.rec)}</td><td className="r num">{fmtPct(w.rec.pct, 1)}</td><td className="num">{recordText(w.cumulative)}</td><td className="r num">{fmtPct(w.cumulative.pct, 1)}</td><td className="r num">{w.avgCoverBy == null ? "—" : fmtSigned(w.avgCoverBy)}</td></tr>)}
              <tr style={{ fontWeight: 650 }}><td>Season</td><td className="r num">{season.n}</td><td className="num">{recordText(season)}</td><td className="r num">{fmtPct(season.pct, 1)}</td><td /><td /><td /></tr>
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <h2>By size of the gap to the line</h2>
          <p className="sub">Points between the ratings' margin and the closing spread</p>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Gap</th><th>{data.season}</th><th className="r">%</th><th>{data.params.trainedOn[0]}–{data.params.trainedOn[data.params.trainedOn.length - 1]}</th><th className="r">%</th></tr></thead>
            <tbody>{edges.map((e, i) => { const b = bt.byGap[i]; return <tr key={e.label}><td>{e.label}</td><td className="num">{recordText(e.rec)}</td><td className="r num">{fmtPct(e.rec.pct, 0)}</td><td className="num">{b ? `${b.w}-${b.l}-${b.p}` : "—"}</td><td className="r num">{b ? fmtPct(b.pct, 0) : "—"}</td></tr>; })}</tbody>
          </table></div>
          <h3 style={{ marginTop: 12 }}>By side of the pick <Derived why="Grouped from the graded picks" /></h3>
          <div className="tbl-wrap"><table className="tbl"><tbody>{side.map(([l, g]) => { const r = tally(g); return <tr key={l}><td>{l}</td><td className="num">{recordText(r)}</td><td className="r num">{fmtPct(r.pct, 0)}</td></tr>; })}</tbody></table></div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="panel">
          <h2>Picks not yet graded</h2>
          <p className="sub">Games with a posted line. Each moves into the tracker when its final is in. “Cover chance” is the probability the pick covers if the ratings were exactly right, using the ratings' typical miss ({fmt(sigma)} points).</p>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Game</th><th>Ratings pick</th><th>Line</th><th className="r">Gap to line</th><th className="r">Cover chance</th></tr></thead>
            <tbody>{pending.map(({ g, p }) => { const e = (g.mm as number) - (g.spread as number); const cover = normCdf((p.pickIsHome ? e : -e) / sigma); return <tr key={g.id}><td>{dateLabel(g.date)} <span className="muted">{timeLabel(g.time)}</span></td><td><NflMark abbr={g.away} size={16} /> {g.away} @ {g.home}</td><td>{p.pick}</td><td>{p.line}</td><td className="r num">{fmt(p.edge)}</td><td className="r num">{fmtPct(cover, 0)}</td></tr>; })}</tbody>
          </table></div>
        </div>
      )}

      <div className="panel">
        <h2>Every graded pick</h2>
        <p className="sub">{games.length} picks · sort any column · expand a row for the detail</p>
        <SortTable label="Graded picks" cols={cols} rows={games} rowKey={(g) => g.id} max={limit}
          sort={{ key: route.p.sort || "date", dir: (route.p.dir as "asc" | "desc") || "desc", set: (key, dir) => nav({ p: { sort: key, dir } }) }}
          expand={(g) => <dl className="kv"><div><dt>Game id (nflverse)</dt><dd>{g.id}</dd></div><div><dt>Line</dt><dd>{g.line}</dd></div><div><dt>Pick's side</dt><dd>{g.pickIsHome ? "Home" : "Road"}</dd></div><div><dt>Final margin for the pick</dt><dd>{fmtSigned(g.margin, 0)}</dd></div><div><dt>Covered by <Derived why="Final margin minus the line, from the pick's side" /></dt><dd>{fmtSigned(g.coverBy)}</dd></div></dl>} />
        {games.length > limit && <button type="button" className="btn small" onClick={() => setLimit(limit + 150)}>Show more</button>}
      </div>
    </div>
  );
}
