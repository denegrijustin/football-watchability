import { useEffect, useMemo, useState } from "react";
import { usePerf } from "../data";
import { gamesFor, measure, type MetricResult } from "../engine";
import { fmt, InfoTip, PerfFrame, useTeamColors } from "../ui";
import { BP_MODES, bigPlayTakeaway, longestPlays, modeDef, modeOf, modePatch, periodName, population, quadrantOf, sortPoints, type BpMode, type SortKey } from "../bigplaysCalc";
import { BigPlaysScatter, type ScatterDot } from "../charts/bigplaysScatter";
import type { PerfData, PerfSelection } from "../types";

const pc = (v: number | null | undefined, d = 1) => fmt.pct(v, d);

function valueText(r: MetricResult, hasEpa: boolean): string {
  if (r.value == null) return "—";
  return r.def.unit === "pct" ? pc(r.value) : r.def.unit === "pts" ? r.value.toFixed(2) : hasEpa ? fmt.signed(r.value) : pc(r.value);
}

function Profile({ data, sel, ids }: { data: PerfData; sel: PerfSelection; ids: { id: string; title: string }[] }) {
  const { adapter } = usePerf();
  const res = useMemo(() => ids.map((t) => measure(data, sel, t.id)), [data, sel, ids]);
  const hasEpa = data.config.hasEpa;
  return (
    <div className="tbl-wrap">
      <table className="tbl bp-prof" aria-label="Six measures">
        <thead>
          <tr><th>Measure</th>{ids.map((t) => <th key={t.id} className="r">{t.title}</th>)}</tr>
        </thead>
        <tbody>
          {res[0]?.map((r, i) => (
            <tr key={r.def.id}>
              <td>{r.def.label}<small className="bp-plain">{r.def.plain}</small></td>
              {res.map((x, j) => (
                <td key={ids[j].id} className="r">
                  <b>{valueText(x[i], hasEpa)}</b>
                  <small className="bp-plain">{x[i].rank ? `${fmt.ord(x[i].rank!)} of ${x[i].of}` : "no data"}{x[i].small ? " · small sample" : ""}</small>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sub">Ranks run from best (1st) to worst; for the defense measures, allowing less is better. {ids.map((t) => adapter.short(t.id)).join(" and ")} {ids.length > 1 ? "are" : "is"} measured the same way.</p>
    </div>
  );
}

function Plays({ data, sel, team, mode }: { data: PerfData; sel: PerfSelection; team: string; mode: BpMode }) {
  const { adapter } = usePerf();
  const list = useMemo(() => longestPlays(data, sel, team, mode, 5), [data, sel, team, mode]);
  const what = mode === "def" ? "allowed" : "gained";
  const kind = mode === "pass" ? "passing " : mode === "rush" ? "rushing " : "";
  return (
    <div className="bp-plays">
      <h4>{adapter.short(team)}: longest {kind}plays {what}</h4>
      {list.items.length === 0 ? <p className="sub">No {kind}big plays {what === "gained" ? "" : "against this defense "}in the games selected{sel.garbage === "skip" ? " (garbage time is skipped)" : ""}.</p> : (
        <ol className="bp-list">
          {list.items.map((p, i) => (
            <li key={`${p.game}-${i}`}>
              <b className="bp-yds">{p.yards}<small> yds</small></b>
              <span className="bp-what">
                <span className="bp-kind">{p.pass ? "Pass" : "Run"}</span>{" "}
                <span className="tm">{mode === "def" ? <>by {adapter.mark(p.by, 16)} {adapter.short(p.by)}</> : <>{p.home === 0 ? "at" : "vs"} {adapter.mark(p.against, 16)} {adapter.short(p.against)}</>}</span>
                <small> · Week {p.week} · {periodName(p.period)} {p.clock}{p.garbage ? " · garbage time" : ""}</small>
                <span className="bp-desc">{p.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {list.total > list.items.length && <p className="sub">{list.total} big plays on record; the five longest are shown.</p>}
      {list.partial && <p className="sub">Each game keeps its six longest big plays, so a few shorter {kind || ""}plays could be missing here.</p>}
    </div>
  );
}

export default function BigPlays() {
  const { data, sel, set, adapter } = usePerf();
  const { a, b } = useTeamColors();
  const mode = modeOf(sel);
  const md = modeDef(mode);
  const [inspect, setInspect] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "x", dir: -1 });
  useEffect(() => setInspect(null), [sel.team]);

  const pop = useMemo(() => (data ? population(data, sel, mode) : null), [data, sel, mode]);
  const name = (id: string) => adapter.name(id);
  const dots: ScatterDot[] = useMemo(() => (pop ? pop.points.map((p) => ({ ...p, name: adapter.name(p.id) })) : []), [pop, adapter]);
  const team = sel.team;
  const shownId = inspect && dots.some((d) => d.id === inspect) ? inspect : team;
  const point = (id: string | null) => (id && pop ? pop.points.find((p) => p.id === id) ?? null : null);
  const take = pop && team ? bigPlayTakeaway({ name: adapter.short(team), mode, p: point(team), line: pop.line, sd: pop.sd }) : null;
  const shownTake = pop && shownId && shownId !== team ? bigPlayTakeaway({ name: adapter.short(shownId), mode, p: point(shownId), line: pop.line, sd: pop.sd }) : null;
  // The team beside the opened one: the comparison team, or the selected team when another team is opened.
  const other = shownId && sel.opp && sel.opp !== shownId ? sel.opp : shownId && team && team !== shownId ? team : null;
  const ex = data?.config.explosive;
  const popName = data?.league === "nfl" ? "NFL teams" : "FBS teams";
  const q = pop?.line && shownId && point(shownId) ? quadrantOf(mode, point(shownId)!, pop.line) : null;

  const rows = useMemo(() => (pop?.line ? sortPoints(dots, sort.key, sort.dir, name, (p) => quadrantOf(mode, p, pop.line!).label) : []), [dots, sort, pop, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const sortBtn = (key: SortKey, label: string, cls = "") => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" || key === "quad" ? 1 : -1 }))}>{label}</button>
    </th>
  );

  return (
    <PerfFrame
      title="Big Plays" question="Is this team consistently effective, or does it depend on big gains?"
      show={{ opp: true, window: true, garbage: true }}
      takeaway={take?.text} takeSmall={take?.small}
      defs={["success", "explosive", "pass", "rush", "garbage"]}
    >
      {data && ex && (
        <>
          <div className="bp-controls">
            <div className="field">
              <span>Look at</span>
              <div className="seg" role="group" aria-label="Look at">
                {BP_MODES.map((m) => <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => set(modePatch(m.id))}>{m.label}</button>)}
              </div>
            </div>
            <p className="bp-def">
              <b>Big play</b> = a pass of {ex.pass}+ yards or a run of {ex.rush}+ yards, counted the same way for every team, on offense and defense.
              <InfoTip label="success rate">{data.definitions.success} Success rate is how steady a team is; explosive rate is how often it hits for a big gain.</InfoTip>
            </p>
          </div>

          <div className="panel bp-panel">
            <div className="phead">
              <div>
                <h2>{mode === "def" ? "Defense: what opponents did against each team" : `${md.label}: steady or explosive?`}</h2>
                <p className="sub" style={{ margin: 0 }}>
                  {mode === "def"
                    ? `Both axes show what opponents achieved, so lower is better on both and the best corner is bottom-left. Dashed lines are the league average.`
                    : `Right means more ${md.noun} succeed; up means more go for big gains. The best corner is top-right. Dashed lines are the league average.`}
                  {" "}Tap or press Enter on a team to open it.
                </p>
              </div>
            </div>
            {pop && pop.points.length > 0 && pop.line ? (
              <>
                <BigPlaysScatter
                  dots={dots} line={pop.line} mode={mode} selected={team} compare={sel.opp && point(sel.opp) ? sel.opp : null} inspected={inspect} colorA={a} colorB={b}
                  onInspect={(id) => setInspect((cur) => (cur === id ? null : id))} onClear={() => setInspect(null)}
                />
                <div className="legend bp-legend" aria-label="Legend">
                  {team && <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill={a} /></svg>{adapter.short(team)} (selected, circle)</span>}
                  {sel.opp && <span><svg width="14" height="14" aria-hidden="true"><rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" fill={b} /></svg>{adapter.short(sel.opp)} (comparison, diamond)</span>}
                  <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className="bp-other" /></svg>Other {popName}</span>
                  <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className="bp-other small" /></svg>Small sample, so treat with care</span>
                </div>
              </>
            ) : <p className="empty">No team has enough {md.unit} in this selection to plot yet.</p>}
          </div>

          {shownId && (
            <section className="panel bp-card" aria-label={`${name(shownId)} details`} aria-live="polite">
              <div className="phead">
                <div className="bp-card-h">
                  <span className="tm">{adapter.mark(shownId, 28)}<h2>{name(shownId)}</h2></span>
                  <p className="sub" style={{ margin: 0 }}>
                    {shownId === team ? "Selected team" : shownId === sel.opp ? "Comparison team" : "Opened from the chart"}
                    {q && <> · <b>{q.label}</b> ({q.best ? "the best corner" : q.blurb})</>}
                  </p>
                </div>
                <div className="bp-actions">
                  {shownId !== team && <button type="button" className="btn small" onClick={() => { set({ team: shownId }); }}>Make selected team</button>}
                  {shownId !== sel.opp && shownId !== team && <button type="button" className="btn small" onClick={() => set({ opp: shownId, bench: "opp" })}>Compare with {adapter.short(team ?? "")}</button>}
                  {inspect && <button type="button" className="btn small ghost" onClick={() => setInspect(null)}>Close</button>}
                </div>
              </div>
              {shownTake?.text && <p className="bp-take">{shownTake.text}{shownTake.small ? <small> {shownTake.small}</small> : null}</p>}
              {point(shownId) && (
                <dl className="kv bp-kv">
                  <div><dt>{mode === "def" ? "Opponents' success rate" : "Success rate"}</dt><dd>{pc(point(shownId)!.x)} <small>league {pc(pop!.line!.x)}</small></dd></div>
                  <div><dt>{mode === "def" ? "Opponents' explosive rate" : "Explosive rate"}</dt><dd>{pc(point(shownId)!.y)} <small>league {pc(pop!.line!.y)}</small></dd></div>
                  <div><dt>Sample</dt><dd>{point(shownId)!.n} {md.unit} in {point(shownId)!.games} game{point(shownId)!.games === 1 ? "" : "s"}{point(shownId)!.small ? " (small)" : ""}</dd></div>
                </dl>
              )}
              <h3>Six measures</h3>
              <Profile data={data} sel={sel} ids={[{ id: shownId, title: adapter.short(shownId) }, ...(other ? [{ id: other, title: adapter.short(other) }] : [])]} />
              <div className={`bp-playcols${other ? " two" : ""}`}>
                <Plays data={data} sel={sel} team={shownId} mode={mode} />
                {other && <Plays data={data} sel={sel} team={other} mode={mode} />}
              </div>
              {adapter.openTeam && <button type="button" className="btn small ghost" onClick={() => adapter.openTeam!(shownId)}>Open the {adapter.short(shownId)} team page</button>}
            </section>
          )}

          <details className="pdefs bp-table-d">
            <summary>Show the same data as a table</summary>
            <div className="tbl-wrap">
              <table className="tbl" aria-label="Success and explosive rates for every team">
                <thead>
                  <tr>
                    {sortBtn("name", "Team")}
                    {sortBtn("x", mode === "def" ? "Success allowed" : "Success rate", "r")}
                    {sortBtn("y", mode === "def" ? "Explosive allowed" : "Explosive rate", "r")}
                    {sortBtn("n", "Plays", "r")}
                    {sortBtn("quad", "Corner")}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={p.id === shownId ? "sel" : undefined}>
                      <td>
                        <button type="button" className="name-btn" aria-pressed={p.id === inspect} onClick={() => setInspect((cur) => (cur === p.id ? null : p.id))}>
                          <span className="tm">{adapter.mark(p.id, 18)}{adapter.name(p.id)}</span>
                        </button>
                        {p.id === team && <small className="bp-plain"> selected</small>}{p.id === sel.opp && <small className="bp-plain"> comparison</small>}
                      </td>
                      <td className="r">{pc(p.x)}</td><td className="r">{pc(p.y)}</td>
                      <td className="r">{p.n}{p.small ? <small className="small-flag"> small</small> : null}</td>
                      <td>{quadrantOf(mode, p, pop!.line!).label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sub">League average: {pc(pop?.line?.x)} success, {pc(pop?.line?.y)} explosive. Corners are decided by those two lines.</p>
          </details>
          {gamesFor(data, team ?? "", sel).length <= 3 && <p className="sub">Early in the season a few long plays can swing a team's explosive rate a lot. Check back as more games are played.</p>}
        </>
      )}
    </PerfFrame>
  );
}
