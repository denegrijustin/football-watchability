import { useMemo, useState } from "react";
import { logos, results, slate, type League } from "../data";
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

function Row({ r }: { r: MeterRow }) {
  const [a, h] = r.teams;
  const fav = r.teams[r.favorite];
  const under = r.teams[1 - r.favorite];
  const winner = r.score ? (r.score[0] > r.score[1] ? 0 : r.score[1] > r.score[0] ? 1 : null) : null;
  const cls = `um-row${r.status === "final" ? " final" : ""}${r.upset ? " upset" : ""}${r.brewing ? " brewing" : ""}`;
  return (
    <li className={cls} style={{ ["--tier" as string]: r.tier.color }}>
      <div className="um-match" aria-label={`${a.name} at ${h.name}`}>
        {a.rank && <span className="um-rank">{a.rank}</span>}
        <Logo team={a} />
        <span className="um-at">@</span>
        <Logo team={h} />
        {h.rank && <span className="um-rank">{h.rank}</span>}
      </div>
      <div className="um-line">
        <strong>{r.line != null ? `${fav.abbr} -${r.line}` : `${fav.abbr} favored`}</strong>
        <span>{r.status === "pre" ? when(r.date) : ""}</span>
      </div>
      <div className="um-bar" role="img" aria-label={`${under.name} win chance ${Math.round(r.upsetPct)} percent: ${r.tier.label}`}>
        <i style={{ width: `${r.tier.id * 20}%` }} />
        <b /><b /><b /><b />
      </div>
      <div className="um-tier">
        <strong>{r.tier.label}</strong>
        <span>{under.abbr} win chance {Math.round(r.upsetPct)}%</span>
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
  const rows = useMemo(
    () => buildRows({ league, games: slate.games as never, results: results as never, live, period: slate.period }),
    [league, live],
  );
  const finals = rows.filter((r) => r.status === "final");
  const upsets = finals.filter((r) => r.upset);
  const shown = rows.filter((r) => (show === "all" ? true : show === "upcoming" ? r.status !== "final" : show === "final" ? r.status === "final" : r.upset || r.brewing));
  return (
    <div className="um">
      <header className="um-head">
        <div>
          <h2>Upset Alert Meter</h2>
          <p>How much has to go wrong for the favorite? Each bar is the underdog's chance, from the betting line and ESPN's predictor. Finished games show the score, and an upset lights up.</p>
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
      <ol className="um-legend" aria-label="Tiers">
        {TIERS.map((t) => <li key={t.id} style={{ ["--tier" as string]: t.color }}><i />{t.label}</li>)}
      </ol>
      {shown.length ? (
        <ol className="um-list" aria-label="Games by upset chance, most lopsided first">
          {shown.map((r) => <Row key={r.key} r={r} />)}
        </ol>
      ) : (
        <p className="ol-note">{show === "upsets" ? "No upsets yet this week." : "No games to show."}</p>
      )}
    </div>
  );
}
