import { useMemo, useState } from "react";
import { logos, results, slate, type League } from "../data";
import { plusRankFor, usePlusRanks, type TeamRef } from "../plusRanks";
import { useLiveMap } from "../live";
import { buildRows, TIERS, type MeterRow, type MeterTeam } from "../upsetMeter";
import "../upsetMeter.css";

type Show = "all" | "upcoming" | "final" | "upsets";

function Logo({ team }: { team: MeterTeam }) {
  const src = logos[team.logoId];
  return src ? <img src={src} alt="" width="34" height="34" loading="lazy" /> : <span className="um-badge" style={{ background: team.color ?? "#6b7785" }}>{team.abbr.slice(0, 3)}</span>;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

function Row({ r, league }: { r: MeterRow; league: League }) {
  const [a, h] = r.teams;
  const fav = r.teams[r.favorite];
  const under = r.teams[1 - r.favorite];
  const winner = r.score ? (r.score[0] > r.score[1] ? 0 : r.score[1] > r.score[0] ? 1 : null) : null;
  const cls = `um-row${r.status === "final" ? " final" : ""}${r.upset ? " upset" : ""}${r.brewing ? " brewing" : ""}`;
  return (
    <li className={cls} style={{ ["--tier" as string]: r.tier.color }}>
      <div className="um-match" aria-label={`${a.name} at ${h.name}`}>
        {a.rank != null && <span className="um-rank" title={`${league === "NFL" ? "NFL+" : "SP+"} rank`}>{a.rank}</span>}
        <Logo team={a} />
        <span className="um-at">@</span>
        <Logo team={h} />
        {h.rank != null && <span className="um-rank" title={`${league === "NFL" ? "NFL+" : "SP+"} rank`}>{h.rank}</span>}
      </div>
      <div className="um-line">
        <strong>{fav.abbr} +{r.gap} {r.gap === 1 ? "spot" : "spots"}</strong>
        <span>{[r.line != null ? `Line ${fav.abbr} -${r.line}` : "", r.status === "pre" ? when(r.date) : ""].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="um-bar" role="img" aria-label={`${under.name} is ranked ${r.gap} places below ${fav.name}: ${r.tier.short}`}>
        <i style={{ width: `${r.tier.id * 20}%` }} />
        <b /><b /><b /><b />
      </div>
      <div className="um-tier" role="table" aria-label="Rankings, away team first">
        <div className="um-th" role="row"><span /><span>Overall</span><span>Off</span><span>Def</span></div>
        {([a, h] as const).map((t, i) => {
          const o = i === 0 ? h : a;
          // The better (lower) rank in each category is highlighted; equal ranks highlight neither.
          const best = (mine: number | undefined, theirs: number | undefined) => mine != null && (theirs == null || mine < theirs);
          return (
            <div key={i} className="um-tr" role="row">
              <b role="rowheader">{t.abbr}</b>
              <span role="cell" className={best(t.rank ?? undefined, o.rank ?? undefined) ? "best" : ""}>{t.rank != null ? `#${t.rank}` : "NR"}</span>
              <span role="cell" className={best(t.o, o.o) ? "best" : ""}>{t.o ?? "–"}</span>
              <span role="cell" className={best(t.d, o.d) ? "best" : ""}>{t.d ?? "–"}</span>
            </div>
          );
        })}
      </div>
      {r.status !== "pre" && r.score && (
        <div className="um-result">
          <span className="um-state">{r.status === "final" ? r.detail || "FINAL" : r.detail || "LIVE"}</span>
          <span className="um-score">
            <span className={winner === 0 ? "w" : ""}>{a.abbr} {r.score[0]}</span>
            <span className={winner === 1 ? "w" : ""}>{h.abbr} {r.score[1]}</span>
          </span>
          {r.upset && <em className="um-flag">UPSET · {under.abbr} beat {fav.abbr}</em>}
          {r.status === "final" && !r.upset && winner !== null && <em className="um-held">Favorite held</em>}
          {r.brewing && <em className="um-flag live">UPSET BREWING</em>}
        </div>
      )}
    </li>
  );
}

export function UpsetMeter({ defaultLeague }: { defaultLeague: League }) {
  const [league, setLeague] = useState<League>(defaultLeague);
  const [show, setShow] = useState<Show>("all");
  const live = useLiveMap();
  const plus = usePlusRanks();
  const rows = useMemo(() => {
    if (!plus) return [];
    const of = league === "NFL" ? plus.nfl.of : plus.cfb.of;
    return buildRows({
      league, games: slate.games as never, results: results as never, live, period: slate.period,
      ranks: { of, rankOf: (t) => plusRankFor(plus, league, t as TeamRef)?.n ?? null, detailOf: (t) => { const r = plusRankFor(plus, league, t as TeamRef); return r ? { o: r.o, d: r.d } : null; } },
    });
  }, [league, live, plus]);
  const finals = rows.filter((r) => r.status === "final");
  const upsets = finals.filter((r) => r.upset);
  const done = rows.filter((r) => r.status === "final");
  const todo = rows.filter((r) => r.status !== "final");
  const columns: { id: string; title: string; rows: MeterRow[]; empty: string }[] =
    show === "all"
      ? [{ id: "done", title: "Completed", rows: done, empty: "No games have finished yet." }, { id: "todo", title: "Upcoming", rows: todo, empty: "No games left to play." }]
      : show === "upcoming"
        ? [{ id: "todo", title: "Upcoming", rows: todo, empty: "No games left to play." }]
        : show === "final"
          ? [{ id: "done", title: "Completed", rows: done, empty: "No games have finished yet." }]
          : [{ id: "ups", title: "Upsets", rows: rows.filter((r) => r.upset || r.brewing), empty: "No upsets yet this week." }];
  return (
    <div className="um">
      <header className="um-head">
        <div>
          <h2>Upset Alert Meter</h2>
        </div>
        <span className="um-week">{slate.period}</span>
      </header>
      <div className="um-controls">
        <div className="segmented" role="group" aria-label="League">
          {(["NFL", "CFB"] as const).map((l) => <button key={l} aria-pressed={league === l} onClick={() => setLeague(l)}>{l === "NFL" ? "NFL" : "College"}</button>)}
        </div>
        <div className="segmented" role="group" aria-label="Show">
          {([["all", "All"], ["upcoming", "To play"], ["final", "Final"], ["upsets", "Upsets"]] as const).map(([id, label]) => (
            <button key={id} aria-pressed={show === id} onClick={() => setShow(id)}>{label}{id === "upsets" && upsets.length ? <span className="um-n">{upsets.length}</span> : null}</button>
          ))}
        </div>
        {finals.length > 0 && <span className="um-tally" role="status">{upsets.length} upset{upsets.length === 1 ? "" : "s"} in {finals.length} final{finals.length === 1 ? "" : "s"}</span>}
      </div>
      {!plus && <p className="ol-note" role="status">Loading team ranks…</p>}
      <ol className="um-legend" aria-label="Tiers">
        {TIERS.map((t) => <li key={t.id} style={{ ["--tier" as string]: t.color }}><i />{t.short}</li>)}
      </ol>
      <div className={`um-cols${columns.length === 1 ? " one" : ""}`}>
        {columns.map((c) => (
          <section key={c.id} className="um-col" aria-label={c.title}>
            <h3>{c.title}<span>{c.rows.length}</span></h3>
            {c.rows.length ? <ol className="um-list" aria-label={`${c.title} games by upset chance, most lopsided first`}>{c.rows.map((r) => <Row key={r.key} r={r} league={league} />)}</ol> : <p className="ol-note">{c.empty}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
