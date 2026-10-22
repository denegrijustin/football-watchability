import { useMemo } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { conferenceRanks, fmt, fmtSigned, metricMeta, METRICS, ord, percentile, resolveWeek, rkKey, rowsFor, type Metric, type Row } from "../data/derive";
import { Derived, CompareToggle, Notes, TeamLink } from "../components/common";
import { SortTable, type Col } from "../components/SortTable";
import { Spark } from "../charts/Spark";
import { confColor } from "../charts/kit";
import { ConfLogo, hasConfLogo } from "../../ConfMark";
import { DIV_LABEL, type DivKey, type Team, type TeamWeek, type TopRow } from "../data/types";

type R = { id: string; team: Team; tw: TeamWeek | null; top: TopRow | null; confRank: ReturnType<typeof conferenceRanks> extends Map<string, infer V> ? V | undefined : never };

function RatingBar({ value, domain, lowerBetter, text }: { value: number | null; domain: [number, number]; lowerBetter: boolean; text: string }) {
  if (value == null) return <span className="muted">—</span>;
  const [lo, hi] = domain, span = hi - lo || 1;
  const zero = ((0 - lo) / span) * 100;
  const pos = ((value - lo) / span) * 100;
  const left = Math.min(zero, pos), width = Math.abs(pos - zero);
  const good = lowerBetter ? value <= 0 : value >= 0;
  return (
    <div className="rbar" role="img" aria-label={text}>
      <i className={good ? "" : "neg"} style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%`, right: "auto", borderRadius: 3 }} />
      <b className="num">{text}</b>
    </div>
  );
}

export default function Rankings() {
  const { model } = useData();
  const [route, nav] = useRoute();
  if (!model) return null;
  const week = resolveWeek(model, route.week);
  const metric = (route.p.metric as Metric) || "sp";
  const mm = metricMeta(metric);
  const all = route.div === "ALL";
  const div: DivKey = route.div === "ALL" ? "FBS" : route.div;
  const sortKey = route.p.sort || "rk";
  const sortDir = (route.p.dir as "asc" | "desc") || "asc";

  const built = useMemo(() => {
    if (all) {
      const rows: R[] = [];
      for (const t of model.teams) { const top = t.top[week]; if (top) rows.push({ id: t.id, team: t, tw: t.weeks[week] ?? null, top, confRank: undefined }); }
      return rows;
    }
    const base = rowsFor(model, div, week);
    const cr = conferenceRanks(base);
    return base.map((r: Row): R => ({ id: r.team.id, team: r.team, tw: r.tw, top: null, confRank: cr.get(r.team.id) }));
  }, [model, all, div, week]);

  const rows = useMemo(() => {
    const q = route.q.trim().toLowerCase();
    return built.filter((r) => (!q || r.team.name.toLowerCase().includes(q)) && (!route.conf || (r.tw?.conf ?? r.top?.conf) === route.conf));
  }, [built, route.q, route.conf]);

  const val = (r: R, m: Metric) => (all ? r.top?.[m as "sp" | "off" | "def"] ?? null : r.tw?.[m] ?? null);
  const rk = (r: R, m: Metric) => (all ? r.top?.[rkKey(m) as "spRk" | "offRk" | "defRk"] ?? null : r.tw?.[rkKey(m)] ?? null);
  const domain: [number, number] = useMemo(() => {
    const v = built.map((r) => val(r, metric)).filter((x): x is number => x != null);
    return [Math.min(0, ...v), Math.max(0, ...v)];
  }, [built, metric, all]);
  const n = built.length;
  const hasSt = !all && div === "FBS";
  const metricsAvail = METRICS.filter((m) => (all ? m.key !== "st" : m.key !== "st" || hasSt));
  const metricUse: Metric = metricsAvail.some((m) => m.key === metric) ? metric : "sp";

  const cols: Col<R>[] = [
    { key: "rk", label: "Nat. rank", title: all ? "Rank on the 772-team list (source)" : `${div} rank in the sheet`, align: "r", get: (r) => rk(r, metricUse), render: (r) => <span className="num">{rk(r, metricUse) ?? "—"}</span> },
    ...(!all ? [{ key: "crk", label: "Conf. rank", title: "Rank within the conference, computed from the same rating", align: "r" as const, get: (r: R) => r.confRank?.[metricUse] ?? null, render: (r: R) => (r.confRank?.[metricUse] != null ? <span className="num">{r.confRank[metricUse]}<span className="muted">/{r.confRank.size}</span></span> : "—") }] : []),
    { key: "team", label: "Team", get: (r) => r.team.name, render: (r) => <TeamLink team={r.team} /> },
    { key: "conf", hideSm: true, label: "Conf.", get: (r) => r.tw?.conf ?? r.top?.conf ?? null, render: (r) => { const c = r.tw?.conf ?? r.top?.conf ?? null; return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{c ? <>{hasConfLogo(c, r.team.division) ? <ConfLogo conf={c} division={r.team.division} size={18} /> : <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: confColor(c) }} />}{c}</> : "—"}</span>; } },
    ...(all ? [{ key: "div", hideSm: true, label: "Div.", get: (r: R) => r.top?.division ?? null, render: (r: R) => <>{r.top?.division ?? "—"} <Derived why="Matched by team name to the division tabs" /></> }] : []),
    { key: "rec", hideSm: true, label: "Rec.", get: (r) => (all ? r.top?.record?.text : r.tw?.record?.text) ?? null, render: (r) => { const rec = all ? r.top?.record : r.tw?.record; return rec ? <span className="num" title={rec.recovered ? `The sheet stores this as the date ${rec.sourceDate}; read back as ${rec.text}` : undefined}>{rec.text}{rec.recovered && <sup className="muted">*</sup>}</span> : <span className="muted">—</span>; } },
    { key: "val", label: mm.label, title: mm.long, first: mm.lowerBetter ? "asc" : "desc", get: (r) => val(r, metricUse), render: (r) => <RatingBar value={val(r, metricUse)} domain={domain} lowerBetter={mm.lowerBetter} text={fmt(val(r, metricUse))} /> },
    ...(["off", "def", ...(hasSt ? ["st"] : [])] as Metric[]).filter((m) => m !== metricUse).map((m) => ({ key: m, hideSm: true, label: metricMeta(m).label, title: metricMeta(m).long, align: "r" as const, get: (r: R) => val(r, m), render: (r: R) => <span>{fmt(val(r, m))}<span className="muted"> #{rk(r, m) ?? "—"}</span></span> })),
    ...(metricUse !== "sp" ? [{ key: "sp", hideSm: true, label: "SP+", title: "Overall SP+", align: "r" as const, get: (r: R) => val(r, "sp"), render: (r: R) => <span>{fmt(val(r, "sp"))}<span className="muted"> #{rk(r, "sp") ?? "—"}</span></span> }] : []),
    ...(!all ? [{ key: "chg", hideSm: true, label: "Δ rank", title: "Change in the division rank since last week (the sheet's LW columns)", align: "r" as const, get: (r: R) => r.tw?.chg ?? null, render: (r: R) => (r.tw?.chg == null ? <span className="muted">—</span> : <span className={`delta ${r.tw.chg > 0 ? "up" : r.tw.chg < 0 ? "down" : "flat"}`}>{r.tw.chg > 0 ? "▲" : r.tw.chg < 0 ? "▼" : "–"} {Math.abs(r.tw.chg)}</span>) }] : []),
    { key: "trend", hideSm: true, label: "SP+ by week", get: () => null, render: (r) => <Spark values={model.weeks.map((w) => (all ? r.team.top[w]?.sp : r.team.weeks[w]?.sp) ?? null)} label={`${r.team.name} SP+ by week`} /> },
  ];

  const notes = useMemo(() => {
    const out: string[] = [];
    if (all || !built.length) return out;
    const wk = built.filter((r) => r.tw?.chg != null);
    const up = wk.reduce<R | null>((m, r) => (m == null || r.tw!.chg! > m.tw!.chg! ? r : m), null);
    const dn = wk.reduce<R | null>((m, r) => (m == null || r.tw!.chg! < m.tw!.chg! ? r : m), null);
    if (up && up.tw!.chg! > 0) out.push(`Biggest climb in week ${week}: ${up.team.name} up ${up.tw!.chg} to ${ord(up.tw!.spRk)} (was ${ord(up.tw!.lastRk)}).`);
    if (dn && dn.tw!.chg! < 0) out.push(`Biggest drop: ${dn.team.name} down ${Math.abs(dn.tw!.chg!)} to ${ord(dn.tw!.spRk)} (was ${ord(dn.tw!.lastRk)}).`);
    const gap = built.filter((r) => r.tw?.offRk != null && r.tw?.defRk != null && (r.tw.spRk ?? 99) <= 40).reduce<R | null>((m, r) => (m == null || Math.abs(r.tw!.offRk! - r.tw!.defRk!) > Math.abs(m.tw!.offRk! - m.tw!.defRk!) ? r : m), null);
    if (gap) {
      const tw = gap.tw!;
      out.push(`Most lopsided top-40 team: ${gap.team.name} is ${ord(tw.offRk)} on offense (${fmt(tw.off)}) and ${ord(tw.defRk)} on defense (${fmt(tw.def)}).`);
    }
    return out;
  }, [built, all, week]);

  const expand = (r: R) => {
    const rows = [r.tw, r.top].filter(Boolean);
    return (
      <div className="stack" style={{ gap: 8 }}>
        {r.tw && (
          <dl className="kv">
            <div><dt>Sheet / row</dt><dd>{r.tw.src.sheet}, row {r.tw.src.row}</dd></div>
            <div><dt>Record</dt><dd>{r.tw.record ? `${r.tw.record.text}${r.tw.record.recovered ? ` (stored as ${r.tw.record.sourceDate})` : ""}` : "—"}</dd></div>
            <div><dt>SP+ / rank</dt><dd>{fmt(r.tw.sp)} / {r.tw.spRk ?? "—"}</dd></div>
            <div><dt>Offense / rank</dt><dd>{fmt(r.tw.off)} / {r.tw.offRk ?? "—"}</dd></div>
            <div><dt>Defense / rank</dt><dd>{fmt(r.tw.def)} / {r.tw.defRk ?? "—"}</dd></div>
            <div><dt>Special teams / rank</dt><dd>{r.tw.st == null ? "—" : `${fmt(r.tw.st)} / ${r.tw.stRk ?? "—"}`}</dd></div>
            <div><dt>Percentile (source)</dt><dd>{r.tw.pctile == null ? "—" : r.tw.pctile}</dd></div>
            <div><dt>Last week rank</dt><dd>{r.tw.lastRk ?? "—"}</dd></div>
            <div><dt>Rank change</dt><dd>{r.tw.chg == null ? "—" : fmtSigned(r.tw.chg, 0)}</dd></div>
            <div><dt>Derived percentile <Derived why="(N − rank) ÷ (N − 1) within the division" /></dt><dd>{(() => { const p = percentile(r.tw.spRk, n); return p == null ? "—" : `${p}`; })()}</dd></div>
          </dl>
        )}
        {r.top && r.team && (
          <dl className="kv">
            <div><dt>772 list / row</dt><dd>{r.top.src.sheet}, row {r.top.src.row}</dd></div>
            <div><dt>772 SP+ / rank</dt><dd>{fmt(r.top.sp)} / {r.top.spRk ?? "—"}</dd></div>
            <div><dt>772 offense / rank</dt><dd>{fmt(r.top.off)} / {r.top.offRk ?? "—"}</dd></div>
            <div><dt>772 defense / rank</dt><dd>{fmt(r.top.def)} / {r.top.defRk ?? "—"}</dd></div>
          </dl>
        )}
        {!all && r.team.top[week] && <p className="sub" style={{ margin: 0 }}>On the 772-team list: {fmt(r.team.top[week].sp)} SP+, rank {r.team.top[week].spRk} <span className="tag">different scale</span></p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><CompareToggle id={r.team.id} /><button type="button" className="btn small" onClick={() => nav({ view: "team", team: r.team.id })}>Open team</button>{r.team.division === "FBS" && <button type="button" className="btn small" onClick={() => nav({ view: "simulator", p: { a: r.team.id } })}>Simulate a game</button>}</div>
        {rows.length === 0 && null}
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div>
            <h2>{all ? "SP+ rank, all 772 teams" : `${DIV_LABEL[div]} SP+ ranking`}{route.conf ? ` · ${route.conf}` : ""}</h2>
            <p className="sub" style={{ margin: 0 }}>Week {week} · {rows.length} of {built.length} teams · bars show {mm.key === "sp" ? "overall SP+" : mm.long.replace(/ \(.*\)/, "")}{mm.lowerBetter ? "; lower is better, lowest first" : ""}</p>
          </div>
          <div className="seg" role="group" aria-label="Rating shown in the bars">
            {metricsAvail.map((m) => <button key={m.key} type="button" aria-pressed={m.key === metricUse} onClick={() => nav({ p: { metric: m.key === "sp" ? null : m.key, sort: null, dir: null } }, { replace: true })}>{m.label}</button>)}
          </div>
        </div>
        {rows.length === 0 ? <p className="empty">No teams match these filters.</p> : (
          <SortTable
            label="Ranking table"
            cols={cols}
            rows={rows}
            rowKey={(r) => r.id}
            expand={expand}
            selected={route.team}
            sort={{ key: sortKey === "rk" || !cols.some((c) => c.key === sortKey) ? "rk" : sortKey, dir: sortDir, set: (key, dir) => nav({ p: { sort: key, dir } }, { replace: true }) }}
          />
        )}
        <p className="sub" style={{ marginTop: 8 }}>
          Source columns: SP+, Off., Def., ST with their ranks{!all && ", LW (last week's rank) and LW Rk (the change)"}. Lower defense numbers are better. National rank is the sheet's; conference rank is computed <Derived why="Rank among the same conference's teams, from the same rating" />. <span className="muted">* Record stored as a date in the sheet and read back.</span>
        </p>
        <Notes items={notes} />
      </div>
    </div>
  );
}
