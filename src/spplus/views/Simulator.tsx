import { useEffect, useMemo, useState } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { dateLabel, fmt, fmtPct, fmtSigned, resolveWeek, timeLabel } from "../data/derive";
import { gameIndex } from "../data/games";
import { Derived, Mark, Notes, useTeamLookup } from "../components/common";
import { TeamPicker } from "./TeamView";
import { MarginHistogram, ScoreGrid } from "../charts/SimCharts";
import { Scatter, type ScatterPoint } from "../charts/Scatter";
import { C } from "../charts/kit";
import { backtest, paramsFor, ratingsFor, simulate, type Venue } from "../sim";
import type { Model, Projection, Team } from "../data/types";

const nameOf = (id: string) => id.replace(/^FBS:/, "");

/** The scheduled game (any week) between two teams, newest week first. */
function scheduled(model: Model, a: string, b: string): Projection | undefined {
  return [...model.projections].reverse().find((p) => (p.away === a && p.home === b) || (p.away === b && p.home === a));
}
const venueFor = (p: Projection, a: string): "a" | "b" | "n" => (p.neutral ? "n" : p.home === a ? "a" : "b");
const venueKey = (v: "a" | "b" | "n"): Venue => (v === "a" ? "a-home" : v === "b" ? "b-home" : "neutral");

