import { useMemo, useState } from "react";
import { useNfl } from "../useNfl";
import { useNflRoute } from "../store";
import { ratingsAt, teamRows, projectGameRow, recordBefore } from "../model";
import { depthLine } from "../context";
import { NflMark, TeamSelect, Notes } from "../common";
import { Heatmap, HeatScale, type HeatRow } from "../../spplus/charts/Heat";
import { LinesChart, type LineSeries } from "../../spplus/charts/Lines";
import { ResultsTimeline } from "../../spplus/charts/Timeline";
import { C } from "../../spplus/charts/kit";
import { dateLabel, fmt, fmtPct, fmtSigned, ord, timeLabel } from "../../spplus/data/derive";
import { logos } from "../../data";
import { logoSlug } from "../model";
import type { GameResult } from "../../spplus/data/types";

export default function TeamPage() {
  const { data } = useNfl();
  const [route, nav] = useNflRoute();
  const [active, setActive] = useState<string | null>(null);
  if (!data) return null;
  const last = data.ratingsThroughWeek;
  const rowsNow = useMemo(() => teamRows(data, last), [data, last]);
  const abbr = route.team && data.teams[route.team] ? route.team : [...rowsNow].sort((a, b) => a.rank.sp - b.rank.sp)[0].abbr;
  const team = data.teams[abbr];
  const me = rowsNow.find((r) => r.abbr === abbr)!;
  const weeks = Array.from({ length: last }, (_, i) => i + 1);
  const all = weeks.map((w) => teamRows(data, w));
  const pct = (rk: number) => Math.round(((32 - rk) / 31) * 1000) / 10;
  const cats: { key: "sp" | "off" | "def" | "st"; label: string; i: 0 | 1 | 2 | 3 }[] = [{ key: "sp", label: "Rating", i: 0 }, { key: "off", label: "Offense", i: 1 }, { key: "def", label: "Defense", i: 2 }, { key: "st", label: "Special teams", i: 3 }];
  const heat: HeatRow[] = cats.map((c) => ({ id: c.key, label: c.label, cells: weeks.map((_w, wi) => { const r = all[wi].find((x) => x.abbr === abbr); if (!r) return { value: null, text: "—" }; const rk = r.rank[c.key]; return { value: pct(rk), text: `#${rk}`, tip: [["Value", fmt(r.r[c.i])], ["League rank", `${rk} of 32`], ["Percentile (derived)", String(pct(rk))]] as [string, string][] }; }) }));
  const lines: LineSeries[] = [
    { id: "sp", label: "Rating", color: C.s[0], values: weeks.map((w) => ratingsAt(data, abbr, w)?.[0] ?? null) },
    { id: "off", label: "Offense (points vs. an average defense)", color: C.s[1], values: weeks.map((w) => ratingsAt(data, abbr, w)?.[1] ?? null) },
    { id: "def", label: "Defense (points allowed; lower is better)", color: C.s[2], values: weeks.map((w) => ratingsAt(data, abbr, w)?.[2] ?? null) },
  ];

  const played = data.games.filter((g) => g.type === "REG" && g.aS != null && (g.away === abbr || g.home === abbr)).sort((a, b) => a.date.localeCompare(b.date));
  const results: GameResult[] = played.map((g, i) => { const mine = g.home === abbr ? g.hS! : g.aS!, theirs = g.home === abbr ? g.aS! : g.hS!; const opp = g.home === abbr ? g.away : g.home; return { id: g.id, row: i, date: g.date, team: abbr, opp, win: mine > theirs ? 1 : 0, pts: mine, oppPts: theirs, margin: mine - theirs, pgwe: null, adjMgn: null }; });
  const selGame = played.find((g) => g.id === route.p.game);
  const upcoming = data.games.filter((g) => g.type === "REG" && g.aS == null && (g.away === abbr || g.home === abbr)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const rec = recordBefore(data, abbr, 99);
  const notes: string[] = [];
  const best = [["offense", me.rank.off], ["defense", me.rank.def], ["special teams", me.rank.st]].sort((a, b) => (a[1] as number) - (b[1] as number));
  notes.push(`${team.name} is ${ord(me.rank.sp)} of 32 in rating and ${ord(me.confRank)} of 16 in the ${team.conf}, ${ord(me.divRank)} of 4 in the ${team.div}.`);
  notes.push(`Strongest unit: ${best[0][0]} (${ord(best[0][1] as number)}); weakest: ${best[2][0]} (${ord(best[2][1] as number)}).`);

  return (
    <div className="stack">
      <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <NflMark abbr={abbr} size={44} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>{team.name}</h2>
          <p className="sub" style={{ margin: 0 }}>{team.div} · {rec.w}-{rec.l}{rec.t ? `-${rec.t}` : ""} · ratings before week {last}{depthLine(data, abbr) ? ` · ${depthLine(data, abbr)}` : ""}</p>
        </div>
        <div className="kv" style={{ gridTemplateColumns: "repeat(4, auto)", gap: "4px 20px" }}>
          <div><dt>Rating</dt><dd>{fmtSigned(me.r[0])}</dd></div><div><dt>League rank</dt><dd>{me.rank.sp}</dd></div><div><dt>Conf. rank</dt><dd>{me.confRank}/16</dd></div><div><dt>Div. rank</dt><dd>{me.divRank}/4</dd></div>
        </div>
        <TeamSelect label="Team" value={abbr} onPick={(a) => nav({ team: a, p: { game: null } })} />
        <button type="button" className="btn small" onClick={() => nav({ view: "simulator", p: { a: abbr } })}>Simulate a game</button>
      </div>

      <div className="panel">
        <h2>Percentile by week</h2>
        <p className="sub">Cell text is the league rank; color is the share of the league rated below</p>
        <Heatmap rows={heat} cols={weeks.map((w) => `Wk ${w}`)} ariaLabel={`${team.name} league percentile by category and week`} rowTitle="Category" />
        <HeatScale />
        <Notes items={notes} />
      </div>

      <div className="grid2" style={{ ["--cols" as string]: "minmax(0,1.3fr) minmax(0,1fr)" } as React.CSSProperties}>
        <div className="panel"><h2>Ratings by week</h2><p className="sub">Points per game. Offense and defense are against the league's average opponent.</p>
          <LinesChart xs={weeks} xLabel={(x) => `Wk ${x}`} series={lines} height={260} yTitle="Points" yFormat={(v) => v.toFixed(0)} activeId={active} onActive={setActive}
            tipRows={(xi, s) => [["Value", fmt(ratingsAt(data, abbr, weeks[xi])?.[s.id === "sp" ? 0 : s.id === "off" ? 1 : 2])]]} ariaLabel={`${team.name} ratings by week`} />
          <div className="legend">{lines.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.label}</span>)}</div></div>
        <div className="panel"><h2>Upcoming</h2>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Wk</th><th>Game</th><th className="r">Line</th><th className="r">Expected</th></tr></thead>
            <tbody>{upcoming.map((g) => { const p = projectGameRow(data, g, { n: 2000 }); const opp = g.home === abbr ? g.away : g.home; const mine = g.home === abbr ? p?.sim.meanB : p?.sim.meanA, theirs = g.home === abbr ? p?.sim.meanA : p?.sim.meanB;
              return <tr key={g.id}><td>{g.week}</td><td>{g.home === abbr ? "vs" : "at"} {data.teams[opp].name.split(" ").pop()} <span className="muted">{dateLabel(g.date)} {timeLabel(g.time)}</span></td><td className="r num">{g.spread == null ? "—" : fmtSigned(g.home === abbr ? -g.spread : g.spread)}</td><td className="r num">{mine == null ? "—" : `${fmt(mine, 0)}–${fmt(theirs, 0)}`}{p ? <span className="muted"> {fmtPct(g.home === abbr ? p.sim.winB : p.sim.winA, 0)}</span> : null}</td></tr>; })}</tbody></table></div>
          <p className="sub" style={{ marginTop: 6 }}>Line: this team's side of the closing spread. Expected: simulated points, then this team's win chance.</p></div>
      </div>

      <div className="panel">
        <h2>Season results</h2>
        <p className="sub">{played.length} games · select a game for its line and result</p>
        <ResultsTimeline games={results} selected={selGame?.id ?? null} onSelect={(id) => nav({ p: { game: route.p.game === id ? null : id } })} oppLabel={(g) => `vs ${data.teams[g.opp]?.name ?? g.opp}`} logoFor={(a) => logos[logoSlug(data.teams[a]?.name ?? "")]} />
        {selGame && (
          <dl className="kv" style={{ marginTop: 8 }}>
            <div><dt>Game</dt><dd>{selGame.away} {selGame.aS}, {selGame.home} {selGame.hS}</dd></div>
            <div><dt>Closing spread / total</dt><dd>{selGame.spread == null ? "—" : `${selGame.home} ${fmtSigned(-selGame.spread)}`} · {selGame.total ?? "—"}</dd></div>
            <div><dt>Ratings margin / total</dt><dd>{selGame.mm == null ? "—" : `${selGame.home} ${fmtSigned(selGame.mm)}`} · {fmt(selGame.mt)}</dd></div>
            <div><dt>Date</dt><dd>{dateLabel(selGame.date)}</dd></div>
          </dl>
        )}
      </div>
    </div>
  );
}
