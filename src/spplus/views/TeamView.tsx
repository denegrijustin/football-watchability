import { useMemo } from "react";
import { ConfLogo, hasConfLogo } from "../../ConfMark";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { conferenceRanks, dateLabel, fmt, fmtPct, fmtSigned, ord, percentile, rowsFor, timeLabel } from "../data/derive";
import { gameIndex } from "../data/games";
import { cols2, CompareToggle, Derived, Mark, Notes, TeamLink, useTeamLookup } from "../components/common";
import { GameDetail } from "../components/GameDetail";
import { Heatmap, HeatScale, type HeatRow } from "../charts/Heat";
import { LinesChart, type LineSeries } from "../charts/Lines";
import { ResultsTimeline } from "../charts/Timeline";
import { C, confColor } from "../charts/kit";
import { DIV_LABEL, type DivKey, type Team } from "../data/types";
import { useState } from "react";

export function TeamPicker({ value, onPick, label = "Team", exclude, division }: { value: string; onPick: (id: string) => void; label?: string; exclude?: string[]; division?: DivKey }) {
  const { model } = useData();
  if (!model) return null;
  const opts = useMemo(() => model.teams.filter((t) => !exclude?.includes(t.id) && (!division || t.division === division)).map((t) => ({ t, v: `${t.name}${(model.byName.get(t.name)?.length ?? 1) > 1 ? ` (${t.division})` : ""}` })), [model, exclude]);
  const cur = model.byId.get(value);
  const [text, setText] = useState("");
  return (
    <label className="field">
      <span>{label}</span>
      <input className="ctl" list={`teams-${label}`} value={text || (cur ? opts.find((o) => o.t.id === cur.id)?.v ?? cur.name : "")} placeholder="Type a team" aria-label={label}
        onFocus={(e) => { setText(""); e.currentTarget.select(); }}
        onChange={(e) => { const v = e.target.value; setText(v); const hit = opts.find((o) => o.v.toLowerCase() === v.toLowerCase()); if (hit) { onPick(hit.t.id); setText(""); } }}
        onBlur={() => setText("")} />
      <datalist id={`teams-${label}`}>{opts.map((o) => <option key={o.t.id} value={o.v} />)}</datalist>
    </label>
  );
}

