import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { usePerf } from "../data";
import { gamesFor } from "../engine";
import {
  EDGE, EDGE_WORD, NOT_A_PREDICTION, biggestGaps, compareTeams, leanCounts, leaderOf, matchupTakeaway, ord, playedBetween, playedSentence, rowSentence,
  type FacetStat, type MatchupRow,
} from "../matchupCalc";
import { InfoTip, PerfFrame, Unavailable, useTeamColors } from "../ui";
import type { PerfData } from "../types";

/** Teams already given their one automatic "next opponent" (a later clear by the user is respected). */
const seeded = new Set<string>();

type Colors = { a: string; b: string };

function StatCard({ stat, row, title, color, data, mark }: { stat: FacetStat; row: MatchupRow; title: string; color: string; data: PerfData; mark: React.ReactNode }) {
  const e = data.config.hasEpa;
  const f = row.facet;
  const lg = stat.leagueValue;
  return (
    <div className="mu-card" style={{ borderTopColor: color }}>
      <h4>{mark}{title}</h4>
      <dl className="kv">
        <div><dt>Season number</dt><dd>{stat.value == null ? "No data" : f.describe(stat.value, stat.side, e)}</dd></div>
        <div><dt>Ranking</dt><dd>{stat.rank == null ? "—" : `${ord(stat.rank)} of ${stat.of} (${ord(stat.pct!)} percentile)`}</dd></div>
        <div><dt>Sample</dt><dd>{stat.sample.toLocaleString()} {f.sampleUnit}{stat.small ? " (small sample)" : ""}</dd></div>
        <div><dt>League average</dt><dd>{lg == null ? "—" : f.short(lg, e)}</dd></div>
      </dl>
    </div>
  );
}

function Detail({ row, id, data, names, short, colors, marks, aId, onClose }: { row: MatchupRow; id: string; data: PerfData; names: Record<string, string>; short: Record<string, string>; colors: Colors; marks: Record<string, React.ReactNode>; aId: string; onClose: () => void }) {
  const f = row.facet;
  const col = (t: string) => (t === aId ? colors.a : colors.b);
  return (
    <div className="mu-detail" id={id} role="region" aria-label={`${f.label} details`}>
      <p className="mu-sent">{rowSentence(row, short)}</p>
      <div className="mu-cards">
        <StatCard stat={row.atk} row={row} title={`${names[row.atk.team]} offense`} color={col(row.atk.team)} data={data} mark={marks[row.atk.team]} />
        <StatCard stat={row.dfn} row={row} title={`${names[row.dfn.team]} defense`} color={col(row.dfn.team)} data={data} mark={marks[row.dfn.team]} />
      </div>
      <p className="sub">{row.edge == null ? "One side has no data for this measure yet." : `Gap: ${Math.abs(row.edge)} percentile point${Math.abs(row.edge) === 1 ? "" : "s"} (${EDGE_WORD[row.level].toLowerCase()}). Under ${EDGE.even} points is shown as about even.`} This is a difference in what has already happened, not a win probability.</p>
      <p className="sub"><b>Definition.</b> {f.definition(data.config.hasEpa, data.definitions)}</p>
      <button type="button" className="btn small ghost" onClick={onClose}>Close details</button>
    </div>
  );
}

function Line({ stat, label, mark, color, filled, data, row }: { stat: FacetStat; label: string; mark: React.ReactNode; color: string; filled: boolean; data: PerfData; row: MatchupRow }) {
  const style: CSSProperties = filled ? { width: `${stat.pct ?? 0}%`, background: color } : { width: `${stat.pct ?? 0}%`, borderColor: color, background: `color-mix(in srgb, ${color} 16%, transparent)` };
  return (
    <span className="mu-line">
      <span className="mu-who">{mark}<span>{label}</span></span>
      <span className="mu-track"><i className="mid" />{stat.pct != null ? <i className={`fill ${filled ? "solid" : "ring"}`} style={style} /> : <em className="na">Not enough data</em>}</span>
      <span className="mu-v"><b>{stat.pct == null ? "—" : ord(stat.pct)}</b><small>{stat.value == null ? "no data" : row.facet.short(stat.value, data.config.hasEpa)}</small></span>
    </span>
  );
}

