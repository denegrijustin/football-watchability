import { useEffect, useMemo, useState } from "react";
import { ConfLogo } from "../../ConfMark";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { fmt, METRICS, metricMeta, resolveWeek, rkKey, rowsFor, type Metric } from "../data/derive";
import { cols2, Derived, Mark, Notes } from "../components/common";
import { TeamPicker } from "./TeamView";
import { CompareDots, type DotRow } from "../charts/CompareDots";
import { LinesChart, SeriesPicker, type LineSeries } from "../charts/Lines";
import { C } from "../charts/kit";
import type { Team } from "../data/types";

export default function Compare() {
  const { model } = useData();
  const [route, nav] = useRoute();
  const [active, setActive] = useState<string | null>(null);
  if (!model) return null;
  const week = resolveWeek(model, route.week);

  // With nothing picked yet, start from the top three FBS teams.
  useEffect(() => {
    if (route.compare.length === 0) {
      const top = model.teams.filter((t) => t.division === "FBS").sort((a, b) => (a.weeks[model.latest]?.spRk ?? 999) - (b.weeks[model.latest]?.spRk ?? 999)).slice(0, 3).map((t) => t.id);
      nav({ compare: top }, { replace: true });
    }
  }, [route.compare.length, model, nav]);

  const teams = route.compare.map((id) => model.byId.get(id)).filter((t): t is Team => !!t);
  const colorOf = (i: number) => C.s[i % 4];
  const sameDiv = teams.length > 0 && teams.every((t) => t.division === teams[0].division);
  const div = teams[0]?.division;
  const available = (t: Team) => (sameDiv ? t.weeks[week] : t.top[week]);

  const metrics = METRICS.filter((m) => (sameDiv ? (m.key !== "st" || div === "FBS") : m.key !== "st"));
  const field = useMemo(() => {
    const out: Record<string, { vals: number[]; n: number }> = {};
    for (const m of metrics) {
      if (sameDiv && div) {
        const rows = rowsFor(model, div, week);
        out[m.key] = { vals: rows.map((r) => r.tw[m.key]).filter((v): v is number => v != null), n: rows.length };
      } else {
        const rows = model.teams.map((t) => t.top[week]).filter(Boolean);
        out[m.key] = { vals: rows.map((r) => r![m.key as "sp"]).filter((v): v is number => v != null), n: rows.length };
      }
    }
    return out;
  }, [model, week, sameDiv, div, metrics.length]);

  const val = (t: Team, m: Metric) => (sameDiv ? t.weeks[week]?.[m] : t.top[week]?.[m as "sp"]) ?? null;
  const rk = (t: Team, m: Metric) => (sameDiv ? t.weeks[week]?.[rkKey(m)] : t.top[week]?.[rkKey(m) as "spRk"]) ?? null;

  const dotRows: DotRow[] = metrics.map((m) => ({
    id: m.key, label: m.label, hint: m.lowerBetter ? "lower is better · axis reversed" : "higher is better", lowerBetter: m.lowerBetter, field: field[m.key]?.vals ?? [],
    items: teams.map((t, i) => ({ id: t.id, name: t.name, color: colorOf(i), value: val(t, m.key), rank: rk(t, m.key), rankOf: field[m.key]?.n ?? 0 })),
  }));

  const trend: LineSeries[] = teams.map((t, i) => ({ id: t.id, label: t.name, color: colorOf(i), values: model.weeks.map((w) => (sameDiv ? t.weeks[w]?.sp : t.top[w]?.sp) ?? null) }));
  const notes: string[] = [];
  if (teams.length >= 2) {
    const [a, b] = teams;
    const diffs = metrics.map((m) => ({ m, d: (val(a, m.key) ?? 0) - (val(b, m.key) ?? 0), ra: rk(a, m.key), rb: rk(b, m.key) }));
    const widest = [...diffs].sort((x, y) => Math.abs(y.d) / (metricMeta(y.m.key).key === "st" ? 1 : 1) - Math.abs(x.d))[0];
    notes.push(`${a.name} and ${b.name} are ${Math.abs(diffs[0].d).toFixed(1)} SP+ points apart (${a.name} ${diffs[0].ra == null ? "—" : `#${diffs[0].ra}`}, ${b.name} ${diffs[0].rb == null ? "—" : `#${diffs[0].rb}`}).`);
    const gapUnit = diffs.filter((x) => x.m.key !== "sp").sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
    if (gapUnit) {
      const name = { off: "offense", def: "defense", st: "special teams", sp: "overall" }[gapUnit.m.key];
      notes.push(`Biggest unit gap: ${name}, ${a.name} ${fmt(val(a, gapUnit.m.key))} (${gapUnit.ra == null ? "—" : `#${gapUnit.ra}`}) vs ${b.name} ${fmt(val(b, gapUnit.m.key))} (${gapUnit.rb == null ? "—" : `#${gapUnit.rb}`}).`);
    }
    void widest;
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div>
            <h2>Team comparison, week {week}</h2>
            <p className="sub" style={{ margin: 0 }}>{sameDiv ? `${div} ratings; faint ticks are every ${div} team` : "Teams from different divisions: using the 772-team list, whose SP+ scale differs from the division tabs"} · up to 4 teams</p>
          </div>
          {teams.length < 4 && <TeamPicker label="Add team" value="" exclude={route.compare} onPick={(id) => nav({ compare: [...route.compare, id].slice(0, 4) }, { replace: true })} />}
        </div>
        <div className="legend" style={{ marginBottom: 8 }}>
          {teams.map((t, i) => (
            <span key={t.id} className="chip" style={{ borderColor: colorOf(i) }}>
              <i style={{ background: colorOf(i), borderRadius: 6 }} /><Mark team={t} size={16} /> {t.name}
              <button type="button" aria-label={`Remove ${t.name}`} onClick={() => nav({ compare: route.compare.filter((x) => x !== t.id) }, { replace: true })}>×</button>
            </span>
          ))}
        </div>
        {teams.length < 2 ? <p className="empty">Pick at least two teams.</p> : <CompareDots rows={dotRows} ariaLabel="Aligned dot plot of ratings for the selected teams" />}
        <Notes items={notes} />
        {teams.length >= 2 && teams[0].division === "FBS" && teams[1].division === "FBS" && <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={() => nav({ view: "simulator", p: { a: teams[0].id, b: teams[1].id, v: "n" } })}>Simulate {teams[0].name} vs {teams[1].name}</button>}
      </div>

      {teams.length >= 2 && (
        <div className="grid2" style={cols2("minmax(0,1.4fr) minmax(0,1fr)")}>
          <div className="panel">
            <h2>Exact values</h2>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Rating</th>{teams.map((t, i) => <th key={t.id} className="r" style={{ color: `color-mix(in srgb, ${colorOf(i)} var(--series-text, 100%), var(--series-mix, transparent))` }}>{t.name}</th>)}<th className="r">Spread <Derived why="Largest minus smallest value among the teams" /></th></tr></thead>
              <tbody>
                {metrics.map((m) => {
                  const vs = teams.map((t) => val(t, m.key)).filter((v): v is number => v != null);
                  return (
                    <tr key={m.key}><td>{m.label}</td>{teams.map((t) => <td key={t.id} className="r num">{fmt(val(t, m.key))} <span className="muted">#{rk(t, m.key) ?? "—"}</span></td>)}<td className="r num">{vs.length > 1 ? fmt(Math.max(...vs) - Math.min(...vs)) : "—"}</td></tr>
                  );
                })}
                <tr><td>Record</td>{teams.map((t) => <td key={t.id} className="r num">{available(t)?.record?.text ?? "—"}</td>)}<td /></tr>
                <tr><td>Conference</td>{teams.map((t) => <td key={t.id} className="r"><span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}><ConfLogo conf={available(t)?.conf} division={t.division} size={18} />{available(t)?.conf ?? "—"}</span></td>)}<td /></tr>
                {teams.length === 2 && sameDiv && (
                  <tr><td>Rank gap <Derived why="Difference of the two source ranks" /></td><td colSpan={3} className="r num">{(() => { const a = rk(teams[0], "sp"), b = rk(teams[1], "sp"); return a == null || b == null ? "—" : `${Math.abs(a - b)} spots`; })()}</td></tr>
                )}
              </tbody>
            </table></div>
          </div>
          <div className="panel">
            <h2>SP+ by week</h2>
            <LinesChart xs={model.weeks} xLabel={(x) => `Wk ${x}`} series={trend} height={240} yTitle="SP+" yFormat={(v) => v.toFixed(0)} activeId={active} onActive={setActive}
              tipRows={(xi, s) => { const t = model.byId.get(s.id)!; const tw = sameDiv ? t.weeks[model.weeks[xi]] : t.top[model.weeks[xi]]; return [["SP+", fmt(tw?.sp)], ["Rank", String(tw?.spRk ?? "—")]]; }} ariaLabel="SP+ by week for the selected teams" />
            <SeriesPicker series={trend} activeId={active} onPick={() => undefined} onActive={setActive} />
          </div>
        </div>
      )}
    </div>
  );
}
