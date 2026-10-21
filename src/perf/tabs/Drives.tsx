import { useMemo, useState } from "react";
import { usePerf } from "../data";
import { gamesFor, leagueAverage, summarize, summarizeGames, fieldLabel } from "../engine";
import { fmt, InfoTip, PerfFrame, readableColor, useLight, useTeamColors } from "../ui";
import { DRIVE } from "../../../scripts/perf/lib.mjs";
import {
  NO_FILTER, OUTCOMES, RESULT_PHRASE, apart, poss, bigPlaysByDrive, buildGameDrives, clockAtStart, driveCards, driveSlot, drivesTakeaway, filterDrives, howText, mmss, optionCounts,
  oppRowOf, outcomeInfo, parseDriveSlot, quarterWords, resultText, spot, type DriveFilter, type GameDrive, type HalfFilter, type OutcomeKind, type QuarterFilter,
} from "../drivesCalc";
import { DriveLanes, type LaneNames } from "../charts/drivesField";
import { OutcomeLegend, ResultChip } from "../charts/drivesGlyph";
import { DrivePlays } from "../charts/drivesPlays";
import type { PerfRow } from "../types";

const outcomeLabel = (k: OutcomeKind) => outcomeInfo(k).short;

function Seg<T extends string>({ label, value, opts, onChange }: { label: string; value: T; opts: { v: T; l: string; n?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {opts.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} disabled={o.n === 0 && value !== o.v} onClick={() => onChange(o.v)}>{o.l}{o.n != null && <small className="dv-n"> {o.n}</small>}</button>)}
      </div>
    </div>
  );
}

function Detail({ id, d, names, ctx }: { id: string; d: GameDrive; names: LaneNames; ctx: DetailCtx }) {
  const t = d.tuple;
  const own = d.side === "team" ? names.team : names.opp, other = d.side === "team" ? names.opp : names.team;
  const clock = clockAtStart(t);
  const yards = t[DRIVE.YARDS];
  const key = ctx.keyPlays.get(d.key) ?? [];
  const reach = t[DRIVE.MIN_YL];
  const pts = t[DRIVE.PTS];
  return (
    <div className="dv-detail" id={id} role="region" aria-label={`Drive ${d.no} details`}>
      <h3><ResultChip kind={d.kind} label={resultText(t)} /> <span>Drive {d.no} · {own} · {quarterWords(d.period)}{clock ? `, ${clock} left` : ""}</span></h3>
      <p className="dv-story">
        {own} started at {spot(t[DRIVE.START_YL], own, other)} after {howText(t)}, ran {t[DRIVE.PLAYS]} play{t[DRIVE.PLAYS] === 1 ? "" : "s"} for {yards >= 0 ? `${yards} yard${yards === 1 ? "" : "s"}` : `${-yards} yards lost`} in {mmss(t[DRIVE.SECS])}, and {RESULT_PHRASE[t[DRIVE.RESULT]] ?? "ended some other way"}.
      </p>
      <dl className="kv">
        <div><dt>Started</dt><dd>{spot(t[DRIVE.START_YL], own, other)} ({fieldLabel(t[DRIVE.START_YL]).toLowerCase()})</dd></div>
        <div><dt>Farthest point</dt><dd>{reach <= 0 ? "the end zone" : spot(reach, own, other)}</dd></div>
        <div><dt>Plays · yards</dt><dd>{t[DRIVE.PLAYS]} · {yards}</dd></div>
        <div><dt>Time</dt><dd>{mmss(t[DRIVE.SECS])}</dd></div>
        <div><dt>Began after</dt><dd>{howText(t)}</dd></div>
        <div><dt>Points</dt><dd>{d.kind === "against" ? "0 for the offense; the other side scored" : pts}</dd></div>
      </dl>
      {t[DRIVE.GARBAGE] === 1 && <p className="sub">Part of this drive came in garbage time (the game was lopsided).</p>}
      <div className="dv-key">
        <h4>Key plays on this drive <InfoTip label="key plays">Passes of {ctx.explosive.pass}+ yards and runs of {ctx.explosive.rush}+ yards. Only each team's six longest in a game are kept, so a drive can have big plays not listed here.</InfoTip></h4>
        {key.length ? (
          <ul>{key.map((k, i) => <li key={i}><b>{k[2]} yd {k[3] ? "pass" : "run"}</b> <small>{k[0] >= 5 ? "OT" : `Q${k[0]}`} {k[1]}</small><span>{k[4]}</span></li>)}</ul>
        ) : <p className="sub">No big play on this drive in the saved list.</p>}
      </div>
      <DrivePlays data={ctx.data} game={ctx.game} drive={d} abbr={ctx.data.teams[d.team]?.abbr} otDrives={ctx.otDrives(d.team)} teamName={own} />
    </div>
  );
}
interface DetailCtx { data: import("../types").PerfData; game: import("../types").PerfGame | undefined; keyPlays: Map<string, import("../types").BigPlay[]>; explosive: { pass: number; rush: number }; otDrives: (team: string) => number }

