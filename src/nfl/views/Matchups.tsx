import { useMemo } from "react";
import { useNfl } from "../useNfl";
import { useNflRoute } from "../store";
import { pickFor, projectGameRow } from "../model";
import { gameFacts, depthLine, snapLines } from "../context";
import { NflMark, Notes, Derived } from "../common";
import { SortTable, type Col } from "../../spplus/components/SortTable";
import { Dumbbell, type DumbRow } from "../../spplus/charts/Dumbbell";
import { dateLabel, fmt, fmtPct, fmtSigned, timeLabel } from "../../spplus/data/derive";
import type { NflGame } from "../types";

export default function Matchups() {
  const { data } = useNfl();
  const [route, nav] = useNflRoute();
  if (!data) return null;
  const upcomingWeek = data.games.find((g) => g.type === "REG" && g.aS == null)?.week ?? data.lastPlayedWeek;
  const week = route.week ?? upcomingWeek;
  const games = useMemo(() => data.games.filter((g) => g.type === "REG" && g.week === week).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")), [data, week]);
  const sel = games.find((g) => g.id === route.p.game);
  const name = (a: string) => data.teams[a]?.name ?? a;
  const nick = (a: string) => name(a).split(" ").pop()!;

  const rows: DumbRow[] = useMemo(() => games.filter((g) => g.mm != null && g.spread != null).sort((a, b) => Math.abs((b.mm as number) - (b.spread as number)) - Math.abs((a.mm as number) - (a.spread as number))).map((g) => ({
    id: g.id, label: `${g.away} @ ${g.home}`, v1: g.mm, v2: g.spread, tipTitle: `${name(g.away)} @ ${name(g.home)}`,
    tip: [["Ratings margin", `${nick(g.home)} ${fmtSigned(g.mm)}`], ["Closing spread", `${nick(g.home)} ${fmtSigned(g.spread == null ? null : g.spread)}`], ["Gap", fmt(Math.abs((g.mm as number) - (g.spread as number)))], ...(g.aS != null ? [["Final", `${g.away} ${g.aS}, ${g.home} ${g.hS}`] as [string, string]] : [])],
  })), [games]);

  const cols: Col<NflGame>[] = [
    { key: "date", label: "Kickoff", get: (g) => `${g.date} ${g.time ?? ""}`, render: (g) => <span>{dateLabel(g.date)} <span className="muted">{timeLabel(g.time)}</span></span> },
    { key: "game", label: "Game", get: (g) => g.away, render: (g) => <span className="tm"><NflMark abbr={g.away} size={18} />{g.away} @ <NflMark abbr={g.home} size={18} />{g.home}</span> },
    { key: "rm", label: "Ratings margin", title: "Home minus away", align: "r", get: (g) => g.mm, render: (g) => fmtSigned(g.mm) },
    { key: "sp", label: "Closing spread", title: "Home favored by (positive)", align: "r", get: (g) => g.spread, render: (g) => (g.spread == null ? "—" : fmtSigned(g.spread)) },
    { key: "rt", label: "Ratings total", align: "r", get: (g) => g.mt, render: (g) => fmt(g.mt) },
    { key: "tt", label: "Total", align: "r", get: (g) => g.total, render: (g) => (g.total == null ? "—" : g.total) },
    { key: "pick", label: "Ratings pick", get: (g) => pickFor(g)?.line ?? null, render: (g) => pickFor(g)?.line ?? "—" },
    { key: "fin", label: "Final", get: (g) => (g.aS == null ? null : (g.hS as number) - (g.aS as number)), render: (g) => (g.aS == null ? <span className="muted">—</span> : `${g.away} ${g.aS}, ${g.home} ${g.hS}`) },
  ];

  const notes: string[] = [];
  const big = [...games].filter((g) => g.mm != null && g.spread != null).sort((a, b) => Math.abs((b.mm as number) - (b.spread as number)) - Math.abs((a.mm as number) - (a.spread as number)))[0];
  if (big) notes.push(`Widest gap between the ratings and the line in week ${week}: ${big.away} @ ${big.home}. Ratings have ${nick(big.home)} ${fmtSigned(big.mm)}, the line ${fmtSigned(big.spread)}.`);
  const closest = [...games].filter((g) => g.spread != null).sort((a, b) => Math.abs(a.spread as number) - Math.abs(b.spread as number))[0];
  if (closest) notes.push(`Closest line: ${closest.away} @ ${closest.home} (${Math.abs(closest.spread as number) === 0 ? "pick'em" : `${closest.spread! > 0 ? nick(closest.home) : nick(closest.away)} by ${Math.abs(closest.spread as number)}`}).`);

  const detail = (g: NflGame) => {
    const p = projectGameRow(data, g, { n: 4000 });
    return (
      <div className="stack" style={{ gap: 10 }}>
        <section>
          <h3>Projection <button type="button" className="btn small" onClick={() => nav({ view: "simulator", week: null, p: { a: g.away, b: g.home, v: g.neutral ? "n" : "h" } })}>Simulate this game</button></h3>
          {p && <dl className="kv">
            <div><dt>Expected score ({p.basis === "market" ? "closing line" : "ratings"})</dt><dd>{g.away} {fmt(p.sim.meanA)}, {g.home} {fmt(p.sim.meanB)}</dd></div>
            <div><dt>Win probability</dt><dd>{g.away} {fmtPct(p.sim.winA)} · {g.home} {fmtPct(p.sim.winB)}</dd></div>
            <div><dt>Ratings margin / total</dt><dd>{nick(g.home)} {fmtSigned(p.ratingsMarginHome)} · {fmt(p.ratingsTotal)}</dd></div>
            <div><dt>Closing spread / total</dt><dd>{g.spread == null ? "—" : `${nick(g.home)} ${fmtSigned(-g.spread)}`} · {g.total ?? "—"}</dd></div>
            <div><dt>Moneyline</dt><dd>{g.aML ?? "—"} / {g.hML ?? "—"}</dd></div>
            <div><dt>Ratings pick</dt><dd>{pickFor(g)?.line ?? "—"}</dd></div>
          </dl>}
        </section>
        <section>
          <h3>Setting <span className="tag">nflverse {g.id}</span></h3>
          <dl className="kv">{gameFacts(data, g).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </section>
        {[g.away, g.home].some((t) => depthLine(data, t)) && (
          <section><h3>Depth chart starters</h3><dl className="kv">{[g.away, g.home].map((t) => <div key={t}><dt>{name(t)}</dt><dd>{depthLine(data, t) ?? "—"}</dd></div>)}</dl></section>
        )}
        {snapLines(data, g).length > 0 && (
          <section><h3>Snap leaders</h3><dl className="kv" style={{ gridTemplateColumns: "1fr" }}>{snapLines(data, g).flatMap((s) => [<div key={`${s.team}o`}><dt>{name(s.team)} offense</dt><dd style={{ fontSize: 12 }}>{s.off}</dd></div>, <div key={`${s.team}d`}><dt>{name(s.team)} defense</dt><dd style={{ fontSize: 12 }}>{s.def}</dd></div>])}</dl></section>
        )}
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="grid2">
        <div className="panel">
          <div className="phead"><div><h2>Ratings vs. the closing line, week {week}</h2><p className="sub" style={{ margin: 0 }}>{games.length} games · home team margin <Derived why="The ratings' margin and the closing spread are both home minus away" /> · biggest gaps first</p></div></div>
          {rows.length === 0 ? <p className="empty">No lines posted for this week yet. The table below still has the ratings' numbers.</p> : (
            <Dumbbell rows={rows} selected={sel?.id ?? null} onSelect={(id) => nav({ p: { game: route.p.game === id ? null : id } })} name1="Ratings margin" name2="Closing spread" axisTitle="Home team margin (pts)" zeroLine ariaLabel="Ratings margin and closing spread for each game" />
          )}
          <Notes items={notes} />
        </div>
        <div className="panel sticky-side">
          <h2>{sel ? `${name(sel.away)} @ ${name(sel.home)}` : "Game details"}</h2>
          {sel ? detail(sel) : <p className="empty">Select a game to see its details.</p>}
        </div>
      </div>
      <div className="panel">
        <h2>All week {week} games</h2>
        <SortTable label="Week games" cols={cols} rows={games} rowKey={(g) => g.id} selected={sel?.id ?? null} expand={detail}
          sort={{ key: route.p.sort || "date", dir: (route.p.dir as "asc" | "desc") || "asc", set: (key, dir) => nav({ p: { sort: key, dir } }) }} />
      </div>
    </div>
  );
}