export default function TeamView() {
  const { model } = useData();
  const [route, nav] = useRoute();
  const lookup = useTeamLookup();
  const [active, setActive] = useState<string | null>(null);
  if (!model) return null;
  const team: Team = (route.team && model.byId.get(route.team)) || model.teams.filter((t) => t.division === "FBS").sort((a, b) => (a.weeks[model.latest]?.spRk ?? 999) - (b.weeks[model.latest]?.spRk ?? 999))[0];
  const idx = gameIndex(model);
  const latest = team.latest;
  const tw = team.weeks[latest];
  const weeks = Object.keys(team.weeks).map(Number).sort((a, b) => a - b);
  const sizes = useMemo(() => Object.fromEntries(model.weeks.map((w) => [w, rowsFor(model, team.division, w).length])), [model, team.division]);
  const crs = useMemo(() => conferenceRanks(rowsFor(model, team.division, latest)), [model, team.division, latest]);
  const cr = crs.get(team.id);
  const mates = useMemo(() => rowsFor(model, team.division, latest).filter((r) => r.tw.conf === tw?.conf).sort((a, b) => (a.tw.spRk ?? 999) - (b.tw.spRk ?? 999)), [model, team.division, latest, tw?.conf]);
  const top = team.top[latest];
  const hasSt = team.division === "FBS";

  const cats = [{ key: "sp", label: "Overall SP+", rk: "spRk" }, { key: "off", label: "Offense", rk: "offRk" }, { key: "def", label: "Defense", rk: "defRk" }, ...(hasSt ? [{ key: "st", label: "Special teams", rk: "stRk" }] : [])] as const;
  const heatRows: HeatRow[] = [
    ...cats.map((c) => ({
      id: c.key, label: c.label,
      cells: model.weeks.map((w) => {
        const x = team.weeks[w];
        const rk = x?.[c.rk as "spRk"] ?? null;
        const pc = percentile(rk, sizes[w]);
        return { value: pc, text: rk == null ? "—" : `#${rk}`, tip: [["Rating", fmt(x?.[c.key as "sp"])], ["Division rank", rk == null ? "—" : `${rk} of ${sizes[w]}`], ["Percentile (derived)", pc == null ? "—" : String(pc)]] as [string, string][] };
      }),
    })),
    {
      id: "all", label: "772 list SP+",
      cells: model.weeks.map((w) => { const x = team.top[w]; return { value: percentile(x?.spRk ?? null, 772), text: x?.spRk == null ? "—" : `#${x.spRk}`, tip: [["772-list SP+", fmt(x?.sp)], ["Rank", x?.spRk == null ? "—" : `${x.spRk} of 772`], ["Percentile (derived)", String(percentile(x?.spRk ?? null, 772) ?? "—")]] as [string, string][] }; }),
    },
  ];

  const trend: LineSeries[] = [
    { id: "sp", label: "SP+", color: C.s[0], values: model.weeks.map((w) => team.weeks[w]?.sp ?? null) },
    { id: "off", label: "Offense", color: C.s[1], values: model.weeks.map((w) => team.weeks[w]?.off ?? null) },
    { id: "def", label: "Defense (lower is better)", color: C.s[2], values: model.weeks.map((w) => team.weeks[w]?.def ?? null) },
    ...(hasSt ? [{ id: "st", label: "Special teams", color: C.s[3], values: model.weeks.map((w) => team.weeks[w]?.st ?? null) }] : []),
  ];

  const games = idx.byTeam.get(team.name) ?? [];
  const selGame = games.find((g) => g.id === route.p.game) ?? null;
  const upcoming = model.projections.filter((p) => p.week === model.latest && (p.away === team.name || p.home === team.name));
  const season = model.season.find((s) => s.team === team.name);

  const notes: string[] = [];
  if (tw && cr && tw.spRk != null) notes.push(`${team.name} is ${ord(tw.spRk)} of ${sizes[latest]} in ${DIV_LABEL[team.division]} SP+ and ${ord(cr.sp)} of ${cr.size} in the ${tw.conf}.`);
  if (hasSt && tw?.offRk != null && tw?.defRk != null) {
    const best = [["offense", tw.offRk], ["defense", tw.defRk], ["special teams", tw.stRk ?? 999]].sort((a, b) => (a[1] as number) - (b[1] as number));
    notes.push(`Strongest unit: ${best[0][0]} (${ord(best[0][1] as number)}); weakest: ${best[2][0]} (${ord(best[2][1] as number)}).`);
  }
  if (season && season.diff != null && Math.abs(season.diff) >= 1) notes.push(`${season.wins} wins against ${fmt(season.secondOrder, 1)} second-order wins: ${season.diff > 0 ? "winning more" : "winning fewer"} than the scoring profile suggests (${fmtSigned(-season.diff, 1)}).`.replace("(−", "(").replace("(+", "("));

  return (
    <div className="stack">
      <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <Mark team={team} size={44} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>{team.name}</h2>
          <p className="sub" style={{ margin: 0 }}>
            {hasConfLogo(tw?.conf, team.division) ? <span style={{ marginRight: 6 }}><ConfLogo conf={tw?.conf} division={team.division} size={18} /></span> : <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: confColor(tw?.conf), marginRight: 6 }} />}{tw?.conf ?? "—"} · {DIV_LABEL[team.division]} · {tw?.record ? tw.record.text : "no record"}{tw?.record?.recovered ? "*" : ""} · Week {latest}
          </p>
        </div>
        <div className="kv" style={{ gridTemplateColumns: "repeat(4, auto)", gap: "4px 20px" }}>
          <div><dt>SP+</dt><dd>{fmt(tw?.sp)}</dd></div>
          <div><dt>{team.division} rank</dt><dd>{tw?.spRk ?? "—"}</dd></div>
          <div><dt>Conf. rank <Derived why="Computed from the same rating" /></dt><dd>{cr?.sp ?? "—"}/{cr?.size ?? "—"}</dd></div>
          <div><dt>772-list rank</dt><dd>{top?.spRk ?? "—"}</dd></div>
        </div>
        <TeamPicker value={team.id} onPick={(id) => nav({ team: id, p: { game: null } }, { replace: true })} />
        <CompareToggle id={team.id} />
        {hasSt && <button type="button" className="btn small" onClick={() => nav({ view: "simulator", p: { a: team.id } })}>Simulate a game</button>}
      </div>

      <div className="panel">
        <div className="phead"><div><h2>Percentile by week</h2><p className="sub" style={{ margin: 0 }}>Cell text is the sheet's rank; color is the share of the division rated below <Derived why="(N − rank) ÷ (N − 1), from the source rank" /></p></div></div>
        <Heatmap rows={heatRows} cols={model.weeks.map((w) => `Wk ${w}`)} ariaLabel={`${team.name} national percentile by category and week`} rowTitle="Category" />
        <HeatScale />
        <Notes items={notes} />
      </div>

      <div className="grid2" style={cols2("minmax(0,1.3fr) minmax(0,1fr)")}>
        <div className="panel">
          <h2>Ratings by week</h2>
          <p className="sub">SP+ points. For defense, lower is better.</p>
          <LinesChart xs={weeks} xLabel={(x) => `Wk ${x}`} series={trend.map((s) => ({ ...s, values: weeks.map((w) => team.weeks[w]?.[s.id as "sp"] ?? null) }))} height={280} yTitle="SP+" yFormat={(v) => v.toFixed(0)}
            activeId={active} onActive={setActive}
            tipRows={(xi, s) => { const x = team.weeks[weeks[xi]]; const rk = x?.[`${s.id}Rk` as "spRk"]; return [["Value", fmt(x?.[s.id as "sp"])], ["Division rank", rk == null ? "—" : String(rk)]]; }}
            ariaLabel={`${team.name} ratings by week`} />
          <div className="legend">{trend.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.label}</span>)}</div>
        </div>
        <div className="panel">
          <h2>{tw?.conf ?? "Conference"} teams</h2>
          <p className="sub">Week {latest} SP+ · national rank and conference position</p>
          <div className="tbl-wrap" style={{ maxHeight: 330 }}><table className="tbl">
            <thead><tr><th className="r">Conf</th><th>Team</th><th className="r">SP+</th><th className="r">Nat.</th></tr></thead>
            <tbody>{mates.map((r) => (
              <tr key={r.team.id} className={r.team.id === team.id ? "sel" : undefined}>
                <td className="r num">{crs.get(r.team.id)?.sp ?? "—"}</td><td><TeamLink team={r.team} size={18} /></td><td className="r num">{fmt(r.tw.sp)}</td><td className="r num">{r.tw.spRk ?? "—"}</td>
              </tr>))}</tbody>
          </table></div>
        </div>
      </div>

      <div className="grid2" style={cols2("minmax(0,1.3fr) minmax(0,1fr)")}>
        <div className="panel">
          <h2>Season results</h2>
          <p className="sub">{games.length ? `${games.length} games in the postgame sheet through ${dateLabel(games[games.length - 1].date)}` : "This team has no games in the postgame sheet"} · select a game for its underlying rows</p>
          <ResultsTimeline games={games} selected={selGame?.id ?? null} onSelect={(id) => nav({ p: { game: route.p.game === id ? null : id } }, { replace: true })}
            oppLabel={(g) => `vs ${g.opp}`} logoFor={(n) => { const t = lookup(n); return t?.logo?.local ?? t?.logo?.remote; }} />
          {games.length > 0 && (
            <details className="vals" open={false}>
              <summary>Game values</summary>
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th className="r">Margin</th><th className="r">PGWE</th><th className="r">Adj. margin</th></tr></thead>
                <tbody>{games.map((g) => <tr key={g.id} className={g.id === selGame?.id ? "sel" : undefined}><td>{g.date}</td><td>{g.opp}</td><td>{g.win === 1 ? "W" : "L"} {g.pts}–{g.oppPts}</td><td className="r num">{g.margin}</td><td className="r num">{g.pgwe}</td><td className="r num">{g.adjMgn}</td></tr>)}</tbody></table></div>
            </details>
          )}
        </div>
        <div className="panel">
          <h2>{selGame ? `${selGame.team} vs ${selGame.opp}` : "Season ledger"}</h2>
          {selGame ? <GameDetail result={selGame} /> : season ? (
            <>
              <p className="sub">Totals from the postgame sheet's team table (row {season.row}); the sheet computes them from the game rows.</p>
              <dl className="kv">
                <div><dt>Games</dt><dd>{season.games}</dd></div><div><dt>Wins</dt><dd>{season.wins}</dd></div>
                <div><dt>2nd-order wins</dt><dd>{fmt(season.secondOrder, 3)}</dd></div><div><dt>Wins − 2nd-order</dt><dd>{fmtSigned(season.diff, 3)}</dd></div>
                <div><dt>Scoring margin</dt><dd>{season.scoringMgn}</dd></div><div><dt>Adjusted margin</dt><dd>{fmt(season.adjMgn)}</dd></div><div><dt>Margin − adjusted</dt><dd>{fmtSigned(season.mgnDiff)}</dd></div>
              </dl>
            </>
          ) : <p className="empty">The season ledger lists FBS teams only.</p>}
          {upcoming.length > 0 && !selGame && (
            <div style={{ marginTop: 12 }}>
              <h3>Week {model.latest} game</h3>
              {upcoming.map((p) => (
                <div key={p.id} className="note-box" style={{ marginBottom: 6 }}>
                  <b>{p.game}</b> · {dateLabel(p.date)} {timeLabel(p.time)}<br />
                  SP+ projects {p.projWinner} by {fmt(p.projMargin)} ({fmtPct(p.winProb)}), {p.projScore}. Line {p.spread ?? "—"}; ATS pick {p.atsPick ?? "—"}; O/U {p.ou ?? "—"} ({p.ouPick ?? "—"}).
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
