import { useMemo, useState } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { dateLabel, fmt, fmtPct, fmtSigned, resolveWeek, timeLabel } from "../data/derive";
import { gameIndex, projectionMiss } from "../data/games";
import { Derived, Notes, TeamLink, useTeamLookup } from "../components/common";
import { SortTable, type Col } from "../components/SortTable";
import { GameDetail } from "../components/GameDetail";
import { Dumbbell, type DumbRow } from "../charts/Dumbbell";
import { C } from "../charts/kit";
import { DIV_LABEL, type DivKey, type Projection, type SmallGame } from "../data/types";

/** Derived: the projection and the line on one axis, as the margin for the home (second-listed) team. */
const homeMargin = (p: Projection) => (p.projMargin == null || !p.projWinner ? null : p.projWinner === p.home ? p.projMargin : -p.projMargin);
const lineMargin = (p: Projection) => (p.spreadPts == null ? null : p.spreadPts === 0 ? 0 : p.spreadTeam === p.home ? p.spreadPts : p.spreadTeam === p.away ? -p.spreadPts : null);

export default function Matchups() {
  const { model } = useData();
  const [route, nav] = useRoute();
  const team = useTeamLookup();
  const [showAll, setShowAll] = useState(false);
  if (!model) return null;
  const week = resolveWeek(model, route.week);
  const div: DivKey = route.div === "ALL" ? "FBS" : route.div;
  const idx = gameIndex(model);
  const q = route.q.trim().toLowerCase();

  const games = useMemo(() => model.projections.filter((p) => p.week === week && (!q || p.game.toLowerCase().includes(q)) && (!route.conf || [p.away, p.home].some((n) => team(n)?.weeks[week]?.conf === route.conf))), [model, week, q, route.conf, team]);
  const smallAll = useMemo(() => model.smallGames.filter((g) => g.week === week && g.division === div && (!q || g.text.toLowerCase().includes(q))), [model, week, div, q]);
  const groups = useMemo(() => [...new Set(smallAll.map((g) => g.group))], [smallAll]);
  const group = groups.includes(route.p.group ?? "") ? route.p.group : "";
  const small = useMemo(() => (group ? smallAll.filter((g) => g.group === group) : smallAll), [smallAll, group]);
  const selId = route.p.game ?? "";
  const sel = games.find((g) => g.id === selId) ?? model.projections.find((g) => g.id === selId);

  const dumbRows: DumbRow[] = useMemo(() => {
    const list = games.filter((p) => homeMargin(p) != null || lineMargin(p) != null).sort((a, b) => (b.spreadDiff ?? -1) - (a.spreadDiff ?? -1));
    return (showAll ? list : list.slice(0, 18)).map((p) => ({
      id: p.id, label: p.game, v1: homeMargin(p), v2: lineMargin(p), tipTitle: p.game,
      tip: [["SP+ projection", `${p.projWinner ?? "—"} by ${fmt(p.projMargin)}`], ["Line", p.spread ?? "—"], ["Spread diff", fmt(p.spreadDiff)], ["Win prob.", fmtPct(p.winProb)]],
    }));
  }, [games, showAll]);

  const cols: Col<Projection>[] = [
    { key: "date", label: "Date", get: (p) => `${p.date ?? ""} ${p.time ?? ""}`, render: (p) => <span>{dateLabel(p.date)} <span className="muted">{timeLabel(p.time)}</span></span> },
    { key: "game", label: "Game", get: (p) => p.game, render: (p) => <span>{p.game}{p.neutral ? <span className="tag">neutral</span> : null}</span> },
    { key: "win", label: "Proj. winner", get: (p) => p.projWinner, render: (p) => <TeamLink team={team(p.projWinner)} size={18} /> },
    { key: "mar", label: "Margin", align: "r", first: "desc", get: (p) => p.projMargin, render: (p) => fmt(p.projMargin) },
    { key: "wp", label: "Win prob.", align: "r", first: "desc", get: (p) => p.winProb, render: (p) => fmtPct(p.winProb) },
    { key: "sc", label: "Score", get: (p) => p.projScore, render: (p) => p.projScore ?? "—" },
    { key: "sp", label: "Spread", get: (p) => p.spread, render: (p) => p.spread ?? "—" },
    { key: "ats", label: "ATS pick", get: (p) => p.atsPick, render: (p) => p.atsPick ?? "—" },
    { key: "sd", label: "Spread diff", align: "r", first: "desc", get: (p) => p.spreadDiff, render: (p) => fmt(p.spreadDiff) },
    { key: "ou", label: "O/U", align: "r", get: (p) => p.ou, render: (p) => (p.ou == null ? "—" : p.ou) },
    { key: "oup", label: "O/U pick", get: (p) => p.ouPick, render: (p) => p.ouPick ?? "—" },
    { key: "oud", label: "O/U diff", align: "r", get: (p) => p.ouDiff, render: (p) => fmtSigned(p.ouDiff) },
    ...(week < model.latest ? [
      { key: "fin", label: "Final", get: (p: Projection) => { const r = idx.resultFor(p); return r?.winner.margin ?? null; }, render: (p: Projection) => { const r = idx.resultFor(p); return r ? `${r.winner.team} ${r.winner.win === 1 ? "won" : "lost"} ${r.winner.pts}–${r.winner.oppPts}` : <span className="muted">—</span>; } },
      { key: "miss", label: "vs proj.", title: "Final margin minus projected margin, from the projected winner's side", align: "r" as const, get: (p: Projection) => projectionMiss(p, idx.resultFor(p)?.winner), render: (p: Projection) => { const v = projectionMiss(p, idx.resultFor(p)?.winner); return v == null ? "—" : <span className={`delta ${v > 0 ? "up" : v < 0 ? "down" : "flat"}`}>{fmtSigned(v)}</span>; } },
    ] : []),
  ];

  const notes: string[] = [];
  const big = [...games].filter((g) => g.spreadDiff != null).sort((a, b) => b.spreadDiff! - a.spreadDiff!)[0];
  if (big) notes.push(`Widest gap to the line in week ${week}: ${big.game}. SP+ has ${big.projWinner} by ${fmt(big.projMargin)} against ${big.spread}, ${fmt(big.spreadDiff)} points apart.`);
  const close = games.filter((g) => g.winProb != null).sort((a, b) => Math.abs(a.winProb! - 0.5) - Math.abs(b.winProb! - 0.5))[0];
  if (close) notes.push(`Closest call: ${close.game}, ${close.projWinner} at ${fmtPct(close.winProb)} (${close.projScore}).`);
  const tot = games.filter((g) => g.ouDiff != null).sort((a, b) => Math.abs(b.ouDiff!) - Math.abs(a.ouDiff!))[0];
  if (tot) notes.push(`Largest total gap: ${tot.game}, SP+ ${tot.ouDiff! > 0 ? "over" : "under"} the ${tot.ou} total by ${fmt(Math.abs(tot.ouDiff!))}.`);

  if (div !== "FBS") {
    const rows: DumbRow[] = small.filter((g) => g.sides).map((g) => ({ id: g.id, label: g.text.replace(/\s-?\d+(\.\d+)?(?=,|$)/g, ""), v1: g.sides![0].rating, v2: g.sides![1].rating, tipTitle: g.text.replace(/\s-?\d+(\.\d+)?(?=,|$)/g, ""), tip: [[g.sides![0].team, fmt(g.sides![0].rating)], [g.sides![1].team, fmt(g.sides![1].rating)], ["Gap (derived)", fmt(Math.abs(g.sides![0].rating - g.sides![1].rating))]] as [string, string][] })).sort((a, b) => Math.abs(a.v1! - a.v2!) - Math.abs(b.v1! - b.v2!));
    const selSmall = small.find((g) => g.id === selId);
    return (
      <div className="stack">
        <div className="panel">
          <h2>{DIV_LABEL[div]} games, week {week}</h2>
          <p className="sub">The sheet lists each game with both teams' SP+ ratings (no projected score or line for {div}). Closest ratings first.</p>
          {groups.length > 1 && (
            <div className="seg" role="group" aria-label="Game list" style={{ marginBottom: 8, flexWrap: "wrap", height: "auto" }}>
              <button type="button" aria-pressed={!group} onClick={() => nav({ p: { group: null } }, { replace: true })}>All</button>
              {groups.map((g) => <button key={g} type="button" aria-pressed={g === group} onClick={() => nav({ p: { group: g } }, { replace: true })}>{g}</button>)}
            </div>
          )}
          {rows.length === 0 ? <p className="empty">No games listed for this week.</p> : <Dumbbell rows={showAll ? rows : rows.slice(0, 18)} selected={selSmall?.id ?? null} onSelect={(id) => nav({ p: { game: id } }, { replace: true })} name1="First-listed team SP+" name2="Second-listed team SP+" axisTitle="Team SP+ rating" ariaLabel="Team ratings for each game" color2={C.s[2]} />}
          {rows.length > 18 && <button type="button" className="btn small" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${rows.length}`}</button>}
          {selSmall && <p className="note-box" style={{ marginTop: 8 }}>{dateLabel(selSmall.date)}: {selSmall.text} <span className="muted">(sheet: {selSmall.division} Week {selSmall.week}, row {selSmall.row})</span></p>}
        </div>
        <div className="panel">
          <h2>All {DIV_LABEL[div]} games listed</h2>
          <SortTable label="Games" rows={small} rowKey={(g: SmallGame) => g.id} selected={selSmall?.id ?? null} cols={[
            { key: "date", label: "Date", get: (g) => g.date ?? "", render: (g) => dateLabel(g.date) },
            { key: "grp", label: "List", get: (g) => g.group },
            { key: "g", label: "Game and SP+ (source text)", get: (g) => g.text },
            { key: "gap", label: "Rating gap", align: "r", get: (g) => (g.sides ? Math.abs(g.sides[0].rating - g.sides[1].rating) : null), render: (g) => (g.sides ? <>{fmt(Math.abs(g.sides[0].rating - g.sides[1].rating))} <Derived why="Difference of the two SP+ ratings in the text" /></> : "—") },
          ]} />
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="grid2">
        <div className="panel">
          <div className="phead">
            <div><h2>SP+ projection vs. the line</h2><p className="sub" style={{ margin: 0 }}>Week {week} · {games.length} games · margin for the home (second-listed) team <Derived why="The sheet gives the winner's margin and the favorite's spread; both are restated for the home team" /> · biggest gaps first</p></div>
          </div>
          {dumbRows.length === 0 ? <p className="empty">No games match these filters.</p> : (
            <Dumbbell rows={dumbRows} selected={sel?.id ?? null} onSelect={(id) => nav({ p: { game: route.p.game === id ? null : id } }, { replace: true })} name1="SP+ projected margin" name2="Betting line" axisTitle="Home team margin (pts)" zeroLine ariaLabel="SP+ projected margin and betting line for each game" />
          )}
          {games.length > 18 && <button type="button" className="btn small" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${games.length}`}</button>}
          <Notes items={notes} />
        </div>
        <div className="panel sticky-side">
          <h2>{sel ? sel.game : "Game details"}</h2>
          {sel ? <GameDetail proj={sel} /> : <p className="empty">Select a game to see its rows.</p>}
        </div>
      </div>
      <div className="panel">
        <h2>All week {week} games</h2>
        <SortTable label="Week games" rows={games} rowKey={(p) => p.id} cols={cols} selected={sel?.id ?? null} expand={(p) => <GameDetail proj={p} />} sort={{ key: route.p.sort || "date", dir: (route.p.dir as "asc" | "desc") || "asc", set: (key, dir) => nav({ p: { sort: key, dir } }, { replace: true }) }} />
      </div>
    </div>
  );
}
