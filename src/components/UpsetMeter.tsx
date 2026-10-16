import { useEffect, useMemo, useState } from "react";
import { fetchData } from "../data/load";
import { logos, results, slate, type League } from "../data";
import { plusRankFor, usePlusRanks, type TeamRef } from "../plusRanks";
import { useLiveMap } from "../live";
import { buildRows, ledgerResults, TIERS, type LedgerLike, type MeterRow, type MeterTeam, type WeeklyLike } from "../upsetMeter";
import "../upsetMeter.css";

type Show = "all" | "upcoming" | "final" | "upsets";

function Logo({ team }: { team: MeterTeam }) {
  const src = logos[team.logoId];
  return src ? <img src={src} alt="" width="24" height="24" loading="lazy" /> : <span className="um-badge" style={{ background: team.color ?? "#6b7785" }}>{team.abbr.slice(0, 3)}</span>;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

function Row({ r, league, biggest }: { r: MeterRow; league: League; biggest: boolean }) {
  const [a, h] = r.teams;
  const fav = r.teams[r.favorite];
  const under = r.teams[1 - r.favorite];
  const winner = r.score ? (r.score[0] > r.score[1] ? 0 : r.score[1] > r.score[0] ? 1 : null) : null;
  const cls = `um-row${r.status === "final" ? " final" : ""}${r.upset ? " upset" : ""}${r.brewing ? " brewing" : ""}`;
  // The better (lower) rank in each category is highlighted; equal ranks highlight neither.
  const best = (mine: number | null | undefined, theirs: number | null | undefined) => mine != null && (theirs == null || mine < theirs);
  const note = r.status === "pre"
    ? [r.line != null ? `Line ${fav.abbr} -${r.line}` : "", when(r.date)].filter(Boolean).join(" · ")
    : r.detail || (r.status === "final" ? "Final" : "Live");
  return (
    <li className={cls} style={{ ["--tier" as string]: r.tier.color }}>
      <div className="um-teams" role="table" aria-label={`${a.name} at ${h.name}, ${league === "NFL" ? "NFL+" : "SP+"} ranks`}>
        {([a, h] as const).map((t, i) => {
          const o = i === 0 ? h : a;
          return (
            <div key={i} className="um-tr" role="row">
              <Logo team={t} />
              <b role="rowheader" title={t.name}>{t.abbr}</b>
              <span role="cell" className={best(t.rank, o.rank) ? "best" : ""}>{t.rank != null ? `#${t.rank}` : "NR"}</span>
              <span role="cell" className={best(t.o, o.o) ? "best" : ""}>{t.o ?? "–"}</span>
              <span role="cell" className={best(t.d, o.d) ? "best" : ""}>{t.d ?? "–"}</span>
              <em role="cell" className={`um-pts${winner === i ? " w" : ""}`}>{r.score ? r.score[i] : ""}</em>
            </div>
          );
        })}
      </div>
      <div className="um-side">
        <strong>{fav.abbr} +{r.gap} {r.gap === 1 ? "spot" : "spots"}</strong>
        <div className="um-bar" role="img" aria-label={`${under.name} is ranked ${r.gap} places below ${fav.name}: ${r.tier.short}`}>
          <i style={{ width: `${r.tier.id * 20}%` }} />
          <b /><b /><b /><b />
        </div>
        {r.upset ? <em className="um-flag">{biggest ? "★ BIGGEST" : "UPSET"} · {under.abbr} +{r.gap}</em>
          : r.brewing ? <em className="um-flag live">UPSET BREWING</em>
          : <span className="um-note">{note}{r.status === "final" && winner !== null ? (winner === r.favorite ? " · favorite held" : " · too close to call an upset") : ""}</span>}
      </div>
    </li>
  );
}

export function UpsetMeter({ defaultLeague }: { defaultLeague: League }) {
  const [league, setLeague] = useState<League>(defaultLeague);
  const [show, setShow] = useState<Show>("all");
  const [week, setWeek] = useState(slate.period);
  const [ledger, setLedger] = useState<LedgerLike[] | null>(null);
  const [weekly, setWeekly] = useState<WeeklyLike | null>(null);
  const live = useLiveMap();
  const plus = usePlusRanks();
  const current = week === slate.period;

  // The season ledger lists the earlier weeks; each week's own ranks load only when one of them is opened.
  useEffect(() => {
    let on = true;
    fetchData<{ games: LedgerLike[] }>("season").then((m) => on && setLedger(m.games), () => {});
    return () => { on = false; };
  }, []);
  useEffect(() => {
    if (current || weekly) return;
    let on = true;
    fetchData<WeeklyLike>("plus-ranks-weekly").then((m) => on && setWeekly(m), () => {});
    return () => { on = false; };
  }, [current, weekly]);

  // This week first, then earlier weeks, newest to oldest.
  const weeks = useMemo(() => {
    const first = new Map<string, string>();
    for (const g of ledger ?? []) if (g.league === league && g.week !== slate.period && (!first.has(g.week) || g.date < first.get(g.week)!)) first.set(g.week, g.date);
    return [slate.period, ...[...first.entries()].sort((x, y) => y[1].localeCompare(x[1])).map(([w]) => w)];
  }, [ledger, league]);
  useEffect(() => { if (!weeks.includes(week)) setWeek(slate.period); }, [weeks, week]);
  useEffect(() => { if (!current && (show === "upcoming" || show === "final")) setShow("all"); }, [current, show]);

  const rows = useMemo(() => {
    if (current) {
      if (!plus) return [];
      const of = league === "NFL" ? plus.nfl.of : plus.cfb.of;
      return buildRows({
        league, games: slate.games as never, results: results as never, live, period: slate.period,
        ranks: { of, rankOf: (t) => plusRankFor(plus, league, t as TeamRef)?.n ?? null, detailOf: (t) => { const r = plusRankFor(plus, league, t as TeamRef); return r ? { o: r.o, d: r.d } : null; } },
      });
    }
    if (!ledger || !weekly) return [];
    return buildRows({
      league, games: [], results: ledgerResults(ledger, league, week, weekly), live: {}, period: week,
      ranks: { of: league === "NFL" ? weekly.nfl.of : weekly.cfb.of, rankOf: () => null },
    });
  }, [league, live, plus, current, ledger, weekly, week]);

  // The largest rank gap among the upsets so far.
  const biggestKey = rows.filter((r) => r.upset).sort((x, y) => y.gap - x.gap)[0]?.key;
  const done = rows.filter((r) => r.status === "final");
  const todo = rows.filter((r) => r.status !== "final");
  const upsets = done.filter((r) => r.upset);
  const columns: { id: string; title: string; rows: MeterRow[]; empty: string }[] =
    !current
      ? [{ id: "done", title: show === "upsets" ? "Upsets" : "Completed", rows: show === "upsets" ? upsets : done, empty: show === "upsets" ? "No upsets that week." : "No games to show." }]
      : show === "all"
        ? [{ id: "done", title: "Completed", rows: done, empty: "No games have finished yet." }, { id: "todo", title: "Upcoming", rows: todo, empty: "No games left to play." }]
        : show === "upcoming"
          ? [{ id: "todo", title: "Upcoming", rows: todo, empty: "No games left to play." }]
          : show === "final"
            ? [{ id: "done", title: "Completed", rows: done, empty: "No games have finished yet." }]
            : [{ id: "ups", title: "Upsets", rows: rows.filter((r) => r.upset || r.brewing), empty: "No upsets yet this week." }];
  const shows: [Show, string][] = current ? [["all", "All"], ["upcoming", "To play"], ["final", "Final"], ["upsets", "Upsets"]] : [["all", "All"], ["upsets", "Upsets"]];
  const loading = current ? !plus : !ledger || !weekly;

  return (
    <div className="um">
      <header className="um-head">
        <h2>Upset Alert Meter</h2>
        <label className="um-week">
          <span className="sr-only">Week</span>
          <select value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Week">
            {weeks.map((w) => <option key={w} value={w}>{w === slate.period ? `${w} · this week` : w}</option>)}
          </select>
        </label>
      </header>
      <div className="um-controls">
        <div className="segmented" role="group" aria-label="League">
          {(["NFL", "CFB"] as const).map((l) => <button key={l} aria-pressed={league === l} onClick={() => setLeague(l)}>{l}</button>)}
        </div>
        <div className="segmented" role="group" aria-label="Show">
          {shows.map(([id, label]) => (
            <button key={id} aria-pressed={show === id} onClick={() => setShow(id)}>{label}{id === "upsets" && upsets.length ? <span className="um-n">{upsets.length}</span> : null}</button>
          ))}
        </div>
      </div>
      {loading && <p className="ol-note" role="status">Loading…</p>}
      <ol className="um-legend" aria-label="Tiers">
        {TIERS.map((t) => <li key={t.id} style={{ ["--tier" as string]: t.color }}><i />{t.short}</li>)}
      </ol>
      <div className={`um-cols${columns.length === 1 ? " one" : ""}`}>
        {columns.map((c) => (
          <section key={c.id} className="um-col" aria-label={c.title}>
            <h3>{c.title}<span>{c.rows.length}</span></h3>
            {c.rows.length ? <div className="um-listhead" aria-hidden="true"><div className="um-hl"><span /><span /><span>Overall</span><span>Off</span><span>Def</span><span>{c.id === "todo" ? "" : "Pts"}</span></div><i>Upset gap</i></div> : null}
            {c.rows.length ? <ol className="um-list" aria-label={`${c.title} games by upset chance, most lopsided first`}>{c.rows.map((r) => <Row key={r.key} r={r} league={league} biggest={r.upset && r.key === biggestKey} />)}</ol> : !loading && <p className="ol-note">{c.empty}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
