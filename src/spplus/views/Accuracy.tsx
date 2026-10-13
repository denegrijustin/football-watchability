import { useMemo, useState } from "react";
import { useData } from "../data/useData";
import { fmt, fmtPct } from "../data/derive";
import { sumRecords as sum } from "../data/checks";
import { Derived, Notes } from "../components/common";
import { LinesChart, type LineSeries } from "../charts/Lines";
import { C } from "../charts/kit";
import type { PerfRow } from "../data/types";

const order = ["0-1", ...Array.from({ length: 15 }, (_, i) => String(i + 2)), "Postseason"];
export default function Accuracy() {
  const { model, snapshot } = useData();
  const [active, setActive] = useState<string | null>(null);
  if (!model) return null;
  const cur = model.perf.filter((p) => p.section === "fbs-fbs" && !p.total && /^(0-1|\d+)$/.test(p.week) && p.ats);
  const curTotal = model.perf.find((p) => p.section === "fbs-fbs" && p.total);
  const last = model.perf.filter((p) => p.section === "last-year");
  const lastRows = last.filter((p) => !p.total && p.ats);
  const lastTotal = last.find((p) => p.total);
  const fcs = model.perf.filter((p) => p.section === "fbs-fcs");
  const link = useMemo(() => {
    const sh = snapshot?.sheets.find((s) => s.name === "SP+ performance");
    for (const r of sh?.rows ?? []) for (const c of r) if (c && typeof c === "object" && "link" in c) return c;
    return null;
  }, [snapshot]);

  const pick = (rows: PerfRow[], f: (r: PerfRow) => number | null) => order.map((w) => { const r = rows.find((x) => x.week === w); return r ? f(r) : null; });
  const xs = order.map((_, i) => i);
  const lab = (i: number) => (order[i] === "Postseason" ? "Post" : order[i]);
  const pctSeries: LineSeries[] = [
    { id: "ats26", label: "ATS 2026", color: C.s[0], values: pick(cur, (r) => r.atsPct) },
    { id: "ou26", label: "Over/under 2026", color: C.s[1], values: pick(cur, (r) => r.ouPct) },
    { id: "ats25", label: "ATS last year", color: C.s[0], dash: true, values: pick(lastRows, (r) => r.atsPct) },
    { id: "ou25", label: "Over/under last year", color: C.s[1], dash: true, values: pick(lastRows, (r) => r.ouPct) },
  ];
  const errSeries: LineSeries[] = [
    { id: "a26", label: "Spread: abs. error 2026", color: C.s[0], values: pick(cur, (r) => r.atsAbs) },
    { id: "m26", label: "Spread: median error 2026", color: C.s[2], values: pick(cur, (r) => r.atsMed) },
    { id: "t26", label: "Total: abs. error 2026", color: C.s[1], values: pick(cur, (r) => r.ouAbs) },
    { id: "tm26", label: "Total: median error 2026", color: C.s[3], values: pick(cur, (r) => r.ouMed) },
  ];
  const rowAt = (rows: PerfRow[], xi: number) => rows.find((r) => r.week === order[xi]);

  const checks = [
    curTotal && { label: "2026 ATS total", sheet: curTotal.ats, calc: sum(cur, "ats").text },
    curTotal && { label: "2026 over/under total", sheet: curTotal.ou, calc: sum(cur, "ou").text },
    lastTotal && { label: "Last year ATS total", sheet: lastTotal.ats, calc: sum(lastRows, "ats").text },
    lastTotal && { label: "Last year over/under total", sheet: lastTotal.ou, calc: sum(lastRows, "ou").text },
  ].filter(Boolean) as { label: string; sheet: string | null; calc: string }[];
  const mismatches = checks.filter((c) => c.sheet !== c.calc);

  const notes: string[] = [];
  if (curTotal) {
    notes.push(`2026 through week ${cur[cur.length - 1]?.week}: SP+ has covered ${fmtPct(curTotal.atsPct, 1)} against the early-week spread (abs. error ${fmt(curTotal.atsAbs)}, median ${fmt(curTotal.atsMed)}) and ${fmtPct(curTotal.ouPct, 1)} on over/unders.`);
    const best = [...cur].sort((a, b) => (b.atsPct ?? 0) - (a.atsPct ?? 0))[0], worst = [...cur].sort((a, b) => (a.ouPct ?? 1) - (b.ouPct ?? 1))[0];
    if (best) notes.push(`Best ATS week: ${best.week} at ${fmtPct(best.atsPct, 1)} (${best.ats}). Weakest over/under week: ${worst.week} at ${fmtPct(worst.ouPct, 1)} (${worst.ou}).`);
  }
  for (const m of mismatches) notes.push(`${m.label}: the sheet's total cell reads ${m.sheet}, but the weekly rows add up to ${m.calc}.`);

  const section = (title: string, rows: PerfRow[]) => (
    <div className="panel">
      <h2>{title}</h2>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Week</th><th>ATS record</th><th className="r">ATS %</th><th className="r">Abs. error</th><th className="r">Median error</th><th>Over/under</th><th className="r">O/U %</th><th className="r">Abs. error</th><th className="r">Median error</th><th>Sheet row</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} style={r.total ? { fontWeight: 650 } : undefined}>
            <td>{r.week}</td><td className="num">{r.ats ?? <span className="muted">—</span>}</td><td className="r num">{fmtPct(r.atsPct, 1)}</td><td className="r num">{fmt(r.atsAbs)}</td><td className="r num">{fmt(r.atsMed)}</td>
            <td className="num">{r.ou ?? <span className="muted">—</span>}</td><td className="r num">{fmtPct(r.ouPct, 1)}</td><td className="r num">{fmt(r.ouAbs)}</td><td className="r num">{fmt(r.ouMed)}</td>
            <td className="muted">{r.row}{r.hidden ? " · hidden in the sheet" : ""}</td>
          </tr>))}</tbody>
      </table></div>
    </div>
  );

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead"><div><h2>SP+ against the early-week lines</h2><p className="sub" style={{ margin: 0 }}>FBS vs. FBS games · share of picks right by week · dashed lines are last year's sheet{link ? <> (<a href={link.link} target="_blank" rel="noreferrer noopener">{link.t}</a>)</> : null} · empty weeks have no data yet</p></div></div>
        <LinesChart xs={xs} xLabel={lab} series={pctSeries} height={300} yDomain={[0.3, 0.7]} yTicks={[0.3, 0.4, 0.5, 0.6, 0.7]} yFormat={(v) => `${Math.round(v * 100)}%`} yTitle="Right %" refY={{ v: 0.5, label: "50%" }}
          activeId={active} onActive={setActive}
          tipRows={(xi, s) => { const is26 = s.id.endsWith("26"); const r = rowAt(is26 ? cur : lastRows, xi); const ats = s.id.startsWith("ats"); return r ? [["Record", (ats ? r.ats : r.ou) ?? "—"], ["Right %", fmtPct(ats ? r.atsPct : r.ouPct, 1)], ["Abs. error", fmt(ats ? r.atsAbs : r.ouAbs)], ["Median error", fmt(ats ? r.atsMed : r.ouMed)]] : []; }}
          ariaLabel="Share of ATS and over/under picks correct by week, this season and last" />
        <div className="legend"><span><i style={{ background: C.s[0] }} />ATS</span><span><i style={{ background: C.s[1] }} />Over/under</span><span><i style={{ background: "transparent", border: `2px dashed ${C.muted}` }} />Last year</span></div>
        <Notes items={notes} />
      </div>
      <div className="panel">
        <h2>Average miss by week, 2026</h2>
        <p className="sub">Points between the SP+ number and the result, versus the early-week line. Lower is better.</p>
        <LinesChart xs={xs.slice(0, 7)} xLabel={lab} series={errSeries.map((s) => ({ ...s, values: s.values.slice(0, 7) }))} height={260} yDomain={[0, 16]} yFormat={(v) => String(v)} yTitle="Points" activeId={active} onActive={setActive}
          tipRows={(xi, s) => { const r = rowAt(cur, xi); return r ? [["Abs. error", fmt(s.id.startsWith("t") ? r.ouAbs : r.atsAbs)], ["Median error", fmt(s.id.startsWith("t") ? r.ouMed : r.atsMed)]] : []; }}
          ariaLabel="Average error by week" />
        <div className="legend">{errSeries.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.label}</span>)}</div>
      </div>
      {section("2026 by week (FBS vs. FBS)", model.perf.filter((p) => p.section === "fbs-fbs"))}
      {fcs.length > 0 && section("FBS vs. FCS", fcs)}
      {last.length > 0 && section("Last year (as recorded in this sheet)", last)}
      <p className="sub">Weekly rows come straight from the sheet's “SP+ performance” tab. Records that Sheets stored as dates are read back as W-L <Derived why="Month = wins, day = losses; checked against the % column" />.</p>
    </div>
  );
}
