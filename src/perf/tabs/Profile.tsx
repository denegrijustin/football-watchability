import { useMemo } from "react";
import { usePerf } from "../data";
import { PROFILE_METRICS, gamesFor, measure, summarizeGames, type MetricResult } from "../engine";
import { gapSentences, profileSentence } from "../narrate";
import { fmt, InfoTip, PerfFrame, PercentBars, Unavailable, useTeamColors, type BarRow } from "../ui";
import type { PerfData, PerfSelection } from "../types";

function Detail({ id, r, rb, data, sel, team, opp }: { id: string; r: MetricResult; rb: MetricResult | null; data: PerfData; sel: PerfSelection; team: string; opp: string | null }) {
  const { adapter } = usePerf();
  const hasEpa = data.config.hasEpa;
  const games = gamesFor(data, team, sel);
  const rows = games.map((g) => ({ g, v: r.def.read(summarizeGames(data, team, [g], sel.garbage), hasEpa) }));
  const show = (v: number | null) => (v == null ? "—" : r.def.unit === "pct" ? fmt.pct(v) : r.def.unit === "pts" ? v.toFixed(2) : hasEpa ? fmt.signed(v) : fmt.pct(v));
  return (
    <div className="pdetail" id={id} role="region" aria-label={`${r.def.label} details`}>
      <h3>{r.def.label}: {r.def.plain}</h3>
      <p>{r.def.definition(hasEpa)}</p>
      <dl className="kv">
        <div><dt>{adapter.short(team)}</dt><dd>{r.value == null ? "No data" : r.def.describe(r.value, hasEpa)}</dd></div>
        {rb && opp && <div><dt>{adapter.short(opp)}</dt><dd>{rb.value == null ? "No data" : rb.def.describe(rb.value, hasEpa)}</dd></div>}
        <div><dt>League average</dt><dd>{r.leagueValue == null ? "—" : r.def.describe(r.leagueValue, hasEpa)}</dd></div>
        <div><dt>Ranking</dt><dd>{r.rank == null ? "—" : `${fmt.ord(r.rank)} of ${r.of} ${data.league === "nfl" ? "NFL teams" : "FBS teams"} (${r.pct}th percentile)`}</dd></div>
        <div><dt>Sample</dt><dd>{r.sample.toLocaleString()} {r.def.sampleUnit} in {games.length} game{games.length === 1 ? "" : "s"}{r.small ? " — small sample" : ""}</dd></div>
      </dl>
      <div className="tbl-wrap">
        <table className="tbl" aria-label={`${r.def.label} by game`}>
          <thead><tr><th>Week</th><th>Opponent</th><th>Result</th><th className="r">{r.def.label}</th></tr></thead>
          <tbody>
            {rows.map(({ g, v }) => (
              <tr key={g.g}>
                <td>{g.w}</td>
                <td><span className="tm">{adapter.mark(g.o, 18)}{g.h === 1 ? "vs" : g.h === 0 ? "at" : "vs"} {adapter.short(g.o)}</span></td>
                <td>{g.pf > g.pa ? "W" : g.pf < g.pa ? "L" : "T"} {g.pf}–{g.pa}</td>
                <td className="r">{show(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adapter.openTeam && <button type="button" className="btn small" onClick={() => adapter.openTeam!(team)}>Open the full team page</button>}
    </div>
  );
}

export default function Profile() {
  const { data, sel, set, adapter } = usePerf();
  const { a, b } = useTeamColors();
  const team = sel.team;
  const mine = useMemo(() => (data && team ? measure(data, sel, team) : null), [data, sel, team]);
  const theirs = useMemo(() => (data && sel.opp ? measure(data, sel, sel.opp) : null), [data, sel]);
  const nGames = data && team ? gamesFor(data, team, sel).length : 0;

  const take = mine && team ? profileSentence(adapter.name(team), mine, nGames) : null;
  const gaps = mine && theirs && team && sel.opp ? gapSentences(adapter.short(team), adapter.short(sel.opp), mine, theirs) : [];
  const selected = PROFILE_METRICS.find((m) => m.id === sel.metric)?.id ?? null;

  const rows: BarRow[] = (mine ?? []).map((r, i) => {
    const id = `pd-${r.def.id}`;
    return {
      id: r.def.id, label: r.def.label, plain: r.def.plain, a: r.pct, b: theirs ? theirs[i].pct : undefined,
      aText: r.value == null ? "no data" : r.rank ? `${fmt.ord(r.rank)} of ${r.of}` : undefined,
      flag: r.small ? "small sample" : undefined,
      selected: selected === r.def.id, detailId: id,
      onSelect: () => set({ metric: selected === r.def.id ? null : r.def.id }),
      detail: selected === r.def.id && data && team ? <Detail id={id} r={r} rb={theirs ? theirs[i] : null} data={data} sel={sel} team={team} opp={sel.opp} /> : null,
    };
  });

  return (
    <PerfFrame
      title="Team Profile" question="What kind of team is this?"
      show={{ opp: true, window: true, garbage: true }}
      takeaway={take} takeSmall={data ? `Percentiles compare ${team ? adapter.short(team) : "the team"} with the other ${data.league === "nfl" ? "NFL teams" : "FBS teams"} this season. Tap a bar for the numbers behind it.` : undefined}
      defs={["success", "efficiency", "pass", "rush", "garbage", "drive"]}
    >
      {data && !data.config.hasEpa && <Unavailable what="Expected points added (EPA)" instead="College data does not include it, so passing and rushing show the share of plays that were successful instead." />}
      {mine && team && (
        <>
          <PercentBars
            rows={rows} aName={adapter.name(team)} bName={sel.opp ? adapter.name(sel.opp) : undefined} aColor={a} bColor={b}
            aMark={adapter.mark(team, 16)} bMark={sel.opp ? adapter.mark(sel.opp, 16) : undefined}
          />
          {gaps.length > 0 && <ul className="notes" aria-label="Biggest differences">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>}
          {sel.opp && gaps.length === 0 && <p className="sub">These two teams are within 20 percentile points of each other on all six measures.</p>}
        </>
      )}
      <p className="sub">A higher percentile is always better. For defense that means the opponent did less against it. <InfoTip label="percentile">A 78th percentile means this team is better than 78% of the other teams on this measure. It says nothing about the size of the gap.</InfoTip></p>
    </PerfFrame>
  );
}
