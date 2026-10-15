import { useMemo, useState } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { atsGames, byEdge, BREAK_EVEN, recordText, tally, weeklyTracker, type AtsGame } from "../data/ats";
import { dateLabel, fmt, fmtPct, fmtSigned } from "../data/derive";
import { Derived, Notes, TeamLink, useTeamLookup } from "../components/common";
import { SortTable, type Col } from "../components/SortTable";
import { AtsChart } from "../charts/AtsChart";
import { normCdf, paramsFor, ratingsFor, expectation } from "../sim";

/** 95% Wilson interval for a win rate. */
const wilson = (w: number, n: number): [number, number] | null => {
  if (!n) return null;
  const z = 1.96, p = w / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, e = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - e, c + e];
};

export default function Ats() {
  const { model } = useData();
  const [route, nav] = useRoute();
  const lookup = useTeamLookup();
  const [limit, setLimit] = useState(100);
  if (!model) return null;
  const incl = route.p.group === "all";
  const all = useMemo(() => atsGames(model), [model]);
  const games = useMemo(() => (incl ? all : all.filter((g) => g.group === "fbs")), [all, incl]);
  const weeks = useMemo(() => weeklyTracker(games, model.weeks), [games, model.weeks]);
  const season = tally(games);
  const ci = wilson(season.w, season.w + season.l);
  const edges = useMemo(() => byEdge(games), [games]);
  const side = useMemo(() => [
    ["Favorites", games.filter((g) => g.pickIsFavorite)], ["Underdogs", games.filter((g) => !g.pickIsFavorite)],
    ["Home teams", games.filter((g) => !g.neutral && g.pick === g.home)], ["Road teams", games.filter((g) => !g.neutral && g.pick === g.away)],
  ] as [string, AtsGame[]][], [games]);

  // Picks still to be played: the current slate's lines and pick, with the model's chance to cover.
  const pending = useMemo(() => {
    const done = new Set(all.map((g) => g.id));
    return model.projections.filter((p) => p.week === model.latest && p.atsPick && p.spreadPts != null && !done.has(p.id) && (incl || (model.byId.has(`FBS:${p.away}`) && model.byId.has(`FBS:${p.home}`)))).map((p) => {
      const A = ratingsFor(model, p.away, p.week), B = ratingsFor(model, p.home, p.week);
      let cover: number | null = null;
      if (A && B) {
        const par = paramsFor(model, p.week);
        const e = expectation(par, A, B, p.neutral ? "neutral" : "b-home");
        const mu = p.atsPick === p.home ? -e.margin : e.margin; // pick's expected margin
        const pts = p.spreadPts as number;
        const line = pts === 0 ? 0 : p.spreadTeam === p.atsPick ? pts : -pts;
        cover = 1 - normCdf((line - mu) / par.sigmaMargin);
      }
      return { p, cover };
    }).sort((a, b) => (b.p.spreadDiff ?? 0) - (a.p.spreadDiff ?? 0));
  }, [model, all, incl]);

  const best = [...weeks].filter((w) => w.rec.w + w.rec.l >= 10).sort((a, b) => (b.rec.pct ?? 0) - (a.rec.pct ?? 0))[0];
  const worst = [...weeks].filter((w) => w.rec.w + w.rec.l >= 10).sort((a, b) => (a.rec.pct ?? 1) - (b.rec.pct ?? 1))[0];
  const notes: string[] = [];
  if (season.pct != null && ci) notes.push(`${recordText(season)} on ${season.w + season.l} decided picks: ${fmtPct(season.pct, 1)}. With a sample this size the plausible range is ${fmtPct(ci[0], 0)} to ${fmtPct(ci[1], 0)}; break-even at standard −110 is ${fmtPct(BREAK_EVEN, 1)}.`);
  if (best && worst && best !== worst) notes.push(`Best week: ${best.label} at ${fmtPct(best.rec.pct, 1)} (${recordText(best.rec)}); weakest: ${worst.label} at ${fmtPct(worst.rec.pct, 1)} (${recordText(worst.rec)}).`);
  const bestEdge = [...edges].filter((e) => e.rec.w + e.rec.l >= 15).sort((a, b) => (b.rec.pct ?? 0) - (a.rec.pct ?? 0))[0];
  if (bestEdge) notes.push(`By size of the gap to the line, “${bestEdge.label}” picks are ${recordText(bestEdge.rec)} (${fmtPct(bestEdge.rec.pct, 0)}); a bigger gap has not reliably meant a better pick.`);
  const dogs = side[1][1], favs = side[0][1];
  if (dogs.length && favs.length) notes.push(`Underdog picks are ${recordText(tally(dogs))} (${fmtPct(tally(dogs).pct, 0)}); favorite picks ${recordText(tally(favs))} (${fmtPct(tally(favs).pct, 0)}).`);

  const sheetWeek = (w: number) => model.perf.find((p) => p.section === "fbs-fbs" && !p.total && p.ats && (p.week === String(w) || (p.week === "0-1" && (w === 0 || w === 1))));
  const cols: Col<AtsGame>[] = [
    { key: "date", label: "Date", get: (g) => g.date, render: (g) => dateLabel(g.date) },
    { key: "wk", label: "Wk", align: "r", get: (g) => g.week },
    { key: "game", label: "Game", get: (g) => g.game },
    { key: "pick", label: "SP+ pick", get: (g) => g.pick, render: (g) => <TeamLink team={lookup(g.pick)} size={18} /> },
    { key: "line", label: "Line", get: (g) => g.spread },
    { key: "edge", label: "Gap to line", align: "r", first: "desc", get: (g) => g.edge, render: (g) => fmt(g.edge) },
    { key: "final", label: "Final", get: (g) => g.final },
    { key: "cover", label: "Covered by", align: "r", first: "desc", get: (g) => g.coverBy, render: (g) => fmtSigned(g.coverBy) },
    { key: "res", label: "Result", get: (g) => g.result, render: (g) => <span className={`delta ${g.result === "win" ? "up" : g.result === "loss" ? "down" : "flat"}`}>{g.result === "win" ? "✓ Covered" : g.result === "loss" ? "✗ Missed" : "Push"}</span> },
  ];

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div>
            <h2>SP+ picks against the spread</h2>
            <p className="sub" style={{ margin: 0 }}>
              {incl ? "Every" : "FBS-vs-FBS"} game with an early-week line, graded from the sheet's lines and the postgame results, with ESPN's finals added the moment a game ends <Derived why="The sheet's “ATS Pick” and “Spread” columns graded against the final margin" />
            </p>
          </div>
          <div className="seg" role="group" aria-label="Games included">
            <button type="button" aria-pressed={!incl} onClick={() => nav({ p: { group: null } }, { replace: true })}>FBS vs. FBS</button>
            <button type="button" aria-pressed={incl} onClick={() => nav({ p: { group: "all" } }, { replace: true })}>Include FBS vs. FCS</button>
          </div>
        </div>
        <div className="atshead">
          <div><span className="muted">Season</span><b className="num">{recordText(season)}</b></div>
          <div><span className="muted">Against the spread</span><b className="num">{season.pct == null ? "—" : fmtPct(season.pct, 1)}</b></div>
          <div><span className="muted">Break-even (−110)</span><b className="num">{fmtPct(BREAK_EVEN, 1)}</b></div>
          <div><span className="muted">Picks graded</span><b className="num">{season.n}</b></div>
        </div>
        <AtsChart weeks={weeks} ariaLabel="Weekly against-the-spread percentage with the season to date" />
        <Notes items={notes} />
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)" } as React.CSSProperties}>
        <div className="panel">
          <h2>Week by week</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Week</th><th className="r">Picks</th><th>Record</th><th className="r">ATS %</th><th>Season to date</th><th className="r">Season %</th><th className="r">Avg. cover margin</th>{!incl && <th>Sheet's own tally</th>}</tr></thead>
            <tbody>
              {weeks.map((w) => {
                const sw = sheetWeek(w.week);
                return (
                  <tr key={w.week}>
                    <td>{w.label}</td><td className="r num">{w.rec.n}</td><td className="num">{recordText(w.rec)}</td><td className="r num">{fmtPct(w.rec.pct, 1)}</td>
                    <td className="num">{recordText(w.cumulative)}</td><td className="r num">{fmtPct(w.cumulative.pct, 1)}</td><td className="r num">{w.avgCoverBy == null ? "—" : fmtSigned(w.avgCoverBy)}</td>
                    {!incl && <td className="muted">{sw ? (sw.week === "0-1" ? (w.week === 1 ? <span title="The sheet reports weeks 0 and 1 together">{sw.ats} (wks 0–1)</span> : "") : <>{sw.ats} {sw.ats === recordText(w.rec) ? <span className="delta up" aria-label="matches">✓</span> : <span className="delta down" aria-label="differs">≠</span>}</>) : "—"}</td>}
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 650 }}><td>Season</td><td className="r num">{season.n}</td><td className="num">{recordText(season)}</td><td className="r num">{fmtPct(season.pct, 1)}</td><td /><td /><td />{!incl && <td className="muted">{model.perf.find((p) => p.section === "fbs-fbs" && p.total)?.ats ?? "—"} (sheet's total cell)</td>}</tr>
            </tbody>
          </table></div>
          {!incl && <p className="sub" style={{ marginTop: 6 }}>The sheet reports weeks 0 and 1 together (28-22-1). Its season total cell reads 79-146-4; the weekly rows, and this tracker, add up to {recordText(season)}.</p>}
        </div>
        <div className="panel">
          <h2>By size of the gap to the line</h2>
          <p className="sub">Points between the SP+ margin and the spread (the sheet's “Spread diff”)</p>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Gap</th><th>Record</th><th className="r">ATS %</th><th className="r">Picks</th></tr></thead>
            <tbody>{edges.map((e) => <tr key={e.label}><td>{e.label}</td><td className="num">{recordText(e.rec)}</td><td className="r num">{fmtPct(e.rec.pct, 0)}</td><td className="r num">{e.rec.n}</td></tr>)}</tbody>
          </table></div>
          <h3 style={{ marginTop: 12 }}>By side of the pick <Derived why="Grouped from the graded picks" /></h3>
          <div className="tbl-wrap"><table className="tbl"><tbody>{side.map(([l, g]) => { const r = tally(g); return <tr key={l}><td>{l}</td><td className="num">{recordText(r)}</td><td className="r num">{fmtPct(r.pct, 0)}</td></tr>; })}</tbody></table></div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="panel">
          <h2>Week {model.latest} picks, not yet graded</h2>
          <p className="sub">Each moves into the tracker when its final reaches the sheet. “Cover chance” is the simulator's probability that the pick covers.</p>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Game</th><th>SP+ pick</th><th>Line</th><th className="r">Gap to line</th><th className="r">Cover chance</th></tr></thead>
            <tbody>{pending.map(({ p, cover }) => <tr key={p.id}><td>{dateLabel(p.date)}</td><td>{p.game}</td><td><TeamLink team={lookup(p.atsPick)} size={18} /></td><td>{p.spread}</td><td className="r num">{fmt(p.spreadDiff)}</td><td className="r num">{cover == null ? "—" : fmtPct(cover, 0)}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}

      <div className="panel">
        <h2>Every graded pick</h2>
        <p className="sub">{games.length} picks · sort any column · expand a row for the sheet row it came from</p>
        <SortTable label="Graded picks" cols={cols} rows={games} rowKey={(g) => g.id} max={limit}
          sort={{ key: route.p.sort || "date", dir: (route.p.dir as "asc" | "desc") || "desc", set: (key, dir) => nav({ p: { sort: key, dir } }, { replace: true }) }}
          expand={(g) => <dl className="kv"><div><dt>Source</dt><dd>{g.src.sheet}, row {g.src.row}</dd></div><div><dt>Line</dt><dd>{g.spread}</dd></div><div><dt>Pick's side</dt><dd>{g.pickIsFavorite ? "Favorite" : "Underdog"}{g.neutral ? ", neutral site" : g.pick === g.home ? ", at home" : ", on the road"}</dd></div><div><dt>Final margin for the pick</dt><dd>{fmtSigned(g.margin, 0)}</dd></div><div><dt>Covered by <Derived why="Final margin minus the line, from the pick's side" /></dt><dd>{fmtSigned(g.coverBy)}</dd></div></dl>} />
        {games.length > limit && <button type="button" className="btn small" onClick={() => setLimit(limit + 150)}>Show more</button>}
      </div>
    </div>
  );
}
