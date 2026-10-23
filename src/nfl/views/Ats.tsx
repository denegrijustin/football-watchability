import { useMemo, useState } from "react";
import { useNfl } from "../useNfl";
import { useNflRoute } from "../store";
import { atsGames, pendingPicks, type NflAtsGame } from "../model";
import { NflMark, NflTeamLink, Notes, Derived } from "../common";
import { LivePicks, type LivePickItem } from "../../spplus/components/LivePicks";
import { SortTable, type Col } from "../../spplus/components/SortTable";
import { AtsChart } from "../../spplus/charts/AtsChart";
import { BREAK_EVEN, byEdge, recordText, tally, weeklyTracker } from "../../spplus/data/ats";
import { dateLabel, fmt, fmtPct, fmtSigned, timeLabel } from "../../spplus/data/derive";
import { normCdf } from "../../spplus/sim/rng";
import { freshNfl, useLines } from "../../lines";
import { PROOF_LABEL, calibratedCover, historyFor, nflHistory } from "../../calibration";
import { LinesBar } from "../../components/LinesBar";

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
  const hist = useMemo(() => nflHistory(data), [data]);
  const { lines } = useLines();
  const pending = useMemo(() => pendingPicks(freshNfl(data, lines)), [data, lines]);
  // The pending picks as cards that follow the score. The pick must beat the line by its margin: the spread for a home pick, minus it for a road pick.
  const liveItems: LivePickItem[] = pending.map(({ g, p }) => {
    const raw = normCdf((p.pickIsHome ? (g.mm as number) - (g.spread as number) : -((g.mm as number) - (g.spread as number))) / data.params.model.sigma);
    const hr = historyFor(hist, p.edge);
    return {
      id: g.id, by: "Ratings", pickName: data.teams[p.pick]?.name ?? p.pick, pickMark: <NflMark abbr={p.pick} size={28} />,
      line: p.pickIsHome ? (g.spread as number) : -(g.spread as number), pickIsHome: p.pickIsHome, awayName: g.away, homeName: g.home,
      when: `${dateLabel(g.date)} ${timeLabel(g.time)}`, gap: fmt(p.edge), gapNum: p.edge, at: `${g.date} ${g.time ?? ""}`,
      cover: calibratedCover(hist, p.edge), raw, hist: { pct: hr.pct, n: hr.n, bucket: hr.bucket, proof: hr.proof }, espnId: g.espn ?? null,
    };
  });

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
    { key: "game", label: "Game", get: (g) => g.game, render: (g) => <>{g.game}<small className="muted block">Final: {g.final}</small></> },
    { key: "pick", label: "Pick", get: (g) => g.pick, render: (g) => <><NflTeamLink abbr={g.pick} size={18} label={g.pick} /> <b className="pickline" title="The line the pick had to beat">{g.line.slice(g.pick.length + 1)}</b></> },
    { key: "edge", label: "Edge (pts)", align: "r", first: "desc", get: (g) => g.edge, render: (g) => fmt(g.edge) },
    { key: "res", label: "Result", first: "desc", get: (g) => g.coverBy, render: (g) => <span className={`delta ${g.result === "win" ? "up" : g.result === "loss" ? "down" : "flat"}`} title="Final margin for the pick's side minus the line">{g.result === "win" ? `✓ Covered by ${fmt(Math.abs(g.coverBy))}` : g.result === "loss" ? `✗ Missed by ${fmt(Math.abs(g.coverBy))}` : "= Push"}</span> },
  ];

  return (
    <div className="stack">
      <LivePicks extra={<LinesBar />} track={season.n ? `Track record this season: ${recordText(season)} (${fmtPct(season.pct, 1)}) against the ${fmtPct(BREAK_EVEN, 1)} needed to break even at −110. An edge ranks the picks; it does not guarantee a cover.` : undefined} items={liveItems} title="This week's picks" note="The side the ratings like against the closing spread, with its line. A game on the field shows whether the pick is covering, not covering or on the number right now, and turns into the final grade at the horn." />
      <div className="panel">
        <div className="phead"><div><h2>Ratings picks against the spread</h2><p className="sub" style={{ margin: 0 }}>Each game's pick is the side the team ratings like better than the closing spread. Graded from nflverse's lines and results <Derived why="The ratings' margin compared with the closing spread, graded against the final margin" /> · scores from ESPN fill in the moment a game ends</p></div></div>
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
          <p className="sub">Games with a posted line, strongest first. Each moves into the tracker when its final is in. “Cover chance” is the probability the pick covers if the ratings were exactly right, using the ratings' typical miss ({fmt(sigma)} points).</p>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Game</th><th>Pick</th><th className="r">Edge (pts)</th><th className="r">Model says</th><th className="r">History says</th><th>Track record</th></tr></thead>
            <tbody>{[...pending].map(({ g, p }) => { const e = (g.mm as number) - (g.spread as number); return { g, p, cover: normCdf((p.pickIsHome ? e : -e) / sigma) }; }).sort((a, b) => b.cover - a.cover).map(({ g, p, cover }) => { const hr = historyFor(hist, p.edge); return <tr key={g.id}><td>{dateLabel(g.date)} <span className="muted">{timeLabel(g.time)}</span></td><td><NflMark abbr={g.away} size={16} /> {g.away} @ {g.home}</td><td><NflTeamLink abbr={p.pick} size={18} label={p.pick} /> <b className="pickline">{p.line.slice(p.pick.length + 1)}</b></td><td className="r num">{fmt(p.edge)}</td><td className="r num">{fmtPct(cover, 0)}</td><td className="r num">{hr.pct == null ? "—" : `${fmtPct(hr.pct, 0)} (${hr.n})`}</td><td><span className={`lp-tier ${({ proven: "strong", promising: "lean", unproven: "slight" } as const)[hr.proof]}`}>{PROOF_LABEL[hr.proof]}</span></td></tr>; })}</tbody>
          </table></div>
        </div>
      )}

      <div className="panel">
        <h2>Every graded pick</h2>
        <p className="sub">{games.length} picks · “Edge” is how far the pick was from the line · “Result” is how much it covered or missed by · sort any column · expand a row for the detail</p>
        <SortTable label="Graded picks" cols={cols} rows={games} rowKey={(g) => g.id} max={limit}
          sort={{ key: route.p.sort || "date", dir: (route.p.dir as "asc" | "desc") || "desc", set: (key, dir) => nav({ p: { sort: key, dir } }) }}
          expand={(g) => <dl className="kv"><div><dt>Game id (nflverse)</dt><dd>{g.id}</dd></div><div><dt>Line</dt><dd>{g.line}</dd></div><div><dt>Pick's side</dt><dd>{g.pickIsHome ? "Home" : "Road"}</dd></div><div><dt>Final margin for the pick</dt><dd>{fmtSigned(g.margin, 0)}</dd></div><div><dt>Covered by <Derived why="Final margin minus the line, from the pick's side" /></dt><dd>{fmtSigned(g.coverBy)}</dd></div></dl>} />
        {games.length > limit && <button type="button" className="btn small" onClick={() => setLimit(limit + 150)}>Show more</button>}
      </div>
    </div>
  );
}
