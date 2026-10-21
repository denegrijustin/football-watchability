import { useMemo, useState } from "react";
import { usePerf } from "../data";
import { DENOMINATORS, type Denominator } from "../engine";
import { InfoTip, PerfFrame, useTeamColors } from "../ui";
import { DRIVE } from "../../../scripts/perf/lib.mjs";
import { clockAtStart, driveSlot, kindOf, outcomeInfo, poss, quarterLabel, resultShort, resultText, spot } from "../drivesCalc";
import { BUCKETS, NOUN, NOUN_ONE, denInfo, drivesBehind, emptyBreakdown, finSlot, finishingRows, finishingTakeaway, parseFinSlot, type Bucket, type FinRow } from "../finishingCalc";
import { FinishingBars, FinishingLegend } from "../charts/finishingBars";
import { ResultGlyph } from "../charts/drivesGlyph";
import { openDrivesTab } from "../charts/finishingNav";

export default function Finishing() {
  const { data, sel, set, adapter, league } = usePerf();
  const { a, b } = useTeamColors();
  const [den, setDen] = useState<Denominator>("redzone");
  const team = sel.team;
  const name = team ? adapter.short(team) : "";
  const oppName = sel.opp ? adapter.short(sel.opp) : null;

  const rows = useMemo(() => (data && team ? finishingRows(data, sel, den, { team: name, opp: oppName }) : []), [data, team, sel, den, name, oppName]);
  const mine = rows.find((r) => r.key === "team");
  const against = rows.find((r) => r.key === "against");
  const benchRow = rows.find((r) => r.group === "off" && r.key !== "team");
  const slot = parseFinSlot(sel.metric);
  const chosen = slot ? rows.find((r) => r.key === slot.row && r.group === slot.group && r.drillable) : undefined;
  const behind = useMemo(() => (chosen && slot ? drivesBehind(chosen, slot.bucket) : []), [chosen, slot]);
  const info = denInfo(den);

  const take = mine && against ? finishingTakeaway({ name, den, off: mine.fin, against: against.fin, bench: benchRow?.fin ?? null, benchName: benchRow ? (benchRow.key === "league" ? "the league average" : benchRow.label) : null }) : { text: "" };
  const colorOf = (r: FinRow) => (r.key === "team" || r.key === "against" ? a : r.key === "league" ? undefined : b);
  const pick = (r: FinRow, bk: Bucket) => {
    const on = slot?.row === r.key && slot.group === r.group && slot.bucket === bk;
    set({ metric: on ? null : finSlot(r.key, r.group, bk) });
  };
  const bucketLabel = (k: Bucket) => BUCKETS.find((x) => x.k === k)!.label.toLowerCase();

  return (
    <PerfFrame
      title="Finishing Drives" question="Does this team turn opportunities into touchdowns?"
      show={{ opp: true, bench: true, window: true, garbage: true }}
      takeaway={take.text} takeSmall={take.small ?? "Pick which drives to count, then tap a bar segment to see the drives behind it."}
      defs={["drive", "redzone", "opportunity", "garbage"]}
    >
      <section className="panel fn-panel" aria-label="How drives ended">
        <div className="fn-head">
          <div className="field">
            <span id="fn-den">Count which drives</span>
            <div className="seg" role="group" aria-labelledby="fn-den">
              {DENOMINATORS.map((d) => <button key={d.id} type="button" aria-pressed={den === d.id} onClick={() => setDen(d.id)}>{d.label}</button>)}
            </div>
          </div>
        </div>
        <p className="fn-den" role="status">
          <b>{info.label}:</b> {info.note} {mine && <>For {name} that is <b>{mine.fin.n}</b> {mine.fin.n === 1 ? NOUN_ONE[den] : NOUN[den]} in {mine.games} games. Each bar below is out of that count, not out of all drives.</>}
          <InfoTip label={info.label}>{den === "all" ? "Every possession counts here, including three-and-outs." : den === "opportunity" ? "A drive reaches this line if at any point the ball was at or inside the opponent's 40, even if it was then pushed back." : "A drive counts as a red-zone trip if at any point the ball was at or inside the opponent's 20."} The three views have different denominators, so their percentages cannot be compared with each other.</InfoTip>
        </p>
        <FinishingLegend />
        {(["off", "def"] as const).map((g) => (
          <div key={g} className="fn-group" role="group" aria-label={g === "off" ? "Offense" : "Defense"}>
            <h3>{g === "off" ? `Offense: how ${poss(name)} ${NOUN[den]} ended` : `Defense: how opponents' ${NOUN[den]} against ${name} ended`}</h3>
            <FinishingBars
              rows={rows.filter((r) => r.group === g)} den={den} color={colorOf}
              selected={slot ? { row: slot.row, group: slot.group, bucket: slot.bucket } : null} onSelect={pick}
            />
          </div>
        ))}
        <p className="sub">Points each = offensive points divided by the count above (touchdowns with the extra point, and field goals). Only {poss(name)} bars open the drives behind them.</p>

        {chosen && slot && (
          <div className="fn-behind" role="region" aria-label="Drives behind the selected segment">
            <h3>
              {chosen.label}: {bucketLabel(slot.bucket)} <span className="sub">{behind.length} of {chosen.fin.n} {NOUN[den]}</span>
              <button type="button" className="btn small ghost" onClick={() => set({ metric: null })}>Close</button>
            </h3>
            {slot.bucket === "empty" && behind.length > 0 && <p className="sub">How they ended: {emptyBreakdown(chosen.fin.buckets.empty).map(([l, c]) => `${l} ${c}`).join(" · ")}.</p>}
            {behind.length === 0 ? <p className="empty">None in these games.</p> : (
              <div className="tbl-wrap">
                <table className="tbl fn-tbl" aria-label="Drives">
                  <thead><tr><th>Game</th><th>Qtr</th><th>Started</th><th className="r">Plays</th><th className="r">Yards</th><th>Result</th><th /></tr></thead>
                  <tbody>
                    {behind.map(({ row, idx, tuple }) => {
                      const own = slot.group === "off" ? name : adapter.short(row.t), other = slot.group === "off" ? adapter.short(row.o) : name;
                      const clock = clockAtStart(tuple);
                      return (
                        <tr key={`${row.g}-${row.t}-${idx}`}>
                          <td>Wk {row.w} {slot.group === "off" ? (row.h === 0 ? "at" : "vs") : "vs"} {slot.group === "off" ? other : own}</td>
                          <td>{quarterLabel(tuple[DRIVE.PERIOD])}{clock ? ` ${clock}` : ""}</td>
                          <td>{spot(tuple[DRIVE.START_YL], own, other)}</td>
                          <td className="r">{tuple[DRIVE.PLAYS]}</td>
                          <td className="r">{tuple[DRIVE.YARDS]}</td>
                          <td><span className="fn-res" title={resultText(tuple)}><ResultGlyph kind={kindOf(tuple[DRIVE.RESULT])} size={13} /> {resultShort(tuple)}<span className="sr-only"> ({outcomeInfo(kindOf(tuple[DRIVE.RESULT])).label})</span></span></td>
                          <td className="r"><button type="button" className="btn small" aria-label={`See Week ${row.w} drive on the field`} onClick={() => { set({ game: row.g, metric: driveSlot(row.g, `${row.t}:${idx}`) }); openDrivesTab(league); }}>See it on the field</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </PerfFrame>
  );
}