function RowView({ row, selected, onSelect, onClose, data, names, colors, marks, aId, short }: {
  row: MatchupRow; selected: boolean; onSelect: () => void; onClose: () => void; data: PerfData; names: Record<string, string>; colors: Colors; marks: Record<string, React.ReactNode>; aId: string; short: Record<string, string>;
}) {
  const col = (t: string) => (t === aId ? colors.a : colors.b);
  const id = `mu-d-${row.dir}-${row.facet.id}`;
  const leader = leaderOf(row);
  return (
    <div className={`mu-row${selected ? " sel" : ""}`} data-key={row.key}>
      <button type="button" className="mu-btn" aria-expanded={selected} aria-controls={id} onClick={onSelect}>
        <span className="mu-lab"><b>{row.facet.label}</b><small>{row.facet.plain}</small></span>
        <span className="mu-bars">
          <Line stat={row.atk} row={row} data={data} label={`${short[row.atk.team]} offense`} mark={marks[row.atk.team]} color={col(row.atk.team)} filled />
          <Line stat={row.dfn} row={row} data={data} label={`${short[row.dfn.team]} defense`} mark={marks[row.dfn.team]} color={col(row.dfn.team)} filled={false} />
        </span>
        <span className={`mu-edge lvl-${row.level}`} style={leader && leader !== "even" ? ({ "--lead": col(leader) } as CSSProperties) : undefined}>
          <b>{EDGE_WORD[row.level]}</b>
          {leader && leader !== "even" && <small>{short[leader]}</small>}
          {row.small && <small className="small-flag">small sample</small>}
        </span>
      </button>
      {selected && <Detail row={row} id={id} data={data} names={names} short={short} colors={colors} marks={marks} aId={aId} onClose={onClose} />}
    </div>
  );
}

