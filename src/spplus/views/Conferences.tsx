import { useMemo, useState } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { conferenceRanks, fmt, metricMeta, METRICS, ord, resolveWeek, rkKey, rowsFor, type Metric } from "../data/derive";
import { Derived, Mark, Notes, TeamLink } from "../components/common";
import { SortTable, type Col } from "../components/SortTable";
import { StripPlot, type StripGroup } from "../charts/Strip";
import { confColor } from "../charts/kit";
import { ConfLogo } from "../../ConfMark";
import { DIV_LABEL, type DivKey } from "../data/types";

interface ConfStat { conf: string; n: number; mean: number; median: number; best: { name: string; v: number }; worst: { name: string; v: number }; top25: number }

export default function Conferences() {
  const { model } = useData();
  const [route, nav] = useRoute();
  const [popup, setPopup] = useState<string | null>(null);
  if (!model) return null;
  const week = resolveWeek(model, route.week);
  const div: DivKey = route.div === "ALL" ? "FBS" : route.div;
  const metric = ((route.p.metric as Metric) || "sp") as Metric;
  const mm = metricMeta(metric);
  const rows = useMemo(() => rowsFor(model, div, week), [model, div, week]);
  const crs = useMemo(() => conferenceRanks(rows), [rows]);
  const useMetric: Metric = metric === "st" && div !== "FBS" ? "sp" : metric;

  const groups = useMemo(() => {
    const by = new Map<string, StripGroup>();
    for (const { team, tw } of rows) {
      const v = tw[useMetric];
      if (v == null) continue;
      const c = tw.conf ?? "No conference";
      const g = by.get(c) ?? { id: c, label: c, color: confColor(c), dots: [] };
      const cr = crs.get(team.id);
      g.dots.push({ id: team.id, name: team.name, value: v, logo: team.logo?.local ?? team.logo?.remote, tip: [[mm.label, fmt(v)], ["National rank", String(tw[rkKey(useMetric)] ?? "—")], ["Conference rank", `${cr?.[useMetric] ?? "—"} of ${cr?.size ?? "—"}`], ["SP+", fmt(tw.sp)]] });
      by.set(c, g);
    }
    const mean = (g: StripGroup) => g.dots.reduce((s, d) => s + d.value, 0) / g.dots.length;
    return [...by.values()].filter((g) => !route.conf || g.id === route.conf).sort((a, b) => (mm.lowerBetter ? mean(a) - mean(b) : mean(b) - mean(a)));
  }, [rows, useMetric, crs, route.conf]);

  const stats: ConfStat[] = useMemo(() => groups.map((g) => {
    const v = g.dots.map((d) => d.value);
    const sorted = [...v].sort((a, b) => a - b);
    const med = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const best = [...g.dots].sort((a, b) => (mm.lowerBetter ? a.value - b.value : b.value - a.value))[0];
    const worst = [...g.dots].sort((a, b) => (mm.lowerBetter ? b.value - a.value : a.value - b.value))[0];
    const top25 = rows.filter((r) => (r.tw.conf ?? "No conference") === g.id && (r.tw[rkKey(useMetric)] ?? 999) <= 25).length;
    return { conf: g.id, n: v.length, mean: v.reduce((s, x) => s + x, 0) / v.length, median: med, best: { name: best.name, v: best.value }, worst: { name: worst.name, v: worst.value }, top25 };
  }), [groups, rows, useMetric, mm.lowerBetter]);

  const natMean = useMemo(() => { const v = rows.map((r) => r.tw[useMetric]).filter((x): x is number => x != null); return v.reduce((s, x) => s + x, 0) / Math.max(v.length, 1); }, [rows, useMetric]);
  const sel = route.team ? model.byId.get(route.team) : undefined;
  const selTw = sel?.weeks[week];
  const selCr = sel ? crs.get(sel.id) : undefined;

  const notes: string[] = [];
  if (stats.length > 1) {
    const top = stats[0];
    notes.push(`${top.conf} has the ${mm.lowerBetter ? "lowest" : "highest"} average ${mm.label} (${fmt(top.mean)}) across ${top.n} teams, led by ${top.best.name} (${fmt(top.best.v)}).`);
    const spread = [...stats].filter((s) => s.n >= 4).sort((a, b) => Math.abs(b.best.v - b.worst.v) - Math.abs(a.best.v - a.worst.v))[0];
    if (spread) notes.push(`Widest spread inside a conference: ${spread.conf}, from ${spread.worst.name} (${fmt(spread.worst.v)}) to ${spread.best.name} (${fmt(spread.best.v)}).`);
    const t25 = [...stats].sort((a, b) => b.top25 - a.top25)[0];
    if (t25.top25 > 0) notes.push(`${t25.conf} puts ${t25.top25} teams in the division's top 25 by ${mm.label}.`);
  }
  if (sel && selTw && selCr) notes.push(`${sel.name}: ${ord(selTw[rkKey(useMetric)])} nationally and ${ord(selCr[useMetric])} of ${selCr.size} in the ${selTw.conf}.`);

  const cols: Col<ConfStat>[] = [
    { key: "c", label: "Conference", get: (s) => s.conf, render: (s) => <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: confColor(s.conf) }} /><ConfLogo conf={s.conf} size={20} />{s.conf}</span> },
    { key: "n", label: "Teams", align: "r", first: "desc", get: (s) => s.n },
    { key: "mean", label: `Mean ${mm.label}`, align: "r", first: mm.lowerBetter ? "asc" : "desc", get: (s) => s.mean, render: (s) => fmt(s.mean) },
    { key: "med", label: "Median", align: "r", first: mm.lowerBetter ? "asc" : "desc", get: (s) => s.median, render: (s) => fmt(s.median) },
    { key: "best", label: "Best", get: (s) => s.best.v, render: (s) => `${s.best.name} ${fmt(s.best.v)}` },
    { key: "worst", label: "Worst", get: (s) => s.worst.v, render: (s) => `${s.worst.name} ${fmt(s.worst.v)}` },
    { key: "t25", label: "In top 25", align: "r", first: "desc", get: (s) => s.top25 },
  ];

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div><h2>{mm.label} by conference</h2><p className="sub" style={{ margin: 0 }}>{DIV_LABEL[div]} · week {week} · every team is a dot · rows ordered by conference mean <Derived why="Mean and median computed from the team values" /></p></div>
          <div className="seg" role="group" aria-label="Rating">
            {METRICS.filter((m) => m.key !== "st" || div === "FBS").map((m) => <button key={m.key} type="button" aria-pressed={m.key === useMetric} onClick={() => nav({ p: { metric: m.key === "sp" ? null : m.key } }, { replace: true })}>{m.label}</button>)}
          </div>
        </div>
        <StripPlot groups={groups} selected={route.team || null} onSelect={(id) => { nav({ team: id }, { replace: true }); setPopup(id); }} axisTitle={`${mm.long}${mm.lowerBetter ? " · axis reversed, right is better" : ""}`} lowerBetter={mm.lowerBetter} natMean={natMean} ariaLabel={`${mm.label} by conference`} />
        {sel && selTw && <p className="note-box" style={{ marginTop: 8 }}>Selected: <TeamLink team={sel} size={18} /> · {selTw.conf} · {mm.label} {fmt(selTw[useMetric])}</p>}
        <Notes items={notes} />
      </div>
      {popup && model.byId.get(popup) && (() => {
        const t = model.byId.get(popup)!, tw = t.weeks[week], cr = crs.get(t.id);
        return (
          <div className="team-pop-back" onClick={() => setPopup(null)}>
            <div className="team-pop" role="dialog" aria-modal="true" aria-label={`${t.name} profile`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && setPopup(null)}>
              <button type="button" className="team-pop-x" aria-label="Close" onClick={() => setPopup(null)} autoFocus>×</button>
              <div className="team-pop-head"><Mark team={t} size={44} /><div><h3>{t.name}</h3><p className="sub" style={{ margin: 0 }}><ConfLogo conf={tw?.conf} size={18} /> {tw?.conf ?? "No conference"}{tw?.record ? ` · ${tw.record.text}` : ""}</p></div></div>
              <dl className="team-pop-grid">
                <div><dt>SP+ rating</dt><dd>{fmt(tw?.sp)} <span className="muted">#{tw?.spRk ?? "—"}</span></dd></div>
                <div><dt>Offense</dt><dd>{fmt(tw?.off)} <span className="muted">#{tw?.offRk ?? "—"}</span></dd></div>
                <div><dt>Defense</dt><dd>{fmt(tw?.def)} <span className="muted">#{tw?.defRk ?? "—"}</span></dd></div>
                <div><dt>Special teams</dt><dd>{fmt(tw?.st)} <span className="muted">#{tw?.stRk ?? "—"}</span></dd></div>
                <div><dt>In the conference</dt><dd>{cr ? `${cr.sp} of ${cr.size}` : "—"}</dd></div>
                <div><dt>Week</dt><dd>{week}</dd></div>
              </dl>
              <div className="team-pop-actions"><button type="button" className="primary" onClick={() => { setPopup(null); nav({ view: "team", team: t.id }); }}>Open full profile</button><button type="button" onClick={() => setPopup(null)}>Close</button></div>
            </div>
          </div>
        );
      })()}
      <div className="panel">
        <h2>Conference summary</h2>
        <SortTable label="Conference summary" cols={cols} rows={stats} rowKey={(s) => s.conf} onRowClick={(s) => nav({ conf: route.conf === s.conf ? "" : s.conf }, { replace: true })} selected={route.conf}
          sort={{ key: route.p.sort || "mean", dir: (route.p.dir as "asc" | "desc") || (mm.lowerBetter ? "asc" : "desc"), set: (key, dir) => nav({ p: { sort: key, dir } }, { replace: true }) }} />
      </div>
    </div>
  );
}