export default function Drives() {
  const { data, sel, set, adapter } = usePerf();
  const { a } = useTeamColors();
  const light = useLight();
  const team = sel.team;
  const [filter, setFilter] = useState<DriveFilter>(NO_FILTER);

  const games = useMemo(() => (data && team ? gamesFor(data, team, sel) : []), [data, team, sel]);
  const slot = parseDriveSlot(sel.metric);
  const row: PerfRow | null = games.find((g) => g.g === sel.game) ?? games[games.length - 1] ?? null;

  const side = sel.side;
  const season = useMemo(() => (data && team ? summarize(data, team, sel) : null), [data, team, sel]);
  const bench = useMemo(() => {
    if (!data || !team) return null;
    if (sel.bench === "league") { const l = leagueAverage(data, sel); return { name: "the league average", s: side === "off" ? l.drives : l.drivesAgainst }; }
    if (sel.bench === "opp" && sel.opp) { const o = summarize(data, sel.opp, sel); return { name: adapter.short(sel.opp), s: side === "off" ? o.drives : o.drivesAgainst }; }
    return null;
  }, [data, team, sel, side, adapter]);

  const all = useMemo(() => (data && row ? buildGameDrives(data, row, sel.garbage) : []), [data, row, sel.garbage]);
  const shown = useMemo(() => filterDrives(all, filter), [all, filter]);
  const keyPlays = useMemo(() => (data && row ? bigPlaysByDrive(data, row) : new Map()), [data, row]);
  const gameStats = useMemo(() => (data && team && row ? summarizeGames(data, team, [row], sel.garbage) : null), [data, team, row, sel.garbage]);

  // The selected drive: only one that belongs to the game on screen and is not filtered out.
  const selectedKey = slot && row && slot.game === row.g && shown.some((d) => d.key === slot.key) ? slot.key : null;

  if (!data || !team || !season) return <PerfFrame title="Drives" question="How do possessions turn into points, or stall?" show={{}}>{null}</PerfFrame>;

  const name = adapter.short(team);
  const oppName = row ? adapter.short(row.o) : "";
  const otherRow = row ? oppRowOf(data, row) : undefined;
  const fallbackB = light ? "#b45309" : "#f0b04a";
  const oppColor = row ? apart(a, readableColor(adapter.color(row.o), light, fallbackB), fallbackB) : fallbackB;
  const names: LaneNames = { team: name, opp: oppName, teamAbbr: data.teams[team]?.abbr ?? name, oppAbbr: row ? data.teams[row.o]?.abbr ?? oppName : "" };
  const gameMeta = row ? data.games.find((g) => g.id === row.g) : undefined;
  const gameLabel = row ? `Week ${row.w} ${row.h === 0 ? "at" : "vs"} ${oppName}` : "";
  const gameOpt = (g: PerfRow) => `Wk ${g.w} · ${g.h === 0 ? "at" : "vs"} ${adapter.short(g.o)} · ${g.pf > g.pa ? "W" : g.pf < g.pa ? "L" : "T"} ${g.pf}–${g.pa}`;
  const partial = !!row && !!data.coverage.partial?.includes(row.g);

  const take = drivesTakeaway({
    side, name, benchName: bench?.name ?? null, stats: side === "off" ? season.drives : season.drivesAgainst, bench: bench?.s ?? null,
    game: row && gameStats ? { label: gameLabel, oppName, mine: gameStats.drives, theirs: gameStats.drivesAgainst, pf: row.pf, pa: row.pa } : null,
  });
  const cards = driveCards(side === "off" ? season.drives : season.drivesAgainst, bench?.s ?? null, side);

  const idx = row ? games.indexOf(row) : -1;
  const pick = (g: PerfRow | undefined) => g && set({ game: g.g, metric: slot ? null : sel.metric });
  const otDrives = (t: string) => all.filter((d) => d.team === t && d.period >= 5).length;
  const clearFilter = () => setFilter(NO_FILTER);
  const filtered = filter.team !== "both" || filter.half !== "all" || filter.quarter !== "all" || filter.outcome !== "all";
  const select = (key: string | null) => row && set({ game: row.g, metric: key ? driveSlot(row.g, key) : slot ? null : sel.metric });

  const tCount = optionCounts(all, filter, "team"), hCount = optionCounts(all, filter, "half"), qCount = optionCounts(all, filter, "quarter"), oCount = optionCounts(all, filter, "outcome");
  const hasOt = all.some((d) => d.period >= 5);
  const scoreOf = (s: NonNullable<typeof gameStats>["drives"]) => `${s.drives} drive${s.drives === 1 ? "" : "s"}, ${Math.round((s.scoringRate ?? 0) * s.drives)} scoring, ${fmt.n(s.pointsPerDrive, 2)} points per drive`;

  return (
    <PerfFrame
      title="Drives" question="How do possessions turn into points, or stall?"
      show={{ opp: true, side: true, bench: true, window: true, garbage: true }}
      takeaway={take.text} takeSmall={take.small ?? `Tap a drive on the field below for the plays behind it. ${data.config.populationNote ?? ""}`.trim()}
      defs={["drive", "garbage", "redzone"]}
    >
      <section aria-label={`${side === "off" ? "Offense" : "Defense"} drive summary`}>
        <h2 className="dv-h">{side === "off" ? `${name.endsWith("s") ? name + "'" : name + "'s"} drives` : `Opponents' drives against ${name}`} <span className="sub">this season · {season.drives.drives} drives in {season.games.length} games</span></h2>
        <div className="dv-cards" role="list">
          {cards.map((c) => (
            <div role="listitem" key={c.id} className="dv-card">
              <span className="lab">{c.label}<InfoTip label={c.label}>{c.tip}</InfoTip></span>
              <b>{c.text}</b>
              {c.bench != null && bench ? <small>{bench.name}: {c.benchText}</small> : <small>&nbsp;</small>}
              {c.verdict && <em className={`v-${c.verdict}`}>{c.verdict === "better" ? "✓ " : c.verdict === "worse" ? "✕ " : "≈ "}{c.diffText}</em>}
            </div>
          ))}
        </div>
        {bench && <p className="sub">Compared with {bench.name}. {side === "def" ? "For the defense, lower scoring and shorter fields given up are better." : ""}</p>}
      </section>

      {!row || !gameStats ? (
        <div className="empty" role="status">No games to show for {name} under the current settings. {data.league === "cfb" && !sel.includeFcs ? "Games against FCS opponents are left out; turn them on in the controls to see them." : ""}</div>
      ) : (
        <section className="panel dv-panel" aria-label="One game on the field">
          <div className="dv-ghead">
            <label className="field">
              <span>Game</span>
              <select className="ctl dv-gsel" value={row.g} onChange={(e) => pick(games.find((g) => g.g === e.target.value))}>
                {games.map((g) => <option key={g.g} value={g.g}>{gameOpt(g)}</option>)}
              </select>
            </label>
            <div className="dv-step" role="group" aria-label="Move between games">
              <button type="button" className="btn small" disabled={idx <= 0} onClick={() => pick(games[idx - 1])} aria-label="Earlier game">‹ Earlier</button>
              <button type="button" className="btn small" disabled={idx >= games.length - 1} onClick={() => pick(games[idx + 1])} aria-label="Later game">Later ›</button>
            </div>
          </div>
          <div className="dv-score">
            <div><i style={{ background: a }} /><b>{name} {row.pf}</b> <small>{scoreOf(gameStats.drives)}</small></div>
            <div><i style={{ background: oppColor }} /><b>{oppName} {row.pa}</b> <small>{scoreOf(gameStats.drivesAgainst)}</small></div>
          </div>
          {!otherRow && <p className="note-box" role="note">{poss(oppName)} side of this game is missing from the data, so only {poss(name)} drives are shown.</p>}
          {partial && <p className="note-box" role="note">The play-by-play for this game is incomplete, so some drives may be missing.</p>}

          <div className="dv-filters" role="group" aria-label="Filter the drives">
            <Seg<DriveFilter["team"]> label="Team" value={filter.team} onChange={(v) => setFilter({ ...filter, team: v })} opts={[{ v: "both", l: "Both" }, { v: "team", l: name, n: tCount.get("team") ?? 0 }, { v: "opp", l: oppName, n: tCount.get("opp") ?? 0 }]} />
            <Seg<HalfFilter> label="Half" value={filter.half} onChange={(v) => setFilter({ ...filter, half: v })} opts={[{ v: "all", l: "Both" }, { v: "1", l: "1st", n: hCount.get("1") ?? 0 }, { v: "2", l: "2nd", n: hCount.get("2") ?? 0 }]} />
            <Seg<QuarterFilter> label="Quarter" value={filter.quarter} onChange={(v) => setFilter({ ...filter, quarter: v })} opts={[{ v: "all", l: "All" }, ...(["1", "2", "3", "4"] as const).map((q) => ({ v: q as QuarterFilter, l: `Q${q}`, n: qCount.get(q) ?? 0 })), ...(hasOt ? [{ v: "5" as QuarterFilter, l: "OT", n: qCount.get("5") ?? 0 }] : [])]} />
            <div className="field dv-outwrap">
              <span id="dv-outcome">How it ended</span>
              <div className="dv-chips" role="group" aria-labelledby="dv-outcome">
                <button type="button" className="dv-chip" aria-pressed={filter.outcome === "all"} onClick={() => setFilter({ ...filter, outcome: "all" })}>All</button>
                {OUTCOMES.map((o) => {
                  const n = oCount.get(o.kind) ?? 0;
                  return <button key={o.kind} type="button" className="dv-chip" aria-pressed={filter.outcome === o.kind} disabled={n === 0 && filter.outcome !== o.kind} title={o.plain} onClick={() => setFilter({ ...filter, outcome: filter.outcome === o.kind ? "all" : o.kind })}>{outcomeLabel(o.kind)} <small className="dv-n">{n}</small></button>;
                })}
              </div>
            </div>
          </div>

          <div className="dv-count" role="status" aria-live="polite">
            Showing {shown.length} of {all.length} drives{filtered && <> · <button type="button" className="btn small ghost" onClick={clearFilter}>Clear filters</button></>}
          </div>
          <div className="legend dv-teams" aria-label="Which way each team drives">
            <span><i style={{ background: a }} />{name} drives to the right →</span>
            <span><i style={{ background: oppColor }} />← {oppName} drives to the left</span>
          </div>
          <OutcomeLegend kinds={[...new Set(all.map((d) => d.kind))]} />

          {shown.length === 0 ? (
            <div className="empty" role="status">{all.length === 0 ? "No counted drives in this game under the current settings." : "No drives match these filters."} {filtered && <button type="button" className="btn small" onClick={clearFilter}>Clear filters</button>}</div>
          ) : (
            <DriveLanes
              drives={shown} names={names} colors={{ team: a, opp: oppColor }} selected={selectedKey} onSelect={select} idPrefix="dv-d"
              detail={(d) => <Detail id={`dv-d-${d.key.replace(":", "-")}`} d={d} names={names} ctx={{ data, game: gameMeta, keyPlays, explosive: data.config.explosive, otDrives }} />}
            />
          )}
          <p className="sub dv-foot">Each row is one possession, in game order. The dot is where it began, the bar runs to the farthest point it reached, and the mark shows how it ended. Kneel-downs at the end of a half or game are not counted as drives.</p>
        </section>
      )}
    </PerfFrame>
  );
}