export default function Matchup() {
  const { data, sel, set, adapter, league } = usePerf();
  const colors = useTeamColors();
  const team = sel.team, opp = sel.opp;
  const root = useRef<HTMLDivElement>(null);
  const [closed, setClosed] = useState<{ a: boolean; b: boolean }>({ a: false, b: false });

  // First visit: compare with the team's next scheduled opponent, once. A later choice (including "No one") is left alone.
  useEffect(() => {
    if (!data || !team) return;
    const k = `${league}:${team}`;
    if (seeded.has(k)) return;
    if (opp) { seeded.add(k); return; }
    const n = adapter.next(team);
    if (n && n.opp !== team && data.teams[n.opp] && adapter.teamIds.includes(n.opp)) { seeded.add(k); set({ opp: n.opp }); }
  }, [data, team, opp, adapter, league, set]);

  const rows = useMemo(() => (data && team && opp ? compareTeams(data, sel, team, opp) : null), [data, sel, team, opp]);
  const gamesA = data && team ? gamesFor(data, team, sel).length : 0;
  const gamesB = data && opp ? gamesFor(data, opp, sel).length : 0;
  const names: Record<string, string> = {}, short: Record<string, string> = {}, marks: Record<string, React.ReactNode> = {};
  for (const t of [team, opp]) if (t) { names[t] = adapter.name(t); short[t] = adapter.short(t); marks[t] = adapter.mark(t, 16); }
  const take = rows && team && opp ? matchupTakeaway({ rows, names: short, gamesA, gamesB }) : null;
  const selKey = rows?.find((r) => r.key === sel.metric)?.key ?? null;
  const gaps = rows ? biggestGaps(rows, 3) : [];
  const counts = rows && team && opp ? leanCounts(rows, team, opp) : null;
  const played = data && team && opp ? playedBetween(data, team, opp) : [];
  const open = (key: string) => {
    const dir = key.split(":")[1] as "a" | "b";
    setClosed((c) => ({ ...c, [dir]: false }));
    set({ metric: key });
    requestAnimationFrame(() => root.current?.querySelector(`[data-key="${key}"]`)?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const close = () => {
    const key = selKey;
    set({ metric: null });
    if (key) requestAnimationFrame(() => (root.current?.querySelector(`[data-key="${key}"] .mu-btn`) as HTMLElement | null)?.focus());
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && selKey) { e.stopPropagation(); close(); } };

  const next = team ? adapter.next(team) : null;
  const panel = (dir: "a" | "b") => {
    if (!rows || !team || !opp || !data) return null;
    const atk = dir === "a" ? team : opp, dfn = dir === "a" ? opp : team;
    const mine = rows.filter((r) => r.dir === dir);
    const isOpen = !closed[dir] || (selKey != null && mine.some((r) => r.key === selKey));
    return (
      <section className="panel mu-panel" aria-label={`${names[atk]} offense against ${names[dfn]} defense`}>
        <h2>
          <button type="button" className="mu-ph" aria-expanded={isOpen} onClick={() => setClosed((c) => ({ ...c, [dir]: !c[dir] }))}>
            <span>{marks[atk]} {short[atk]} with the ball <small>{short[atk]} offense against {short[dfn]} defense</small></span>
            <span className="mu-chev" aria-hidden="true">{isOpen ? "–" : "+"}</span>
          </button>
        </h2>
        {isOpen && (
          <div className="mu-rows">
            {mine.map((r) => (
              <RowView key={r.key} row={r} selected={selKey === r.key} onSelect={() => (selKey === r.key ? close() : open(r.key))} onClose={close} data={data} names={names} colors={colors} marks={marks} aId={team} short={short} />
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <PerfFrame
      title="Matchup" question="Where does each team have an advantage?"
      show={{ opp: true, window: true, garbage: true }}
      takeaway={take?.text} takeSmall={take?.small}
      defs={["success", "explosive", "efficiency", "redzone", "opportunity", "garbage", "drive"]}
    >
      <div ref={root} onKeyDown={onKey} className="mu">
        {data && !data.config.hasEpa && <Unavailable what="Expected points added (EPA)" instead="College data does not include it, so passing and running compare the share of plays that were successful instead." />}
        {!team ? null : !opp ? (
          <div className="panel mu-empty" role="status">
            <h2>Pick a team to compare with</h2>
            <p>Choose a second team in <b>Compare with</b> above to see where each side has an edge: passing against pass defense, running against run defense, big plays, key situations, finishing drives and field position.</p>
            {next && <button type="button" className="btn" onClick={() => set({ opp: next.opp })}>Compare with next opponent: {adapter.name(next.opp)}</button>}
          </div>
        ) : !rows || !data ? null : (
          <>
            <div className="mu-head" role="group" aria-label="Teams compared">
              <div className="mu-team" style={{ borderTopColor: colors.a }}>
                {adapter.mark(team, 36)}
                <div><b>{names[team]}</b><small>{gamesA} game{gamesA === 1 ? "" : "s"} · solid bars</small>{adapter.openTeam && <button type="button" className="btn small ghost" onClick={() => adapter.openTeam!(team)}>Team page</button>}</div>
              </div>
              <div className="mu-mid">
                <button type="button" className="btn" onClick={() => set({ team: opp, opp: team })} aria-label={`Swap teams: ${names[opp]} first`}>⇄ Swap</button>
                <button type="button" className="btn small ghost" onClick={() => set({ opp: null })}>Clear</button>
              </div>
              <div className="mu-team b" style={{ borderTopColor: colors.b }}>
                {adapter.mark(opp, 36)}
                <div><b>{names[opp]}</b><small>{gamesB} game{gamesB === 1 ? "" : "s"} · outlined bars</small>{adapter.openTeam && <button type="button" className="btn small ghost" onClick={() => adapter.openTeam!(opp)}>Team page</button>}</div>
              </div>
            </div>
            {played.length > 0 && <p className="mu-fact" role="note">Already played this season: {played.map((g) => playedSentence(g, short)).join(" ")}</p>}
            {Math.min(gamesA, gamesB) === 0 && <p className="note-box" role="note">{gamesA === 0 ? names[team] : names[opp]} has no games in the current selection, so most comparisons below have no data.</p>}

            {counts && (
              <div className="panel mu-sum" aria-label="Where the numbers lean">
                <div className="mu-balance" role="img" aria-label={`Of ${rows.length} comparisons, ${counts.a} lean to ${names[team]}, ${counts.even} are about even, ${counts.b} lean to ${names[opp]}${counts.unknown ? `, ${counts.unknown} lack data` : ""}`}>
                  {rows.map((r) => {
                    const l = leaderOf(r);
                    return <i key={r.key} className={l === team ? "a" : l === opp ? "b" : "e"} style={l === team ? { background: colors.a } : l === opp ? { borderColor: colors.b, background: `color-mix(in srgb, ${colors.b} 20%, transparent)` } : undefined} />;
                  })}
                </div>
                <p className="mu-counts">
                  <span><b>{counts.a}</b> lean {short[team]}</span><span><b>{counts.even}</b> about even</span><span><b>{counts.b}</b> lean {short[opp]}</span>
                  {counts.unknown > 0 && <span><b>{counts.unknown}</b> no data</span>}
                </p>
                <p className="sub">Each square is one of the {rows.length} comparisons below (filled: {short[team]} ahead; outlined: {short[opp]} ahead; grey: even). A lean means a gap of {EDGE.even}+ percentile points in this season's numbers.</p>
                {gaps.length > 0 && (
                  <>
                    <h3>Largest gaps <InfoTip label="percentile gap">A percentile says how many teams in the league a team beats on a measure. The gap is the attacking team's percentile minus the defending team's, so +40 means the offense rates 40 points higher than the defense it faces.</InfoTip></h3>
                    <ul className="mu-gaps">
                      {gaps.map((g) => (
                        <li key={g.key}><button type="button" onClick={() => open(g.key)}>{rowSentence(g, short)}<span aria-hidden="true"> ›</span></button></li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="mu-panels">{panel("a")}{panel("b")}</div>
            <div className="legend plegend" aria-label="Legend">
              <span><i style={{ background: colors.a }} />{marks[team]} {names[team]}</span>
              <span><i style={{ border: `2px solid ${colors.b}`, background: "transparent" }} />{marks[opp]} {names[opp]}</span>
              <span>Solid bar: the team's offense. Outlined bar: the team's defense. A longer bar is always better, including for defenses.</span>
            </div>
            <p className="note-box" role="note"><b>What this page does not do.</b> {NOT_A_PREDICTION} Injuries, weather, home field and who is playing are not in these numbers.</p>
          </>
        )}
      </div>
    </PerfFrame>
  );
}
