import { useMemo, useState } from "react";
import { usePerf } from "../data";
import { fmt, InfoTip, PerfFrame, Unavailable } from "../ui";
import { breakdown, parseSpec, situationModel, situationTakeaway, specLabel, pts, type Cell, type SituationModel } from "../situationsCalc";
import { CellFace, GridLegend, SituationsGrid, cellSpeech, type ColorBy } from "../charts/situationsGrid";
import type { PerfData, PerfSelection } from "../types";

type Focus = "dd" | "early" | "late" | "rz" | "score";
const FOCUS: [Focus, string][] = [["dd", "Down and distance"], ["early", "Early downs"], ["late", "3rd and 4th down"], ["rz", "Red zone"], ["score", "Leading, tied, trailing"]];
const CARDS: Record<Focus, string[]> = { dd: ["early", "late", "rz", "lead", "tied", "trail"], early: ["early"], late: ["late"], rz: ["rz"], score: ["lead", "tied", "trail"] };
const EMPHASIZE: Record<Focus, number[] | null> = { dd: null, early: [1, 2], late: [3, 4], rz: null, score: null };
const CARD_TITLE: Record<string, string> = { early: "1st and 2nd down", late: "3rd and 4th down", rz: "Red zone", lead: "Leading", tied: "Tied", trail: "Trailing" };
const CARD_HELP: Record<string, string> = {
  early: "All first- and second-down plays: the downs that decide whether an offense stays on schedule.",
  late: "Third- and fourth-down plays: the 'convert or give it up' downs.",
  rz: "Plays that start inside the opponent's 20-yard line.",
  lead: "Plays when the offense is ahead on the scoreboard before the snap.", tied: "Plays when the score is tied before the snap.", trail: "Plays when the offense is behind before the snap.",
};

