import { useMemo } from "react";
import { usePerf } from "../data";
import { fieldLabel, fieldPosition, isTurnoverDrive, drivesOf, leagueSummaries } from "../engine";
import { fmt, InfoTip, PerfFrame, Unavailable, useTeamColors } from "../ui";
import { DRIVE } from "../../../scripts/perf/lib.mjs";
import { clockAtStart, driveSlot, kindOf, poss, quarterLabel, resultShort, resultText, spot, howText } from "../drivesCalc";
import { BUCKETS } from "../finishingCalc";
import {
  FIELD_BANDS, afterTakeawayLine, bandDrives, expectedFromField, fieldData, fieldSlot, fieldTakeaway, fumbleStats, fumblesSupported, mix, parseFieldSlot, turnoversByGame, type BandDrive,
} from "../fieldCalc";
import { FieldHistogram } from "../charts/fieldHistogram";
import { TurnoverChart } from "../charts/fieldTurnovers";
import { ResultGlyph } from "../charts/drivesGlyph";
import { openDrivesTab } from "../charts/finishingNav";
import type { DriveTuple, PerfRow } from "../types";

const per = (n: number, g: number) => (g ? n / g : null);
const signed = (n: number | null, d = 1) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`);

export default function FieldPosition() {
  const { data, sel, set, adapter, league } = usePerf();
  const { a } = useTeamColors();
  const team = sel.team;
  const name = team ? adapter.short(team) : "";

  const fd = useMemo(() => (data ? fieldData(data, sel, adapter.short) : null), [data, sel, adapter]);
  const tg = useMemo(() => (fd ? turnoversByGame(fd.rows, sel.garbage) : []), [fd, sel.garbage]);
  const leagueRows = useMemo(() => (data ? [...leagueSummaries(data, sel).values()].flatMap((s) => s.games) : []), [data, sel]);
  const fum = useMemo(() => (data && fd ? fumbleStats(data, fd.rows, leagueRows) : null), [data, fd, leagueRows]);

  if (!data || !team || !fd) return <PerfFrame title="Field Position & Turnovers" question="How much are short fields and turnovers affecting results?" show={{}}>{null}</PerfFrame>;

  const { fp, bench, league: lg } = fd;
  const games = fd.rows.length;
  const band = parseFieldSlot(sel.metric);
  const gameRow: PerfRow | undefined = fd.rows.find((r) => r.g === sel.game);
  const take = fieldTakeaway({ name, benchName: bench?.name ?? null, fp, bench: bench?.fp ?? null, games });
  const expected = expectedFromField(fp.afterTakeaway, lg);
  const after = afterTakeawayLine(name, fp, expected);
  const maxShare = Math.max(0.01, ...fp.bands.map((b) => b.share ?? 0), ...(bench?.fp.bands.map((b) => b.share ?? 0) ?? []));

  const shortFieldPpd = (f: typeof fp) => { const b = f.bands.slice(3); const n = b.reduce((s, x) => s + x.drives, 0); return n ? b.reduce((s, x) => s + (x.pointsPerDrive ?? 0) * x.drives, 0) / n : null; };

  const goField = (row: PerfRow, idx: number) => { set({ game: row.g, metric: driveSlot(row.g, `${row.t}:${idx}`) }); openDrivesTab(league); };
  const bandList: BandDrive[] = band != null ? bandDrives(fd.rows, sel.garbage, band) : [];

  const DriveTable = ({ list, label }: { list: { row: PerfRow; idx: number; tuple: DriveTuple }[]; label: string }) => (
    <div className="tbl-wrap">
      <table className="tbl fn-tbl" aria-label={label}>
        <thead><tr><th>Game</th><th>Qtr</th><th>Started</th><th className="r">Plays</th><th>Result</th><th className="r">Pts</th><th /></tr></thead>
        <tbody>
          {list.map(({ row, idx, tuple }) => {
            const clock = clockAtStart(tuple);
            return (
              <tr key={`${row.g}-${idx}`}>
                <td>Wk {row.w} {row.h === 0 ? "at" : "vs"} {adapter.short(row.o)}</td>
                <td>{quarterLabel(tuple[DRIVE.PERIOD])}{clock ? ` ${clock}` : ""}</td>
                <td>{spot(tuple[DRIVE.START_YL], name, adapter.short(row.o))}</td>
                <td className="r">{tuple[DRIVE.PLAYS]}</td>
                <td><span className="fn-res" title={resultText(tuple)}><ResultGlyph kind={kindOf(tuple[DRIVE.RESULT])} size={13} /> {resultShort(tuple)}</span></td>
                <td className="r">{tuple[DRIVE.PTS]}</td>
                <td className="r"><button type="button" className="btn small" aria-label={`See Week ${row.w} drive on the field`} onClick={() => goField(row, idx)}>See it on the field</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const gp = tg.find((g) => g.row.g === gameRow?.g);
  const gameGives = gameRow ? drivesOf([gameRow], sel.garbage).filter(isTurnoverDrive) : [];
  const gameTakes = gameRow ? fieldPosition([gameRow], sel.garbage).afterTakeaway : [];
  const withIdx = (row: PerfRow, ds: DriveTuple[]) => ds.map((tuple) => ({ row, idx: row.d.indexOf(tuple), tuple }));

  const benchGames = bench?.games ?? 0;
  const turnCards = [
    { id: "gives", label: "Giveaways per game", tip: "Interceptions and lost fumbles that ended a drive. Fewer is better.", v: per(fp.giveaways, games), b: bench ? per(bench.fp.giveaways, benchGames) : null, better: "low" as const },
    { id: "takes", label: "Takeaways per game", tip: "Drives that began with an interception or fumble recovery. More is better.", v: per(fp.takeaways, games), b: bench ? per(bench.fp.takeaways, benchGames) : null, better: "high" as const },
    { id: "margin", label: "Margin per game", tip: "Takeaways minus giveaways. Positive means the team won the turnover battle.", v: per(fp.takeaways - fp.giveaways, games), b: bench ? per(bench.fp.takeaways - bench.fp.giveaways, benchGames) : null, better: "high" as const },
  ];

  return (
    <PerfFrame
      title="Field Position & Turnovers" question="How much are short fields and turnovers affecting results?"
      show={{ opp: true, bench: true, window: true, garbage: true }}
      takeaway={take.text} takeSmall={take.small ?? "Click a band or a bar to see the drives behind it."}
      defs={["drive", "afterTurnover", "garbage"]}
    >
      {/* ---------------- Where drives start ---------------- */}
      <section className="panel fl-panel" aria-label="Where drives start">
        <h2>Where {poss(name)} drives start</h2>
        <p className="sub">Yards from the opponent's goal line when the drive began. Starts at the opponent's 40 or closer are "short fields".</p>
        <div className="dv-cards fl-cards" role="list">
          <div role="listitem" className="dv-card"><span className="lab">Short-field starts<InfoTip label="short-field starts">Drives that began at the opponent's 40-yard line or closer.</InfoTip></span><b>{fmt.pct(fp.favorableShare, 0)}</b><small>{bench ? `${bench.name}: ${fmt.pct(bench.fp.favorableShare, 0)}` : " "}</small></div>
          <div role="listitem" className="dv-card"><span className="lab">Average start</span><b>{fieldLabel(fp.avgStartYl).toLowerCase()}</b><small>{bench ? `${bench.name}: ${fieldLabel(bench.fp.avgStartYl).toLowerCase()}` : " "}</small></div>
          <div role="listitem" className="dv-card"><span className="lab">Points per drive from short fields<InfoTip label="points from short fields">Offensive points per drive on drives that started at the opponent's 40 or closer.</InfoTip></span><b>{fmt.n(shortFieldPpd(fp), 2)}</b><small>league: {fmt.n(shortFieldPpd(lg), 2)}</small></div>
        </div>
        <FieldHistogram hist={fd.hist} bench={bench?.hist ?? null} benchName={bench?.name ?? null} color={a} band={band} onBand={(b) => set({ metric: b == null ? null : fieldSlot(b) })} teamName={name} />

        <div className="fl-bands" role="list" aria-label="Field-position bands">
          <div className="fl-bhead" aria-hidden="true"><span>Where the drive started</span><span>Share of {poss(name)} drives</span><span className="r">Points per drive</span></div>
          {fp.bands.map((b, i) => {
            const on = band === i, bb = bench?.fp.bands[i];
            const lgp = lg.bands[i].pointsPerDrive;
            return (
              <div role="listitem" key={b.label} className={`fl-brow${on ? " on" : ""}`}>
                <button type="button" className="fl-bbtn" aria-pressed={on} aria-controls={on ? "fl-banddetail" : undefined} onClick={() => set({ metric: on ? null : fieldSlot(i) })}>
                  <span className="fl-blab"><b>{b.label}</b><small>{b.note}</small></span>
                  <span className="fl-bshare">
                    <span className="fl-btrack"><i className="fl-bfill" style={{ width: `${((b.share ?? 0) / maxShare) * 100}%`, background: a }} />{bb?.share != null && <i className="fl-btick" style={{ left: `${(bb.share / maxShare) * 100}%` }} title={`${bench?.name}: ${fmt.pct(bb.share, 0)}`} />}</span>
                    <small>{b.drives} drive{b.drives === 1 ? "" : "s"} · {fmt.pct(b.share, 0)}{bb?.share != null && bench ? ` (${bench.name}: ${fmt.pct(bb.share, 0)})` : ""}</small>
                  </span>
                  <span className="fl-bppd"><b>{b.drives ? fmt.n(b.pointsPerDrive, 2) : "—"}</b><small>league {fmt.n(lgp, 2)}{b.drives && b.pointsPerDrive != null && lgp != null && b.drives >= 5 ? ` · ${b.pointsPerDrive - lgp >= 0.3 ? "above" : b.pointsPerDrive - lgp <= -0.3 ? "below" : "near"}` : b.drives < 5 && b.drives > 0 ? " · small sample" : ""}</small></span>
                </button>
              </div>
            );
          })}
        </div>
        <p className="sub">The tick on each bar is {bench ? bench.name : "the benchmark"}{bench ? "" : " (turned off)"}. Compare the points per drive with the league figure for the same spot: that shows how well {name} uses the field it gets, not just how often it gets good fields.</p>

        {band != null && (
          <div className="fn-behind" id="fl-banddetail" role="region" aria-label={`Drives that started ${FIELD_BANDS[band].label}`}>
            <h3>Drives that started {FIELD_BANDS[band].label.toLowerCase()} <span className="sub">{bandList.length} drive{bandList.length === 1 ? "" : "s"} · {fmt.n(fp.bands[band].pointsPerDrive, 2)} points per drive (league {fmt.n(lg.bands[band].pointsPerDrive, 2)})</span><button type="button" className="btn small ghost" onClick={() => set({ metric: null })}>Close</button></h3>
            {bandList.length === 0 ? <p className="empty">No drives started here in these games.</p> : (
              <>
                {(() => {
                  const m = mix(bandList.map((x) => x.tuple)), n = bandList.length, lm = mix(lg.bands[band].drives ? drivesOf(leagueRows, sel.garbage).filter((d) => d[DRIVE.START_YL] >= FIELD_BANDS[band].min && d[DRIVE.START_YL] <= FIELD_BANDS[band].max) : []);
                  const ln = Object.values(lm).reduce((s, v) => s + v, 0);
                  return (
                    <div className="fl-mixes">
                      {([[name, m, n], ["League", lm, ln]] as const).map(([l, mm, nn]) => (
                        <div key={l} className="fl-mix"><span className="fl-mixl">{l}</span>
                          <span className="fl-mixbar" role="img" aria-label={`${l}: ${BUCKETS.map((b) => `${b.label.toLowerCase()} ${nn ? Math.round((mm[b.k] / nn) * 100) : 0}%`).join(", ")}`}>
                            {BUCKETS.map((b) => mm[b.k] > 0 && <span key={b.k} className={`fl-mixseg fn-${b.k === "turnover" ? "to" : b.k === "empty" ? "em" : b.k}`} style={{ flexGrow: mm[b.k] }}>{mm[b.k] / nn >= 0.14 ? `${b.short} ${Math.round((mm[b.k] / nn) * 100)}%` : ""}</span>)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <DriveTable list={bandList} label="Drives in this band" />
              </>
            )}
          </div>
        )}
      </section>

      {/* ---------------- Turnovers ---------------- */}
      <section className="panel fl-panel" aria-label="Turnovers by game">
        <h2>Turnovers by game</h2>
        <p className="sub">A giveaway is an interception or lost fumble that ended one of {poss(name)} drives. A takeaway is a drive that began with the other team's interception or fumble.</p>
        <div className="dv-cards fl-cards" role="list">
          {turnCards.map((c) => {
            const d = c.v != null && c.b != null ? c.v - c.b : null;
            const good = d == null ? null : Math.abs(d) < 0.15 ? "similar" : (c.better === "high" ? d > 0 : d < 0) ? "better" : "worse";
            return (
              <div role="listitem" className="dv-card" key={c.id}>
                <span className="lab">{c.label}<InfoTip label={c.label}>{c.tip}</InfoTip></span>
                <b>{c.id === "margin" ? signed(c.v, 2) : fmt.n(c.v, 2)}</b>
                <small>{bench && c.b != null ? `${bench.name}: ${c.id === "margin" ? signed(c.b, 2) : fmt.n(c.b, 2)}` : " "}</small>
                {good && <em className={`v-${good}`}>{good === "better" ? "✓ better" : good === "worse" ? "✕ worse" : "≈ about the same"}</em>}
              </div>
            );
          })}
        </div>
        {games === 0 ? <div className="empty">No games to chart.</div> : (
          <TurnoverChart games={tg} selected={gameRow?.g ?? null} onSelect={(g) => set({ game: g, metric: sel.metric?.startsWith("drv:") ? null : sel.metric })} abbr={(id) => data.teams[id]?.abbr ?? adapter.short(id)} teamName={name} />
        )}
        <div className="legend fl-tl"><span><i style={{ background: "var(--rs-td)" }} />Takeaway (above the line)</span><span><i className="fl-hatchsw" />Giveaway (below the line, hatched)</span></div>
        {gameRow && gp && (
          <div className="fn-behind" role="region" aria-label="Turnovers in the selected game">
            <h3>Week {gameRow.w} {gameRow.h === 0 ? "at" : "vs"} {adapter.short(gameRow.o)} <span className="sub">{gp.takes} takeaway{gp.takes === 1 ? "" : "s"} · {gp.gives} giveaway{gp.gives === 1 ? "" : "s"} · margin {signed(gp.margin, 0)}</span><button type="button" className="btn small ghost" onClick={() => set({ game: null })}>Close</button></h3>
            {gp.takes + gp.gives === 0 ? <p className="sub">No turnovers by either team in this game, as counted here.</p> : (
              <>
                {gameGives.length > 0 && <><h4 className="fl-sub">Giveaways: drives that ended in a turnover</h4><DriveTable list={withIdx(gameRow, gameGives)} label="Giveaway drives" /></>}
                {gameTakes.length > 0 && <><h4 className="fl-sub">Takeaways: drives that began after one</h4><DriveTable list={withIdx(gameRow, gameTakes)} label="Drives after takeaways" /></>}
              </>
            )}
            <p className="sub">Interceptions or fumbles returned for a touchdown are counted as defensive scores in the Drives tab, not as giveaways here.</p>
          </div>
        )}
      </section>

      {/* ---------------- After takeaways ---------------- */}
      <section className="panel fl-panel" aria-label="Points after takeaways">
        <h2>Points after takeaways <InfoTip label="points after takeaways">{data.definitions.afterTurnover}</InfoTip></h2>
        <p className="fl-def" role="note"><b>What this counts:</b> {data.definitions.afterTurnover} It is not the same as "points caused by the turnover".</p>
        <p className="fl-line" role="status">{after.text}</p>
        {after.small && <p className="sub">{after.small}</p>}
        {fp.takeaways > 0 && (
          <>
            <div className="dv-cards fl-cards" role="list">
              <div role="listitem" className="dv-card"><span className="lab">Takeaway drives</span><b>{fp.takeaways}</b><small>{fp.scoredAfterTakeaway} scored</small></div>
              <div role="listitem" className="dv-card"><span className="lab">Points on them</span><b>{fp.pointsAfterTakeaways}</b><small>{fmt.n(fp.pointsAfterTakeaways / fp.takeaways, 2)} per drive</small></div>
              <div role="listitem" className="dv-card"><span className="lab">Same spots, league-wide<InfoTip label="same spots, league-wide">The league's average points per drive for drives starting where these did, whatever way they began.</InfoTip></span><b>{fmt.n(expected, 2)}</b><small>points per drive</small></div>
            </div>
            <details className="fl-det"><summary>The {fp.takeaways} drives that began after a takeaway</summary>
              <DriveTable list={withIdx2(fd.rows, fp.afterTakeaway)} label="Drives after takeaways" />
              <p className="sub">Each began after: {[...new Set(fp.afterTakeaway.map((d) => howText(d)))].join(" or ")}.</p>
            </details>
          </>
        )}
      </section>

      {/* ---------------- Fumbles ---------------- */}
      <section className="panel fl-panel" aria-label="Fumble recoveries">
        <h2>Fumble recoveries</h2>
        {!fum || !fumblesSupported(data, fum) ? (
          <Unavailable what="Fumble recovery rates" instead={data.config.hasFumbles ? "The source records no fumbles in these games, so a recovery rate would be meaningless." : "The college play-by-play does not reliably mark who recovered a fumble, so no recovery rate is shown. Interceptions and lost-fumble giveaways above come from how each drive ended."} />
        ) : (
          <>
            <p className="sub">Fumbles on pass and run plays only. A fumble is "lost" when the other team ends up with the ball. Recovery rates hover around half for most teams, because who recovers a loose ball is largely luck.</p>
            <div className="dv-cards fl-cards" role="list">
              {([
                ["Own fumbles", fum.ours, `${fum.ours.fumbles - fum.ours.lost} of ${fum.ours.fumbles} recovered by ${name}`, 1 - fum.ours.lost / Math.max(1, fum.ours.fumbles)],
                ["Opponent fumbles", fum.theirs, `${fum.theirs.lost} of ${fum.theirs.fumbles} recovered by ${poss(name)} defense`, fum.theirs.lost / Math.max(1, fum.theirs.fumbles)],
              ] as const).map(([l, f, text, share]) => (
                <div role="listitem" className="dv-card" key={l}><span className="lab">{l}</span><b>{f.fumbles ? fmt.pct(share, 0) : "—"}</b><small>{f.fumbles ? text : "no fumbles"}</small>{f.fumbles > 0 && f.fumbles < 6 && <em>small sample</em>}</div>
              ))}
              <div role="listitem" className="dv-card"><span className="lab">League recovery rate</span><b>{fmt.pct(1 - fum.league.lost / fum.league.fumbles, 0)}</b><small>{fum.league.fumbles} fumbles</small></div>
            </div>
          </>
        )}
      </section>
    </PerfFrame>
  );

  function withIdx2(rows: PerfRow[], ds: DriveTuple[]) {
    const out: { row: PerfRow; idx: number; tuple: DriveTuple }[] = [];
    for (const row of rows) row.d.forEach((tuple, idx) => { if (ds.includes(tuple)) out.push({ row, idx, tuple }); });
    return out;
  }
}
