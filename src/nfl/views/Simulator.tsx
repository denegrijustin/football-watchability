import { useEffect, useMemo, useState } from "react";
import { useNfl } from "../useNfl";
import { useNflRoute } from "../store";
import { projectNfl, ratingsAt, seasonCheck, type Basis } from "../model";
import { NflMark, TeamSelect, Notes, Derived } from "../common";
import { MarginHistogram, ScoreGrid } from "../../spplus/charts/SimCharts";
import { Scatter, type ScatterPoint } from "../../spplus/charts/Scatter";
import { C } from "../../spplus/charts/kit";
import { fmt, fmtPct, fmtSigned, dateLabel, timeLabel } from "../../spplus/data/derive";
import type { NflData, NflGame } from "../types";

const nextGame = (d: NflData, a: string, b: string): NflGame | undefined => {
  const pair = d.games.filter((g) => g.type === "REG" && ((g.away === a && g.home === b) || (g.away === b && g.home === a)));
  return pair.find((g) => g.aS == null) ?? pair[pair.length - 1];
};

export default function Simulator() {
  const { data } = useNfl();
  const [route, nav] = useNflRoute();
  const [reroll, setReroll] = useState(0);
  if (!data) return null;
  const set = (p: Record<string, string | null>) => nav({ p });

  // Start from a scheduled game: the strongest pairing among the next games, or the chosen team's own next game.
  useEffect(() => {
    if (route.p.a && route.p.b) return;
    const up = data.games.filter((g) => g.type === "REG" && g.aS == null).sort((x, y) => x.date.localeCompare(y.date));
    const week = up[0]?.week;
    const slate = up.filter((g) => g.week === week);
    const pool = route.p.a ? slate.filter((g) => g.away === route.p.a || g.home === route.p.a) : slate;
    const sp = (t: string) => ratingsAt(data, t, data.ratingsThroughWeek)?.[0] ?? -99;
    const pick = [...pool].sort((x, y) => sp(y.away) + sp(y.home) - sp(x.away) - sp(x.home))[0];
    if (pick) nav({ p: { a: pick.away, b: pick.home, v: pick.neutral ? "n" : "h" } });
  }, [route.p.a, route.p.b, data, nav]);

  const away = route.p.a ?? "", home = route.p.b ?? "";
  const v = route.p.v === "n" ? "n" : "h";
  const n = Number(route.p.n) || 10000;
  // A game picked from the list stays the game (a divisional rematch later in the season is a different game).
  const picked = route.p.gid ? data.games.find((g) => g.id === route.p.gid) : undefined;
  const pickedOk = !!picked && ((picked.away === away && picked.home === home) || (picked.away === home && picked.home === away));
  const sched = pickedOk ? picked : away && home ? nextGame(data, away, home) : undefined;
  const sameOrder = sched ? sched.away === away && sched.home === home : false;
  // A scheduled game is simulated from the ratings in force before it (also after it was played); any other pairing from the week chosen below.
  const weekRatings = sched ? sched.week : route.p.rw ? Number(route.p.rw) : data.ratingsThroughWeek;
  const userBasis = (route.p.basis as Basis | undefined) ?? "market";
  const lineHome = route.p.ln != null && route.p.ln !== "" ? Number(route.p.ln) : null;
  const totalLine = route.p.ou != null && route.p.ou !== "" ? Number(route.p.ou) : null;
  const marketOk = sameOrder && sched?.spread != null && sched?.total != null && sched.aS == null;
  const proj = useMemo(() => {
    if (!away || !home || away === home) return null;
    return projectNfl(data, away, home, weekRatings, { neutral: v === "n", spread: marketOk ? sched!.spread : null, total: marketOk ? sched!.total : null, basis: userBasis, n, seed: reroll ? 5000 + reroll : undefined, lineHome: Number.isFinite(lineHome as number) ? lineHome : null, totalLine: Number.isFinite(totalLine as number) ? totalLine : null });
  }, [data, away, home, weekRatings, v, marketOk, sched, userBasis, n, reroll, lineHome, totalLine]);
  // Picking a scheduled game: a week, a conference or division (an AFC-NFC game is listed under both), then the game.
  const regular = useMemo(() => data.games.filter((g) => g.type === "REG"), [data]);
  const firstOpenWeek = regular.find((g) => g.aS == null)?.week ?? data.lastPlayedWeek;
  const pickWeek = route.p.sw ? Number(route.p.sw) : sched?.week ?? firstOpenWeek;
  const groups = useMemo(() => ["AFC", "NFC", ...[...new Set(Object.values(data.teams).map((t) => t.div))].sort()], [data]);
  const inGroup = (abbr: string, grp: string) => !grp || data.teams[abbr]?.conf === grp || data.teams[abbr]?.div === grp;
  const gamesFor = (w: number, grp: string) => regular.filter((g) => g.week === w && (inGroup(g.away, grp) || inGroup(g.home, grp))).sort((x, y) => x.date.localeCompare(y.date) || (x.time ?? "").localeCompare(y.time ?? ""));
  const pickGroup = route.p.sc ?? "";
  const gameList = useMemo(() => gamesFor(pickWeek, pickGroup), [regular, pickWeek, pickGroup]);
  const chooseGame = (g: NflGame | undefined, extra: Record<string, string | null> = {}) => {
    if (!g) { set(extra); return; }
    set({ ...extra, a: g.away, b: g.home, v: g.neutral ? "n" : "h", gid: g.id, basis: null, ln: null, ou: null });
  };
  const gameLabel = (g: NflGame) => {
    const ca = data.teams[g.away]?.conf, ch = data.teams[g.home]?.conf;
    const tag = ca && ch && ca !== ch ? ` (${ca} / ${ch})` : "";
    return `${g.away} ${g.neutral ? "vs." : "@"} ${g.home}${tag} · ${dateLabel(g.date)}${g.aS != null ? ` · final ${g.aS}–${g.hS}` : ""}`;
  };

  const check = useMemo(() => seasonCheck(data), [data]);
  const bt = data.backtest.calibration;
  const [aT, hT] = [data.teams[away], data.teams[home]];
  const sim = proj?.sim;

  const seasonGames = (abbr: string) => data.games.filter((g) => g.type === "REG" && g.aS != null && (g.away === abbr || g.home === abbr));
  const useLine = () => { if (sched && sameOrder) set({ ln: sched.spread == null ? null : String(sched.spread), ou: sched.total == null ? null : String(sched.total) }); };

  const notes: string[] = [];
  if (sim && proj) {
    const fav = sim.winA >= 0.5 ? aT.name : hT.name;
    notes.push(`${fav} wins ${fmtPct(Math.max(sim.winA, sim.winB), 1)} of ${sim.n.toLocaleString()} simulated games. Likely final ${Math.round(sim.meanA)}–${Math.round(sim.meanB)} (${away}–${home}).`);
    notes.push(proj.basis === "market" ? `Centered on the closing line (${home} ${fmtSigned(-(sched?.spread ?? 0))}, total ${sched?.total}). In the backtest the line beat the ratings, so it leads and the ratings are shown for comparison.` : `Centered on the ratings alone: ${sched && sameOrder && sched.aS == null ? "no closing line yet for this game" : "this pairing is not on the schedule with a posted line"}.`);
    if (proj.basis === "market") notes.push(`The ratings alone say ${home} ${fmtSigned(proj.ratingsMarginHome)} and a total of ${fmt(proj.ratingsTotal)}.`);
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead"><div><h2>NFL matchup simulator</h2><p className="sub" style={{ margin: 0 }}>Plays the game {n.toLocaleString()} times. Expected score comes from the closing line when there is one, otherwise from the team ratings (before week {weekRatings}); the spread of results was measured on {bt.games} games from {data.params.trainedOn.join(", ")}</p></div></div>
        <div className="filters" style={{ padding: 0, alignItems: "end" }} role="group" aria-label="Pick a scheduled game">
          <label className="field"><span>Week</span>
            <select className="ctl" value={pickWeek} onChange={(e) => { const w = Number(e.target.value); chooseGame(gamesFor(w, pickGroup)[0], { sw: String(w) }); }}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>Week {w}{w === firstOpenWeek ? " (next)" : ""}</option>)}
            </select>
          </label>
          <label className="field"><span>Conference</span>
            <select className="ctl" value={pickGroup} onChange={(e) => { const grp = e.target.value; chooseGame(gamesFor(pickWeek, grp)[0], { sc: grp || null, sw: String(pickWeek) }); }}>
              <option value="">Both conferences</option>
              {groups.map((grp) => <option key={grp} value={grp}>{grp}</option>)}
            </select>
          </label>
          <label className="field"><span>Game</span>
            <select className="ctl" style={{ maxWidth: 360 }} value={(pickedOk && gameList.some((g) => g.id === picked!.id) ? picked!.id : gameList.find((g) => g.away === away && g.home === home)?.id) ?? ""} onChange={(e) => chooseGame(gameList.find((g) => g.id === e.target.value))}>
              <option value="" disabled>Custom matchup</option>
              {gameList.map((g) => <option key={g.id} value={g.id}>{gameLabel(g)}</option>)}
            </select>
          </label>
          <span className="sub" style={{ margin: "0 0 8px" }}>{gameList.length} game{gameList.length === 1 ? "" : "s"}</span>
        </div>
        <p className="sub" style={{ margin: "10px 0 4px" }}>Or pick any two teams{sched ? "" : ", with the ratings as of a week"}:</p>
        <div className="filters" style={{ padding: 0, alignItems: "end" }}>
          <TeamSelect label="Away team" value={away} exclude={home ? [home] : []} onPick={(a) => set({ a })} />
          <button type="button" className="btn" aria-label="Swap teams" title="Swap teams" onClick={() => set({ a: home, b: away })}>⇄</button>
          <TeamSelect label="Home team" value={home} exclude={away ? [away] : []} onPick={(b) => set({ b })} />
          {!sched && (
            <label className="field"><span>Ratings as of</span>
              <select className="ctl" value={weekRatings} onChange={(e) => set({ rw: e.target.value })}>
                {Array.from({ length: data.ratingsThroughWeek }, (_, i) => i + 1).map((w) => <option key={w} value={w}>Before week {w}{w === data.ratingsThroughWeek ? " (latest)" : ""}</option>)}
              </select>
            </label>
          )}
          <div className="field"><span>Venue</span>
            <div className="seg" role="radiogroup" aria-label="Venue">
              <button type="button" role="radio" aria-checked={v === "h"} onClick={() => set({ v: "h" })}>{hT ? `${hT.name.split(" ").pop()} host` : "Home"}</button>
              <button type="button" role="radio" aria-checked={v === "n"} onClick={() => set({ v: "n" })}>Neutral</button>
            </div>
          </div>
          <div className="field"><span>Based on</span>
            <div className="seg" role="radiogroup" aria-label="Expected score based on">
              <button type="button" role="radio" aria-checked={proj?.basis === "market"} disabled={!marketOk} title={marketOk ? "" : "No closing line for this game"} onClick={() => set({ basis: null })}>Closing line</button>
              <button type="button" role="radio" aria-checked={proj?.basis === "ratings"} onClick={() => set({ basis: "ratings" })}>Ratings only</button>
            </div>
          </div>
          <div className="field"><span>Games</span>
            <div className="seg" role="group" aria-label="Number of simulated games">
              {[2000, 10000, 50000].map((k) => <button key={k} type="button" aria-pressed={n === k} onClick={() => set({ n: k === 10000 ? null : String(k) })}>{k / 1000}k</button>)}
            </div>
          </div>
          <button type="button" className="btn" onClick={() => setReroll((r) => r + 1)}>↻ Re-roll</button>
        </div>
        <div className="filters" style={{ padding: "8px 0 0", alignItems: "end" }}>
          <label className="field"><span>Spread (home favored by)</span><input className="ctl" style={{ width: 150 }} inputMode="decimal" value={route.p.ln ?? ""} placeholder="e.g. 3 or −2.5" onChange={(e) => set({ ln: e.target.value.replace("−", "-") || null })} /></label>
          <label className="field"><span>Over/under</span><input className="ctl" style={{ width: 110 }} inputMode="decimal" value={route.p.ou ?? ""} placeholder="e.g. 44.5" onChange={(e) => set({ ou: e.target.value || null })} /></label>
          {sched && sameOrder && sched.spread != null && <button type="button" className="btn" onClick={useLine}>Use the closing line</button>}
          {(route.p.ln || route.p.ou) && <button type="button" className="btn ghost" onClick={() => set({ ln: null, ou: null })}>Reset</button>}
        </div>
        {sched && <p className="sub" style={{ marginTop: 8 }}>{sched.aS == null ? "On the schedule" : "Played"}: <b>{sched.away} @ {sched.home}</b> · week {sched.week} · {dateLabel(sched.date)} {timeLabel(sched.time)}{sched.aS != null ? ` · final ${sched.away} ${sched.aS}, ${sched.home} ${sched.hS}` : ""}{sched.spread != null ? ` · line ${sched.home} ${fmtSigned(-sched.spread)}, total ${sched.total}` : ""}{!sameOrder ? " (home and away are reversed here)" : ""}</p>}
      </div>

      {!proj || !sim ? <div className="panel"><p className="empty">Pick two different teams.</p></div> : (
        <>
          <div className="panel">
            <div className="simhead">
              {[{ ab: away, t: aT, pts: sim.meanA, med: sim.quantiles.a.p50, win: sim.winA, col: C.s[0], role: "Away" }, { ab: home, t: hT, pts: sim.meanB, med: sim.quantiles.b.p50, win: sim.winB, col: C.s[1], role: v === "n" ? "Neutral" : "Home" }].map((x) => (
                <div key={x.ab} className="simteam" style={{ borderTopColor: x.col }}>
                  <div className="simname"><NflMark abbr={x.ab} size={36} /><div><div style={{ fontSize: 16 }}>{x.t.name}</div><div className="muted" style={{ fontSize: 12 }}>{x.role} · rating {fmtSigned(ratingsAt(data, x.ab, weekRatings)?.[0] ?? 0)}</div></div></div>
                  <div className="simpts num" aria-label={`${x.t.name} expected points`}>{x.pts.toFixed(1)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>expected points · median final {x.med} · wins {fmtPct(x.win, 1)}</div>
                </div>
              ))}
            </div>
            <div className="winbar" role="img" aria-label={`Win probability: ${aT.name} ${fmtPct(sim.winA, 1)}, ${hT.name} ${fmtPct(sim.winB, 1)}`}>
              <i style={{ width: `${sim.winA * 100}%`, background: C.s[0] }}><b>{fmtPct(sim.winA, 1)}</b></i>
              <i style={{ width: `${sim.winB * 100}%`, background: C.s[1] }}><b>{fmtPct(sim.winB, 1)}</b></i>
            </div>
            <p className="sub" style={{ marginTop: 6 }}>{sim.n.toLocaleString()} simulated games · basis: <b>{proj.basis === "market" ? "closing line" : "team ratings"}</b> · expected margin {home} {fmtSigned(proj.marginHome)} · expected total {fmt(proj.total)}</p>
            <Notes items={notes} />
          </div>

          <div className="grid2" style={{ ["--cols" as string]: "minmax(0,1.3fr) minmax(0,1fr)" } as React.CSSProperties}>
            <div className="panel"><h2>Final margin</h2><p className="sub">{aT.name} minus {hT.name}</p>
              <MarginHistogram counts={sim.marginCounts} n={sim.n} aName={aT.name.split(" ").pop()!} bName={hT.name.split(" ").pop()!} expected={proj.expectation.margin} line={lineHome == null ? null : -lineHome} ariaLabel={`Distribution of the final margin, ${aT.name} minus ${hT.name}`} /></div>
            <div className="panel"><h2>Final scores</h2><p className="sub">Where the games landed, in 4-point cells</p>
              <ScoreGrid counts={sim.scoreCounts} n={sim.n} aName={aT.name.split(" ").pop()!} bName={hT.name.split(" ").pop()!} ariaLabel="Map of simulated final scores" /></div>
          </div>

          <div className="grid2" style={{ ["--cols" as string]: "minmax(0,1fr) minmax(0,1fr)" } as React.CSSProperties}>
            <div className="panel">
              <h2>Range of outcomes</h2>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th /><th className="r">5th</th><th className="r">25th</th><th className="r">Median</th><th className="r">75th</th><th className="r">95th</th><th className="r">Mean</th></tr></thead>
                <tbody>
                  {([[`${aT.name.split(" ").pop()} points`, sim.quantiles.a], [`${hT.name.split(" ").pop()} points`, sim.quantiles.b], ["Total points", sim.quantiles.total], [`Margin (${aT.name.split(" ").pop()})`, sim.quantiles.margin]] as const).map(([l, x]) => (
                    <tr key={l}><td>{l}</td>{[x.p5, x.p25, x.p50, x.p75, x.p95].map((c, i) => <td key={i} className="r num">{c}</td>)}<td className="r num">{x.mean.toFixed(1)}</td></tr>
                  ))}
                </tbody>
              </table></div>
              <h3 style={{ marginTop: 12 }}>Most common finals</h3>
              <div className="tbl-wrap"><table className="tbl"><tbody>{sim.topScores.slice(0, 5).map((s) => <tr key={`${s.a}-${s.b}`}><td>{aT.name.split(" ").pop()} {s.a}, {hT.name.split(" ").pop()} {s.b}</td><td className="r num">{fmtPct(s.p, 2)}</td></tr>)}</tbody></table></div>
            </div>
            <div className="panel">
              <h2>Against a line</h2>
              {sim.cover || sim.over ? (
                <div className="tbl-wrap"><table className="tbl"><tbody>
                  {sim.cover && <><tr><td>{hT.name.split(" ").pop()} {lineHome! >= 0 ? "−" : "+"}{Math.abs(lineHome!)} covers</td><td className="r num">{fmtPct(sim.cover.coverB, 1)}</td></tr><tr><td>{aT.name.split(" ").pop()} {lineHome! >= 0 ? "+" : "−"}{Math.abs(lineHome!)} covers</td><td className="r num">{fmtPct(sim.cover.coverA, 1)}</td></tr>{sim.cover.push > 0 && <tr><td>Push</td><td className="r num">{fmtPct(sim.cover.push, 1)}</td></tr>}</>}
                  {sim.over && <><tr><td>Over {sim.over.line}</td><td className="r num">{fmtPct(sim.over.over, 1)}</td></tr><tr><td>Under {sim.over.line}</td><td className="r num">{fmtPct(sim.over.under, 1)}</td></tr>{sim.over.push > 0 && <tr><td>Push</td><td className="r num">{fmtPct(sim.over.push, 1)}</td></tr>}</>}
                </tbody></table></div>
              ) : <p className="empty" style={{ padding: "8px 0" }}>Enter a spread and/or an over/under above{sched && sameOrder && sched.spread != null ? ", or use the closing line" : ""}.</p>}
              {sched && (sched.aS != null || sched.spread != null) && (
                <>
                  <h3 style={{ marginTop: 12 }}>Closing line</h3>
                  <div className="tbl-wrap"><table className="tbl"><tbody>
                    <tr><td>Spread ({sched.home})</td><td className="r num">{sched.spread == null ? "—" : fmtSigned(-sched.spread)}</td></tr>
                    <tr><td>Total</td><td className="r num">{sched.total ?? "—"}</td></tr>
                    <tr><td>Moneyline ({sched.away} / {sched.home})</td><td className="r num">{sched.aML ?? "—"} / {sched.hML ?? "—"}</td></tr>
                  </tbody></table></div>
                </>
              )}
            </div>
          </div>

          <div className="panel">
            <h2>How the expected score is built <Derived why="From nflverse play-by-play and the schedule's closing line" /></h2>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th /><th className="r">{aT.name}</th><th className="r">{hT.name}</th></tr></thead>
              <tbody>
                {(["Rating", "Offense (points vs. an average defense)", "Defense (points allowed vs. an average offense)", "Special teams"] as const).map((l, i) => (
                  <tr key={l}><td>{l}</td><td className="r num">{fmt(proj.awayR[i])}</td><td className="r num">{fmt(proj.homeR[i])}</td></tr>
                ))}
              </tbody>
            </table></div>
            <ol className="steps">
              <li>Ratings margin = {data.params.model.c0 > 0 && v === "h" ? `${fmt(data.params.model.c0, 1)} home field + ` : ""}{fmt(data.params.model.c1, 2)} × rating gap ({fmtSigned(proj.homeR[0] - proj.awayR[0])}) = <b>{hT.name.split(" ").pop()} {fmtSigned(proj.ratingsMarginHome)}</b>.</li>
              <li>Ratings total = {fmt(data.params.total.a0)} + {fmt(data.params.total.a1, 2)} × (offenses and defenses vs. the {fmt(data.params.scale.P)}-point average) = <b>{fmt(proj.ratingsTotal)}</b>.</li>
              <li>{proj.basis === "market" ? <>Expected margin and total are the closing line's: <b>{hT.name.split(" ").pop()} {fmtSigned(proj.marginHome)}, total {fmt(proj.total)}</b>. The line beat the ratings in the backtest, and mixing them in did not help.</> : <>No closing line, so the ratings' numbers are used: <b>{hT.name.split(" ").pop()} {fmtSigned(proj.marginHome)}, total {fmt(proj.total)}</b>.</>}</li>
              <li>Points: ({fmt(proj.total)} ± {fmt(Math.abs(proj.marginHome))}) ÷ 2 → <b>{aT.name.split(" ").pop()} {fmt(proj.expectation.ptsA)}, {hT.name.split(" ").pop()} {fmt(proj.expectation.ptsB)}</b>.</li>
              <li>Each simulated game adds the typical miss: margin spread {fmt(proj.params.sigmaMargin)} points, total spread {fmt(proj.params.sigmaTotal)} points, correlation {fmt(proj.params.rho, 2)}. Scores are whole numbers (never 1); overtime settles ties.</li>
            </ol>
          </div>

          <div className="grid2" style={{ ["--cols" as string]: "minmax(0,1fr) minmax(0,1fr)" } as React.CSSProperties}>
            {[away, home].map((ab) => (
              <div className="panel" key={ab}>
                <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><NflMark abbr={ab} />{data.teams[ab].name} season</h2>
                <div className="tbl-wrap"><table className="tbl">
                  <thead><tr><th>Wk</th><th>Opponent</th><th>Result</th></tr></thead>
                  <tbody>{seasonGames(ab).map((g) => { const mine = g.home === ab ? g.hS! : g.aS!, theirs = g.home === ab ? g.aS! : g.hS!; return <tr key={g.id}><td>{g.week}</td><td>{g.home === ab ? "vs" : "at"} {data.teams[g.home === ab ? g.away : g.home].name}</td><td><span className={`delta ${mine > theirs ? "up" : mine < theirs ? "down" : "flat"}`}>{mine > theirs ? "W" : mine < theirs ? "L" : "T"} {mine}–{theirs}</span></td></tr>; })}</tbody>
                </table></div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2>How this model has done</h2>
            <p className="sub">Out of sample. The constants were fitted on {data.params.trainedOn.join(", ")} (each season scored with the other two), then checked on this season's {check.games} games.</p>
            <div className="grid2" style={{ ["--cols" as string]: "minmax(0,1fr) minmax(0,1fr)" } as React.CSSProperties}>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th /><th className="r">Ratings</th><th className="r">Closing line</th></tr></thead>
                <tbody>
                  <tr><td>Margin: average miss ({data.params.trainedOn[0]}–{data.params.trainedOn[data.params.trainedOn.length - 1]})</td><td className="r num">{fmt(bt.leaveOneSeasonOut.margin.model, 2)}</td><td className="r num">{fmt(bt.leaveOneSeasonOut.margin.market, 2)}</td></tr>
                  <tr><td>Total: average miss ({data.params.trainedOn[0]}–{data.params.trainedOn[data.params.trainedOn.length - 1]})</td><td className="r num">{fmt(bt.leaveOneSeasonOut.total.model, 2)}</td><td className="r num">{fmt(bt.leaveOneSeasonOut.total.market, 2)}</td></tr>
                  <tr><td>Win probability: Brier score</td><td className="r num">{bt.leaveOneSeasonOut.margin.brierModel.toFixed(3)}</td><td className="r num">{bt.leaveOneSeasonOut.margin.brierMarket.toFixed(3)}</td></tr>
                  <tr><td>{data.season} margin: average miss ({check.games} games)</td><td className="r num">{fmt(check.marginModel, 2)}</td><td className="r num">{fmt(check.marginMarket, 2)}</td></tr>
                  <tr><td>{data.season} total: average miss ({check.withLine} with a line)</td><td className="r num">{fmt(check.totalModel, 2)}</td><td className="r num">{fmt(check.totalMarket, 2)}</td></tr>
                </tbody>
              </table></div>
              <Scatter height={240} markSize={14} points={bt.leaveOneSeasonOut.bySeason.map<ScatterPoint>((s) => ({ id: String(s.season), name: String(s.season), x: Math.round(s.margin.market * 100) / 100, y: Math.round(s.margin.model * 100) / 100, color: C.s[0], tip: [["Closing line miss", fmt(s.margin.market, 2)], ["Ratings miss", fmt(s.margin.model, 2)], ["Games", String(s.games)]] }))}
                xTitle="Closing line: average margin miss" yTitle="Ratings: average margin miss" diagonal="equal" selected={null} onSelect={() => undefined} ariaLabel="Ratings versus closing line, average margin miss by season" />
            </div>
            <Notes items={[
              `The closing line is the better predictor: it misses by ${fmt(bt.leaveOneSeasonOut.margin.market, 2)} points, the ratings by ${fmt(bt.leaveOneSeasonOut.margin.model, 2)}. Blending the two (${fmt(bt.leaveOneSeasonOut.margin.blend, 2)}) did not beat the line alone, so games with a line are centered on it.`,
              `What the simulator adds is the spread of outcomes, scores and totals, and a ratings-based number for games with no line yet.`,
            ]} />
          </div>
        </>
      )}
    </div>
  );
}