function Breakdown({ data, sel, team, model, spec }: { data: PerfData; sel: PerfSelection; team: string; model: SituationModel; spec: NonNullable<ReturnType<typeof parseSpec>> }) {
  const { adapter } = usePerf();
  const b = useMemo(() => breakdown(data, sel, team, spec), [data, sel, team, spec]);
  const cell: Cell | undefined = [...model.grid.flat(), ...model.sits].find((c) => c.key === (spec.kind === "dd" ? `dd:${spec.down}:${spec.bucket}` : `sit:${spec.id}`));
  const off = sel.side === "off";
  const max = Math.max(1, ...b.lines.map((l) => l.n));
  return (
    <section className="pdetail sd-detail" aria-label={`Game by game: ${specLabel(spec)}`} id="sit-detail">
      <h3>{specLabel(spec)}: game by game</h3>
      <p>
        {off ? `${adapter.short(team)} offense` : `Opponents against the ${adapter.short(team)} defense`}: {b.total.succ} successful plays out of {b.total.n} ({fmt.pct(b.total.rate, 0)})
        {model.hasBench && cell?.benchRate != null && <> · {model.benchLabel}: {fmt.pct(cell.benchRate, 0)}</>}.
      </p>
      {cell && <p className="sub">{cellSpeech(cell, model.side, model.benchLabel)}</p>}
      <div className="tbl-wrap">
        <table className="tbl" aria-label={`${specLabel(spec)} by game`}>
          <thead><tr><th>Week</th><th>Opponent</th><th>Result</th><th className="r">Plays</th><th className="r">Successful</th><th className="r">Rate</th></tr></thead>
          <tbody>
            {b.lines.map((l) => (
              <tr key={l.id} className={l.n === 0 ? "sd-none" : undefined}>
                <td>{l.week}</td>
                <td><span className="tm">{adapter.mark(l.opp, 18)}{l.home === 0 ? "at" : "vs"} {adapter.short(l.opp)}</span></td>
                <td>{l.result} {l.pf}–{l.pa}</td>
                <td className="r">{l.n}</td>
                <td className="r">{l.n ? l.succ : "—"}</td>
                <td className="r sd-rate">
                  {l.n ? <><span className="sd-bar" aria-hidden="true"><i style={{ width: `${(l.n / max) * 100}%` }} /><b style={{ width: `${(l.succ / max) * 100}%` }} /></span>{fmt.pct(l.rate, 0)}{l.n < 5 ? <small> few plays</small> : null}</> : "no plays"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th colSpan={3}>All games shown</th><th className="r">{b.total.n}</th><th className="r">{b.total.n ? b.total.succ : "—"}</th><th className="r">{fmt.pct(b.total.rate, 0)}</th></tr></tfoot>
        </table>
      </div>
      <p className="sub">The data keeps counts for each game, not the individual plays, so this shows how many plays and successes happened in each game. {adapter.openTeam && <button type="button" className="btn small ghost" onClick={() => adapter.openTeam!(team)}>Open the {adapter.short(team)} team page</button>} For the plays themselves, open the game in Game Center.</p>
    </section>
  );
}

export default function Situations() {
  const { data, sel, set, adapter } = usePerf();
  const [focus, setFocus] = useState<Focus>("dd");
  const [colorBy, setColorBy] = useState<ColorBy>("rate");
  const team = sel.team;
  const model = useMemo(() => (data && team ? situationModel(data, sel, team, adapter.short) : null), [data, sel, team, adapter]);
  const name = team ? adapter.short(team) : "";
  const take = model && team ? situationTakeaway(model, name) : null;
  const spec = parseSpec(sel.metric);
  const selectedKey = spec ? (spec.kind === "dd" ? `dd:${spec.down}:${spec.bucket}` : `sit:${spec.id}`) : null;
  const choose = (key: string | null) => set({ metric: key });
  const off = sel.side === "off";

  const seg = <T extends string>(label: string, value: T, opts: [T, string][], on: (v: T) => void) => (
    <div className="field">
      <span>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {opts.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => on(v)}>{l}</button>)}
      </div>
    </div>
  );

  return (
    <PerfFrame
      title="Situations" question="When does this team succeed or struggle?"
      show={{ opp: true, bench: true, side: true, window: true, garbage: true }}
      takeaway={take?.text} takeSmall={take?.small}
      defs={["success", "garbage", "redzone"]}
    >
      {data && !data.config.hasEpa && <Unavailable what="Expected points added (EPA)" instead="College data does not include it, so every figure here is the share of plays that were successful." />}
      {model && team && model.games === 0 && <div className="empty">No games match these filters yet. Try the full season{data?.league === "cfb" ? " or count FCS opponents" : ""}.</div>}
      {model && team && model.games > 0 && (
        <>
          <div className="sg-bar-controls">
            {seg("Look at", focus, FOCUS, setFocus)}
            {seg("Color by", colorBy, [["rate", "Success rate"], ["diff", model.hasBench ? "Difference" : "Difference (needs a benchmark)"]], (v) => setColorBy(v))}
          </div>

          <div className="panel sg-panel">
            <div className="phead">
              <div>
                <h2>{off ? `${name} offense` : `Opponents against the ${name} defense`}: success rate by down and distance</h2>
                <p className="sub" style={{ margin: 0 }}>
                  {off ? "Higher is better." : "This is what opponents did, so lower is better for the defense."}
                  {" "}Each box shows the success rate, the number of plays, and {model.hasBench ? `how far it is from the ${model.benchLabel} (▲ better, ▼ worse, ≈ about even)` : "no comparison (benchmark is off)"}.
                  <InfoTip label="success rate">{data!.definitions.success}</InfoTip>
                </p>
              </div>
              <p className="sg-all">
                All plays: <b>{fmt.pct(model.overall.rate, 1)}</b> ({model.overall.n})
                {model.benchOverall?.rate != null && <> · {model.benchLabel}: <b>{fmt.pct(model.benchOverall.rate, 1)}</b></>}
              </p>
            </div>
            {colorBy === "diff" && !model.hasBench && <p className="note-box" role="note">Turn the benchmark on (league average or a comparison team) to color by difference. Showing success rate instead.</p>}
            <SituationsGrid
              model={model} colorBy={colorBy === "diff" && !model.hasBench ? "rate" : colorBy} selected={selectedKey} onSelect={choose} emphasize={EMPHASIZE[focus]}
              ariaLabel={`Success rate by down and distance. Arrow keys move between boxes, Enter opens the game-by-game counts.`}
            />
            <GridLegend colorBy={colorBy === "diff" && !model.hasBench ? "rate" : colorBy} side={model.side} benchLabel={model.benchLabel} />
            {focus !== "dd" && EMPHASIZE[focus] == null && <p className="sub">The stored data does not split {focus === "rz" ? "red-zone plays" : "leading, tied and trailing plays"} by down and distance, so they are shown as cards below the grid.</p>}
          </div>

          <div className="sg-cards" role="group" aria-label="Situations">
            {CARDS[focus].map((id) => {
              const c = model.sits.find((x) => x.key === `sit:${id}`)!;
              return (
                <button
                  key={id} type="button" className={`scard${c.small ? " small" : ""}${selectedKey === c.key ? " on" : ""}`} aria-pressed={selectedKey === c.key} aria-controls={selectedKey === c.key ? "sit-detail" : undefined}
                  aria-label={cellSpeech({ ...c, label: CARD_TITLE[id] }, model.side, model.benchLabel)} onClick={() => choose(selectedKey === c.key ? null : c.key)}
                >
                  <span className="scard-t">{CARD_TITLE[id]}</span>
                  <span className="scard-b"><CellFace c={c} hasBench={model.hasBench} /></span>
                  <small>{CARD_HELP[id]}</small>
                </button>
              );
            })}
          </div>

          {spec && data && team ? <Breakdown data={data} sel={sel} team={team} model={model} spec={spec} /> : <p className="sub sg-hint">Tap or press Enter on any box or card to see the plays and successes in each game.</p>}
          {model.hasBench && <p className="sub">Differences are in percentage points of success rate against the {model.benchLabel} in the same spot. {pts(0.08)} means 8 points higher. A boxed rate with fewer than 20 plays is hatched and not given a better-or-worse mark.</p>}
        </>
      )}
    </PerfFrame>
  );
}