export default function Simulator() {
  const { model } = useData();
  const [route, nav] = useRoute();
  const lookup = useTeamLookup();
  const [reroll, setReroll] = useState(0);
  if (!model) return null;
  const week = route.p.sw != null && model.weeks.includes(Number(route.p.sw)) ? Number(route.p.sw) : resolveWeek(model, route.week);
  const idx = gameIndex(model);

  // Picking a scheduled game: a week, a conference (a game between two conferences is listed under both; Notre Dame and UConn are "Independents"),
  // then the game. Games with an FCS side have no comparable ratings and are left out.
  const confLabel = (c: string) => (c === "Indies" ? "Independents" : c);
  const confAt = (name: string, w: number) => model.byId.get(`FBS:${name}`)?.weeks[w]?.conf ?? null;
  const weekGames = useMemo(() => model.projections.filter((p) => p.week === week && model.byId.has(`FBS:${p.away}`) && model.byId.has(`FBS:${p.home}`)), [model, week]);
  const skipped = model.projections.filter((p) => p.week === week).length - weekGames.length;
  const confOptions = useMemo(() => [...new Set(weekGames.flatMap((p) => [confAt(p.away, week), confAt(p.home, week)]).filter((c): c is string => !!c))].sort((a, b) => confLabel(a).localeCompare(confLabel(b))), [weekGames, week]);
  const pickConf = route.p.sc && confOptions.includes(route.p.sc) ? route.p.sc : "";
  const gameList = useMemo(() => weekGames.filter((p) => !pickConf || confAt(p.away, week) === pickConf || confAt(p.home, week) === pickConf), [weekGames, pickConf, week]);
  const chooseGame = (p: Projection | undefined, extra: Record<string, string | null> = {}) => {
    if (!p) { nav({ p: extra }, { replace: true }); return; }
    nav({ p: { ...extra, a: `FBS:${p.away}`, b: `FBS:${p.home}`, v: venueFor(p, p.away) } }, { replace: true });
  };
  const gameTag = (p: Projection) => {
    const ca = confAt(p.away, week), ch = confAt(p.home, week);
    return ca && ch && ca !== ch ? ` (${confLabel(ca)} / ${confLabel(ch)})` : "";
  };

  // Start from a scheduled game: the strongest pairing of the latest week, or the chosen team's own game.
  useEffect(() => {
    const { a, b } = route.p;
    if (a && b) return;
    const sched = model.projections.filter((p) => p.week === model.latest);
    const rating = (n: string) => model.byId.get(`FBS:${n}`)?.weeks[model.latest]?.sp ?? -99;
    let pick: Projection | undefined;
    if (a) pick = sched.find((p) => p.away === nameOf(a) || p.home === nameOf(a));
    else pick = [...sched].sort((x, y) => rating(y.away) + rating(y.home) - rating(x.away) - rating(x.home))[0];
    if (!pick) return;
    const A = a ? nameOf(a) : pick.away;
    const B = A === pick.away ? pick.home : pick.away;
    nav({ p: { a: `FBS:${A}`, b: `FBS:${B}`, v: venueFor(pick, A) } }, { replace: true });
  }, [route.p.a, route.p.b, model, nav]);

  const aId = route.p.a ?? "", bId = route.p.b ?? "";
  const A = aId ? ratingsFor(model, nameOf(aId), week) : null;
  const B = bId ? ratingsFor(model, nameOf(bId), week) : null;
  const v = (route.p.v as "a" | "b" | "n") || "a";
  const n = Number(route.p.n) || 10000;
  const base = useMemo(() => paramsFor(model, week), [model, week]);
  const hfaIn = route.p.hfa != null && route.p.hfa !== "" ? Number(route.p.hfa) : null;
  const params = useMemo(() => ({ ...base, hfa: hfaIn ?? base.hfa }), [base, hfaIn]);
  const lineA = route.p.ln != null && route.p.ln !== "" ? Number(route.p.ln) : null;
  const totalLine = route.p.ou != null && route.p.ou !== "" ? Number(route.p.ou) : null;
  const seed = (route.p.seed ? Number(route.p.seed) : undefined);

  const sim = useMemo(() => (A && B && A.name !== B.name ? simulate(params, A, B, venueKey(v), { n, seed: seed != null ? seed + reroll : reroll ? 1000 + reroll : undefined, lineA: Number.isFinite(lineA as number) ? lineA : null, totalLine: Number.isFinite(totalLine as number) ? totalLine : null }) : null), [params, A, B, v, n, seed, reroll, lineA, totalLine]);
  const sched = A && B ? scheduled(model, A.name, B.name) : undefined;
  const played = A && B ? idx.byTeam.get(A.name)?.find((r) => r.opp === B.name) : undefined;
  const bt = useMemo(() => backtest(model), [model]);
  const tA = A ? lookup(A.name) : undefined, tB = B ? lookup(B.name) : undefined;

  const set = (p: Record<string, string | null>) => nav({ p }, { replace: true });
  const swap = () => set({ a: bId, b: aId, v: v === "a" ? "b" : v === "b" ? "a" : "n", ln: lineA == null ? null : String(-lineA) });
  const useSheetLine = () => {
    if (!sched || !A) return;
    const fav = sched.spreadTeam;
    set({ ln: sched.spreadPts == null ? null : String(fav === A.name ? sched.spreadPts : fav ? -sched.spreadPts : 0), ou: sched.ou == null ? null : String(sched.ou) });
  };

  const notes: string[] = [];
  if (sim && A && B) {
    const fav = sim.winA >= 0.5 ? A.name : B.name;
    const favP = Math.max(sim.winA, sim.winB);
    notes.push(`${fav} wins ${fmtPct(favP, 1)} of ${sim.n.toLocaleString()} simulated games; the middle half of margins runs from ${sim.quantiles.margin.p25 > 0 ? `${A.name} by ${sim.quantiles.margin.p25}` : `${B.name} by ${-sim.quantiles.margin.p25}`} to ${sim.quantiles.margin.p75 > 0 ? `${A.name} by ${sim.quantiles.margin.p75}` : `${B.name} by ${-sim.quantiles.margin.p75}`}.`);
    notes.push(`${sim.topScores[0].a}–${sim.topScores[0].b} is the single most common final (${fmtPct(sim.topScores[0].p, 2)}); ${fmtPct(sim.overtime, 1)} of games go to overtime.`);
    const upset = Math.min(sim.winA, sim.winB);
    if (upset >= 0.2) notes.push(`${upset >= 0.4 ? "Close to a toss-up" : "A real upset chance"}: the underdog wins ${fmtPct(upset, 0)}.`);
  }

  const q = (x: { p5: number; p25: number; p50: number; p75: number; p95: number; mean: number }) => [x.p5, x.p25, x.p50, x.p75, x.p95];

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div><h2>Matchup simulator</h2><p className="sub" style={{ margin: 0 }}>Plays the game {n.toLocaleString()} times from each team's SP+ offense, defense and special teams (week {week}), using home field and the scoring spreads measured on the {base.fit.games} games already played</p></div>
        </div>
        <div className="filters" style={{ padding: 0, alignItems: "end" }} role="group" aria-label="Pick a scheduled game">
          <label className="field"><span>Week</span>
            <select className="ctl" value={week} onChange={(e) => { const w = Number(e.target.value); const games = model.projections.filter((p) => p.week === w && model.byId.has(`FBS:${p.away}`) && model.byId.has(`FBS:${p.home}`)); chooseGame(games[0], { sw: String(w), sc: null }); }}>
              {model.weeks.map((w) => <option key={w} value={w}>Week {w}{w === model.latest ? " (latest)" : ""}</option>)}
            </select>
          </label>
          <label className="field"><span>Conference</span>
            <select className="ctl" value={pickConf} onChange={(e) => { const c = e.target.value; const games = weekGames.filter((p) => !c || confAt(p.away, week) === c || confAt(p.home, week) === c); chooseGame(games[0], { sc: c || null }); }}>
              <option value="">All conferences</option>
              {confOptions.map((c) => <option key={c} value={c}>{confLabel(c)}</option>)}
            </select>
          </label>
          <label className="field"><span>Game</span>
            <select className="ctl" style={{ maxWidth: 340 }} value={gameList.find((p) => (p.away === nameOf(aId) && p.home === nameOf(bId)) || (p.away === nameOf(bId) && p.home === nameOf(aId)))?.id ?? ""} onChange={(e) => chooseGame(gameList.find((p) => p.id === e.target.value))}>
              <option value="" disabled>Custom matchup</option>
              {gameList.map((p) => <option key={p.id} value={p.id}>{p.away}{p.neutral ? " vs. " : " at "}{p.home}{gameTag(p)} · {dateLabel(p.date)}</option>)}
            </select>
          </label>
          <span className="sub" style={{ margin: "0 0 8px" }}>{gameList.length} game{gameList.length === 1 ? "" : "s"}{skipped ? ` · ${skipped} with an FCS team not simulated` : ""}</span>
        </div>
        <p className="sub" style={{ margin: "10px 0 4px" }}>Or pick any two teams:</p>
        <div className="filters" style={{ padding: 0, alignItems: "end" }}>
          <TeamPicker label="Team A" division="FBS" value={aId} exclude={bId ? [bId] : []} onPick={(id) => set({ a: id })} />
          <button type="button" className="btn" onClick={swap} aria-label="Swap teams" title="Swap teams">⇄</button>
          <TeamPicker label="Team B" division="FBS" value={bId} exclude={aId ? [aId] : []} onPick={(id) => set({ b: id })} />
          <div className="field"><span>Venue</span>
            <div className="seg" role="radiogroup" aria-label="Venue">
              {([["a", A ? `${A.name} home` : "A home"], ["n", "Neutral"], ["b", B ? `${B.name} home` : "B home"]] as const).map(([k, lab]) => <button key={k} type="button" role="radio" aria-checked={v === k} onClick={() => set({ v: k })}>{lab.length > 18 ? `${lab.slice(0, 16)}…` : lab}</button>)}
            </div>
          </div>
          <div className="field"><span>Games</span>
            <div className="seg" role="group" aria-label="Number of simulated games">
              {[2000, 10000, 50000].map((k) => <button key={k} type="button" aria-pressed={n === k} onClick={() => set({ n: k === 10000 ? null : String(k) })}>{k >= 1000 ? `${k / 1000}k` : k}</button>)}
            </div>
          </div>
          <button type="button" className="btn" onClick={() => setReroll((r) => r + 1)} title="Run again with a different random seed">↻ Re-roll</button>
        </div>
        <div className="filters" style={{ padding: "8px 0 0", alignItems: "end" }}>
          <label className="field"><span>Spread (A favored by)</span><input className="ctl" style={{ width: 130 }} inputMode="decimal" value={route.p.ln ?? ""} placeholder="e.g. 3.5 or −2" onChange={(e) => set({ ln: e.target.value.replace("−", "-") || null })} /></label>
          <label className="field"><span>Over/under</span><input className="ctl" style={{ width: 110 }} inputMode="decimal" value={route.p.ou ?? ""} placeholder="e.g. 51.5" onChange={(e) => set({ ou: e.target.value || null })} /></label>
          <label className="field"><span>Home field (pts)</span><input className="ctl" style={{ width: 100 }} inputMode="decimal" value={route.p.hfa ?? ""} placeholder={String(base.hfa)} onChange={(e) => set({ hfa: e.target.value || null })} /></label>
          {sched && <button type="button" className="btn" onClick={useSheetLine}>Use the sheet's line</button>}
          {(route.p.ln || route.p.ou || route.p.hfa) && <button type="button" className="btn ghost" onClick={() => set({ ln: null, ou: null, hfa: null })}>Reset</button>}
        </div>
        {sched && (
          <p className="sub" style={{ marginTop: 8 }}>On the schedule: <b>{sched.game}</b> · {dateLabel(sched.date)} {timeLabel(sched.time)} · week {sched.week}{sched.neutral ? " · neutral site" : ""}</p>
        )}
        {played && A && B && <p className="sub" style={{ marginTop: sched ? 0 : 8 }}>Already played {dateLabel(played.date)}: <b>{played.team} {played.pts}, {played.opp} {played.oppPts}</b> (postgame sheet row {played.row}).</p>}
      </div>

      {!A || !B || !sim ? <div className="panel"><p className="empty">{A && B && A.name === B.name ? "Pick two different teams." : "Pick two FBS teams to simulate."}</p></div> : (
        <>
          <div className="panel">
            <div className="simhead">
              {[{ t: tA, r: A, pts: sim.meanA, med: sim.quantiles.a.p50, win: sim.winA, col: C.s[0], home: v === "a" }, { t: tB, r: B, pts: sim.meanB, med: sim.quantiles.b.p50, win: sim.winB, col: C.s[1], home: v === "b" }].map((x, i) => (
                <div key={i} className="simteam" style={{ borderTopColor: x.col }}>
                  <div className="simname"><Mark team={x.t} size={36} /><div><div style={{ fontSize: 16 }}>{x.r.name}</div><div className="muted" style={{ fontSize: 12 }}>{x.home ? "Home" : v === "n" ? "Neutral" : "Away"} · SP+ {fmt(x.r.sp)} · #{x.t?.weeks[week]?.spRk ?? "—"}</div></div></div>
                  <div className="simpts num" aria-label={`${x.r.name} expected points`}>{x.pts.toFixed(1)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>expected points · median final {x.med} · wins {fmtPct(x.win, 1)}</div>
                </div>
              ))}
            </div>
            <div className="winbar" role="img" aria-label={`Win probability: ${A.name} ${fmtPct(sim.winA, 1)}, ${B.name} ${fmtPct(sim.winB, 1)}`}>
              <i style={{ width: `${sim.winA * 100}%`, background: C.s[0] }}><b>{fmtPct(sim.winA, 1)}</b></i>
              <i style={{ width: `${sim.winB * 100}%`, background: C.s[1] }}><b>{fmtPct(sim.winB, 1)}</b></i>
            </div>
            <p className="sub" style={{ marginTop: 6 }}>{sim.n.toLocaleString()} simulated games · seed {sim.seed} · expected margin {A.name} {fmtSigned(sim.expected.margin)} <Derived why="SP+ difference plus home field, the sheet's own projection formula" /> · expected total {fmt(sim.expected.total)}</p>
            <Notes items={notes} />
          </div>

          <div className="grid2" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)" } as React.CSSProperties}>
            <div className="panel">
              <h2>Final margin</h2>
              <p className="sub">How the {sim.n.toLocaleString()} games ended, {A.name} minus {B.name}</p>
              <MarginHistogram counts={sim.marginCounts} n={sim.n} aName={A.name} bName={B.name} expected={sim.expected.margin} line={lineA} ariaLabel={`Distribution of the final margin, ${A.name} minus ${B.name}`} />
            </div>
            <div className="panel">
              <h2>Final scores</h2>
              <p className="sub">Where the games landed, in 4-point cells</p>
              <ScoreGrid counts={sim.scoreCounts} n={sim.n} aName={A.name} bName={B.name} ariaLabel="Map of simulated final scores" />
            </div>
          </div>

          <div className="grid2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" } as React.CSSProperties}>
            <div className="panel">
              <h2>Range of outcomes</h2>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th /><th className="r">5th</th><th className="r">25th</th><th className="r">Median</th><th className="r">75th</th><th className="r">95th</th><th className="r">Mean</th></tr></thead>
                <tbody>
                  {([[`${A.name} points`, sim.quantiles.a], [`${B.name} points`, sim.quantiles.b], ["Total points", sim.quantiles.total], [`Margin (${A.name})`, sim.quantiles.margin]] as const).map(([l, x]) => (
                    <tr key={l}><td>{l}</td>{q(x).map((c, i) => <td key={i} className="r num">{c}</td>)}<td className="r num">{x.mean.toFixed(1)}</td></tr>
                  ))}
                </tbody>
              </table></div>
              <h3 style={{ marginTop: 12 }}>Most common finals</h3>
              <div className="tbl-wrap"><table className="tbl"><tbody>
                {sim.topScores.slice(0, 5).map((s) => <tr key={`${s.a}-${s.b}`}><td>{A.name} {s.a}, {B.name} {s.b}</td><td className="r num">{fmtPct(s.p, 2)}</td></tr>)}
              </tbody></table></div>
            </div>
            <div className="panel">
              <h2>Against a line</h2>
              {sim.cover || sim.over ? (
                <div className="tbl-wrap"><table className="tbl"><tbody>
                  {sim.cover && <>
                    <tr><td>{A.name} {sim.cover.lineA >= 0 ? "−" : "+"}{Math.abs(sim.cover.lineA)} covers</td><td className="r num">{fmtPct(sim.cover.coverA, 1)}</td></tr>
                    <tr><td>{B.name} {sim.cover.lineA >= 0 ? "+" : "−"}{Math.abs(sim.cover.lineA)} covers</td><td className="r num">{fmtPct(sim.cover.coverB, 1)}</td></tr>
                    {sim.cover.push > 0 && <tr><td>Push</td><td className="r num">{fmtPct(sim.cover.push, 1)}</td></tr>}
                  </>}
                  {sim.over && <>
                    <tr><td>Over {sim.over.line}</td><td className="r num">{fmtPct(sim.over.over, 1)}</td></tr>
                    <tr><td>Under {sim.over.line}</td><td className="r num">{fmtPct(sim.over.under, 1)}</td></tr>
                    {sim.over.push > 0 && <tr><td>Push</td><td className="r num">{fmtPct(sim.over.push, 1)}</td></tr>}
                  </>}
                </tbody></table></div>
              ) : <p className="empty" style={{ padding: "8px 0" }}>Enter a spread and/or an over/under above{sched ? ", or use the sheet's line" : ""}.</p>}
              <h3 style={{ marginTop: 12 }}>Sheet projection</h3>
              {sched && sched.projWinner ? (() => {
                const sm = sched.projMargin == null ? null : sched.projWinner === A.name ? sched.projMargin : -sched.projMargin;
                // The sheet writes the projected winner's points first.
                const [w1, w2] = (sched.projScore ?? "").split("-");
                const sheetScore = sched.projScore ? (sched.projWinner === A.name ? `${w1}–${w2}` : `${w2}–${w1}`) : "—";
                return (
                  <div className="tbl-wrap"><table className="tbl">
                    <thead><tr><th /><th className="r">Sheet</th><th className="r">Simulator</th></tr></thead>
                    <tbody>
                      <tr><td>Margin ({A.name})</td><td className="r num">{sm == null ? "—" : fmtSigned(sm)}</td><td className="r num">{fmtSigned(sim.meanMargin)}</td></tr>
                      <tr><td>Win prob. ({A.name})</td><td className="r num">{sched.winProb == null ? "—" : fmtPct(sched.projWinner === A.name ? sched.winProb : 1 - sched.winProb)}</td><td className="r num">{fmtPct(sim.winA)}</td></tr>
                      <tr><td>Score ({A.name} first)</td><td className="r num">{sheetScore}</td><td className="r num">{Math.round(sim.meanA)}–{Math.round(sim.meanB)}</td></tr>
                    </tbody>
                  </table></div>
                );
              })() : <p className="sub">This pairing is not on the sheet's schedule.</p>}
              {sched && venueFor(sched, A.name) !== v && <p className="sub">Venue differs from the scheduled game, so the sheet's numbers are for a different setup.</p>}
            </div>
          </div>

          <div className="panel">
            <h2>How the expected score is built <Derived why="Computed from the sheet's SP+ columns with the constants below" /></h2>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th /><th className="r">{A.name}</th><th className="r">{B.name}</th></tr></thead>
              <tbody>
                <tr><td>SP+ (overall, rank)</td><td className="r num">{fmt(A.sp)} <span className="muted">#{tA?.weeks[week]?.spRk}</span></td><td className="r num">{fmt(B.sp)} <span className="muted">#{tB?.weeks[week]?.spRk}</span></td></tr>
                <tr><td>Offense (points vs. an average defense)</td><td className="r num">{fmt(A.off)} <span className="muted">#{tA?.weeks[week]?.offRk}</span></td><td className="r num">{fmt(B.off)} <span className="muted">#{tB?.weeks[week]?.offRk}</span></td></tr>
                <tr><td>Defense (points allowed vs. an average offense)</td><td className="r num">{fmt(A.def)} <span className="muted">#{tA?.weeks[week]?.defRk}</span></td><td className="r num">{fmt(B.def)} <span className="muted">#{tB?.weeks[week]?.defRk}</span></td></tr>
                <tr><td>Special teams</td><td className="r num">{fmt(A.st)} <span className="muted">#{tA?.weeks[week]?.stRk}</span></td><td className="r num">{fmt(B.st)} <span className="muted">#{tB?.weeks[week]?.stRk}</span></td></tr>
              </tbody>
            </table></div>
            <ol className="steps">
              <li>Expected margin = SP+ gap ({fmtSigned(sim.expected.parts.spDiff)}) + home field ({fmtSigned(sim.expected.parts.homeField)}) = <b>{A.name} {fmtSigned(sim.expected.margin)}</b>. This is the sheet's own formula.</li>
              <li>Rating-implied total = {fmt(A.off)} + {fmt(B.def)} + {fmt(B.off)} + {fmt(A.def)} − 2 × {fmt(params.leagueAvgPts)} (league average) = {fmt(sim.expected.parts.rawTotal)}.</li>
              <li>Season fit pulls totals toward the mean: {fmt(params.totalAlpha)} + {fmt(params.totalBeta, 2)} × {fmt(sim.expected.parts.rawTotal)} = <b>{fmt(sim.expected.total)}</b>.</li>
              <li>Points: ({fmt(sim.expected.total)} ± {fmt(Math.abs(sim.expected.margin))}) ÷ 2 → <b>{A.name} {fmt(sim.expected.ptsA)}, {B.name} {fmt(sim.expected.ptsB)}</b>.</li>
              <li>Each simulated game adds the season's typical miss: margin spread {fmt(params.sigmaMargin)} points, total spread {fmt(params.sigmaTotal)} points, correlation {fmt(params.rho, 2)}. Scores are whole numbers (never 1), and overtime settles ties.</li>
            </ol>
            <p className="sub">Constants fitted to {params.fit.games} FBS-vs-FBS games already played ({params.fit.source === "fit" ? "weeks 0–" + (model.latest - 1) : "defaults: too few games"}). Home field is the sheet's own {fmt(base.hfa)} points{hfaIn != null ? `; you set ${fmt(hfaIn)}` : ""}.</p>
          </div>

          <div className="grid2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" } as React.CSSProperties}>
            {[{ t: tA, r: A }, { t: tB, r: B }].map(({ t, r }) => <SeasonCard key={r.name} team={t} idx={idx} />)}
          </div>

          {bt && (
            <div className="panel">
              <h2>How this model has done</h2>
              <p className="sub">Every FBS-vs-FBS game already played ({bt.games} games, weeks {bt.weeks[0]}–{bt.weeks[bt.weeks.length - 1]}), predicted from ratings known before kickoff, with each week scored by constants fitted on the other weeks</p>
              <div className="grid2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" } as React.CSSProperties}>
                <div className="tbl-wrap"><table className="tbl">
                  <thead><tr><th /><th className="r">Simulator</th><th className="r">Sheet</th></tr></thead>
                  <tbody>
                    <tr><td>Margin: average miss (pts)</td><td className="r num">{fmt(bt.margin.mae)}</td><td className="r num">{fmt(bt.margin.sheetMae)}</td></tr>
                    <tr><td>Total: average miss (pts)</td><td className="r num">{fmt(bt.total.maeCalibrated)}</td><td className="r num">{fmt(bt.total.maeSheet)}</td></tr>
                    <tr><td>Win probability: Brier score</td><td className="r num">{bt.winProb.brier.toFixed(3)}</td><td className="r num">{bt.winProb.sheetBrier == null ? "—" : bt.winProb.sheetBrier.toFixed(3)}</td></tr>
                    <tr><td>Picked the winner</td><td className="r num">{fmtPct(bt.winProb.accuracy, 1)}</td><td className="r num">—</td></tr>
                    <tr><td>Margin inside the 50% / 80% range</td><td className="r num">{fmtPct(bt.coverage.margin50, 0)} / {fmtPct(bt.coverage.margin80, 0)}</td><td className="r num">—</td></tr>
                    <tr><td>Total inside the 50% / 80% range</td><td className="r num">{fmtPct(bt.coverage.total50, 0)} / {fmtPct(bt.coverage.total80, 0)}</td><td className="r num">—</td></tr>
                  </tbody>
                </table></div>
                <div>
                  <Scatter height={260} points={bt.buckets.map<ScatterPoint>((b) => ({ id: String(b.lo), name: `${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}% predicted`, x: Math.round(b.predicted * 1000) / 10, y: Math.round(b.actual * 1000) / 10, color: C.s[0], tip: [["Predicted", `${(b.predicted * 100).toFixed(0)}%`], ["Home team actually won", `${(b.actual * 100).toFixed(0)}%`], ["Games", String(b.n)]] }))}
                    xTitle="Predicted home win %" yTitle="Home team won %" diagonal="perfect calibration" markSize={14} selected={null} onSelect={() => undefined} ariaLabel="Calibration of predicted win probability" />
                </div>
              </div>
              <Notes items={[
                `Same margin formula as the sheet, so the margin miss matches (${fmt(bt.margin.mae)} vs ${fmt(bt.margin.sheetMae)}). What the simulator adds is the spread of outcomes, scores, totals and line probabilities.`,
                `Home teams beat the formula by ${fmtSigned(bt.margin.bias)} points on average (±${fmt(bt.margin.biasSe)}): within noise, so home field stays at the sheet's ${fmt(bt.params.hfa)}.`,
                bt.tendency ? `Tested and left out: a team's own scoring tendency from its earlier games changed the total's error from ${fmt(bt.tendency.rmseWithout, 2)} to ${fmt(bt.tendency.rmseWith, 2)} points, no real gain.` : "",
              ].filter(Boolean)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SeasonCard({ team, idx }: { team: Team | undefined; idx: ReturnType<typeof gameIndex> }) {
  const games = team ? idx.byTeam.get(team.name) ?? [] : [];
  const pf = games.length ? games.reduce((s, g) => s + (g.pts ?? 0), 0) / games.length : null;
  const pa = games.length ? games.reduce((s, g) => s + (g.oppPts ?? 0), 0) / games.length : null;
  const tw = team?.weeks[team.latest];
  return (
    <div className="panel">
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><Mark team={team} size={22} />{team?.name ?? "Team"} season</h2>
      <p className="sub">{tw?.record ? `${tw.record.text}${tw.record.recovered ? "*" : ""} · ` : ""}{games.length ? `${fmt(pf)} scored and ${fmt(pa)} allowed per game, margin ${fmtSigned((pf ?? 0) - (pa ?? 0))} ` : "No games in the postgame sheet "}{games.length ? <Derived why="Averages of the postgame sheet's game rows" /> : null}</p>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th className="r">Postgame win exp.</th></tr></thead>
        <tbody>{games.map((g) => <tr key={g.id}><td>{dateLabel(g.date)}</td><td>{g.opp}</td><td><span className={`delta ${g.win === 1 ? "up" : "down"}`}>{g.win === 1 ? "W" : "L"} {g.pts}–{g.oppPts}</span></td><td className="r num">{fmtPct(g.pgwe)}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
