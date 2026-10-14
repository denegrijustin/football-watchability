import { useMemo, useState } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { dateLabel, fmt, fmtPct, fmtSigned } from "../data/derive";
import { gameIndex } from "../data/games";
import { Derived, Notes, TeamLink, useTeamLookup } from "../components/common";
import { SortTable, type Col } from "../components/SortTable";
import { GameDetail } from "../components/GameDetail";
import { ResultsTimeline } from "../charts/Timeline";
import type { GameResult, SeasonLine } from "../data/types";

type Measure = "wins" | "margin";

export default function Results() {
  const { model } = useData();
  const [route, nav] = useRoute();
  const lookup = useTeamLookup();
  const [limit, setLimit] = useState(150);
  if (!model) return null;
  const idx = gameIndex(model);
  const measure = (route.p.measure as Measure) || "wins";
  const q = route.q.trim().toLowerCase();
  const latest = model.latest;
  const confOf = (name: string) => lookup(name)?.weeks[latest]?.conf ?? null;

  const lines = useMemo(() => model.season.filter((s) => (!q || s.team.toLowerCase().includes(q)) && (!route.conf || confOf(s.team) === route.conf)), [model, q, route.conf]);
  // Sheet: Diff = wins − 2nd-order wins (and margin − adjusted margin). Positive = more than the scoring profile says.
  const scored = useMemo(() => lines.map((s) => ({ s, v: measure === "wins" ? s.diff : s.mgnDiff })).filter((x): x is { s: SeasonLine; v: number } => x.v != null).sort((a, b) => b.v - a.v), [lines, measure]);
  const N = 10;
  const shown = scored.length <= N * 2 ? scored : [...scored.slice(0, N), ...scored.slice(-N)];
  const ext = Math.max(0.1, ...shown.map((x) => Math.abs(x.v)));
  const selTeam = route.team ? model.byId.get(route.team) : undefined;
  const selName = selTeam?.name ?? null;

  const games = useMemo(() => model.results.filter((g) => (!q || g.team.toLowerCase().includes(q) || g.opp.toLowerCase().includes(q)) && (!route.conf || confOf(g.team) === route.conf)), [model, q, route.conf]);
  const unit = measure === "wins" ? "wins" : "points of margin";
  const dec = measure === "wins" ? 2 : 1;

  const notes = useMemo(() => {
    const out: string[] = [];
    if (scored.length) {
      const hi = scored[0], lo = scored[scored.length - 1];
      out.push(`Most ahead of their scoring profile: ${hi.s.team}, ${fmtSigned(hi.v, dec)} ${unit} (${hi.s.wins} wins, ${fmt(hi.s.secondOrder, 2)} second-order).`);
      out.push(`Most behind: ${lo.s.team}, ${fmtSigned(lo.v, dec)} ${unit} (${lo.s.wins} wins, ${fmt(lo.s.secondOrder, 2)} second-order).`);
    }
    const lucky = games.filter((g) => g.win === 1 && g.pgwe != null).sort((a, b) => a.pgwe! - b.pgwe!)[0];
    if (lucky) out.push(`Longest-odds win: ${lucky.team} over ${lucky.opp} ${lucky.pts}–${lucky.oppPts} on ${dateLabel(lucky.date)}, postgame win expectancy ${fmtPct(lucky.pgwe)}.`);
    const unlucky = games.filter((g) => g.win === 0 && g.pgwe != null).sort((a, b) => b.pgwe! - a.pgwe!)[0];
    if (unlucky) out.push(`Likeliest loss to flip: ${unlucky.team} against ${unlucky.opp} ${unlucky.pts}–${unlucky.oppPts}, postgame win expectancy ${fmtPct(unlucky.pgwe)}.`);
    return out;
  }, [scored, games, measure]);

  const cols: Col<GameResult>[] = [
    { key: "date", label: "Date", get: (g) => g.date, render: (g) => dateLabel(g.date) },
    { key: "team", label: "Team", get: (g) => g.team, render: (g) => <TeamLink team={lookup(g.team)} size={18} /> },
    { key: "opp", label: "Opponent", get: (g) => g.opp, render: (g) => <TeamLink team={lookup(g.opp)} size={18} /> },
    { key: "res", label: "Result", get: (g) => g.win, render: (g) => <span className={`delta ${g.win === 1 ? "up" : "down"}`}>{g.win === 1 ? "W" : "L"} {g.pts}–{g.oppPts}</span> },
    { key: "mar", label: "Margin", align: "r", first: "desc", get: (g) => g.margin, render: (g) => (g.margin == null ? "—" : fmtSigned(g.margin, 0)) },
    { key: "pgwe", label: "Postgame win exp.", align: "r", first: "asc", get: (g) => g.pgwe, render: (g) => fmtPct(g.pgwe) },
    { key: "adj", label: "Adj. margin", align: "r", first: "desc", get: (g) => g.adjMgn, render: (g) => fmtSigned(g.adjMgn) },
  ];
  const sortKey = route.p.sort || "date";
  const selGame = games.find((g) => g.id === route.p.game);
  const teamGames = selName ? idx.byTeam.get(selName) ?? [] : [];

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div>
            <h2>{measure === "wins" ? "Wins vs. second-order wins" : "Scoring margin vs. adjusted margin"}</h2>
            <p className="sub" style={{ margin: 0 }}>{shown.length < scored.length ? `10 most ahead and 10 most behind of ${scored.length} FBS teams` : `${scored.length} FBS teams`} · sheet columns “Diff” <Derived why="Re-ordered into a ranked list; values are the sheet's own Diff columns" /></p>
          </div>
          <div className="seg" role="group" aria-label="Measure">
            <button type="button" aria-pressed={measure === "wins"} onClick={() => nav({ p: { measure: null } }, { replace: true })}>Wins</button>
            <button type="button" aria-pressed={measure === "margin"} onClick={() => nav({ p: { measure: "margin" } }, { replace: true })}>Margin</button>
          </div>
        </div>
        {shown.length === 0 ? <p className="empty">No teams match these filters.</p> : (
          <div role="list" aria-label="Ranked difference between results and scoring profile">
            {shown.map(({ s, v }, i) => {
              const t = lookup(s.team);
              const on = t?.id === route.team;
              const wd = (Math.abs(v) / ext) * 50;
              return (
                <div role="listitem" key={s.team} className="dvrow" data-sel={on || undefined} style={i === N && scored.length > N * 2 ? { borderTop: "2px solid var(--axis)" } : undefined}>
                  <span className="dvname"><TeamLink team={t} size={18} /></span>
                  <button type="button" className="dvbar" aria-pressed={on} aria-label={`${s.team}: ${fmtSigned(v, dec)} ${unit}; select`} onClick={() => t && nav({ team: on ? "" : t.id }, { replace: true })}>
                    <i className="dvzero" />
                    <i className={v >= 0 ? "dvpos" : "dvneg"} style={v >= 0 ? { left: "50%", width: `${wd}%` } : { left: `${50 - wd}%`, width: `${wd}%` }} />
                  </button>
                  <span className="dvval num"><b>{fmtSigned(v, dec)}</b> <span className="muted">{measure === "wins" ? `${s.wins} W · ${fmt(s.secondOrder, 2)}` : `${s.scoringMgn} · ${fmt(s.adjMgn)}`}</span></span>
                </div>
              );
            })}
            <div className="dvaxis muted"><span>◀ behind scoring profile</span><span>ahead of it ▶</span></div>
          </div>
        )}
        <p className="sub" style={{ marginTop: 6 }}>{measure === "wins" ? "Right column: actual wins · second-order wins." : "Right column: scoring margin · adjusted margin."} Diff = actual minus profile, as in the sheet.</p>
        <Notes items={notes} />
      </div>

      {selName && (
        <div className="panel">
          <h2>{selName} games</h2>
          <ResultsTimeline games={teamGames} selected={selGame?.id ?? null} onSelect={(id) => nav({ p: { game: route.p.game === id ? null : id } }, { replace: true })} oppLabel={(g) => `vs ${g.opp}`} logoFor={(n) => { const t = lookup(n); return t?.logo?.local ?? t?.logo?.remote; }} />
          {selGame && <div style={{ marginTop: 8 }}><GameDetail result={selGame} /></div>}
        </div>
      )}

      <div className="panel">
        <h2>All games in the postgame sheet</h2>
        <p className="sub">{games.length} team-game rows (an FBS-vs-FBS game appears once for each team) · expand a row for every field</p>
        <SortTable label="Game results" cols={cols} rows={games} rowKey={(g) => g.id} max={limit} expand={(g) => <GameDetail result={g} />} selected={route.p.game}
          sort={{ key: sortKey, dir: (route.p.dir as "asc" | "desc") || "asc", set: (key, dir) => nav({ p: { sort: key, dir } }, { replace: true }) }} />
        {games.length > limit && <button type="button" className="btn small" onClick={() => setLimit(limit + 200)}>Show 200 more</button>}
      </div>
    </div>
  );
}
