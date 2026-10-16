import { useMemo } from "react";
import { useNfl } from "../useNfl";
import { useNflRoute } from "../store";
import { ratingsAt, teamRows, type TeamRow } from "../model";
import { NflTeamLink, Notes } from "../common";
import { SortTable, type Col } from "../../spplus/components/SortTable";
import { Spark } from "../../spplus/charts/Spark";
import { fmt, ord } from "../../spplus/data/derive";
import { ConfLogo } from "../../ConfMark";

type Metric = "sp" | "off" | "def" | "st";
const METRICS: { key: Metric; label: string; long: string; idx: 0 | 1 | 2 | 3; low: boolean }[] = [
  { key: "sp", label: "Rating", long: "Overall rating (points better than average per game)", idx: 0, low: false },
  { key: "off", label: "Off", long: "Offense: points per game against an average defense", idx: 1, low: false },
  { key: "def", label: "Def", long: "Defense: points allowed per game against an average offense (lower is better)", idx: 2, low: true },
  { key: "st", label: "ST", long: "Special teams: points per game", idx: 3, low: false },
];

function Bar({ v, domain, low }: { v: number; domain: [number, number]; low: boolean }) {
  const [lo, hi] = domain, span = hi - lo || 1;
  const zero = ((0 - lo) / span) * 100, pos = ((v - lo) / span) * 100;
  const good = low ? v <= 0 : v >= 0;
  return (
    <div className="rbar" role="img" aria-label={fmt(v)}>
      <i className={good ? "" : "neg"} style={{ left: `${Math.min(zero, pos)}%`, width: `${Math.max(Math.abs(pos - zero), 0.8)}%`, right: "auto", borderRadius: 3 }} />
      <b className="num">{fmt(v)}</b>
    </div>
  );
}

export default function Ratings() {
  const { data } = useNfl();
  const [route, nav] = useNflRoute();
  if (!data) return null;
  const week = route.week ?? data.ratingsThroughWeek;
  const metric = (route.p.metric as Metric) || "sp";
  const mm = METRICS.find((m) => m.key === metric)!;
  const all = useMemo(() => teamRows(data, week), [data, week]);
  const rows = useMemo(() => all.filter((r) => (!route.group || r.conf === route.group || r.div === route.group) && (!route.q || r.name.toLowerCase().includes(route.q.toLowerCase()))), [all, route.group, route.q]);
  // For the bars, ratings are shown relative to the league average of the metric so a defense of 20 reads as good.
  const avg = (i: 0 | 1 | 2 | 3) => all.reduce((s, r) => s + r.r[i], 0) / Math.max(all.length, 1);
  const rel = (r: TeamRow, i: 0 | 1 | 2 | 3) => r.r[i] - (i === 1 || i === 2 ? avg(i) : 0);
  const domain = useMemo(() => { const v = all.map((r) => rel(r, mm.idx)); return [Math.min(0, ...v), Math.max(0, ...v)] as [number, number]; }, [all, mm.idx]);
  const rkOf = (r: TeamRow) => r.rank[metric];

  const cols: Col<TeamRow>[] = [
    { key: "rk", label: "Rank", align: "r", get: rkOf, render: (r) => <span className="num">{rkOf(r)}</span> },
    { key: "team", label: "Team", get: (r) => r.name, render: (r) => <NflTeamLink abbr={r.abbr} /> },
    { key: "conf", label: "Conference", get: (r) => r.conf, render: (r) => <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><ConfLogo conf={r.conf} size={20} />{r.conf} <span className="muted">· {r.confRank}/{all.filter((x) => x.conf === r.conf).length}</span></span> },
    { key: "div", label: "Division", hideSm: true, get: (r) => r.div, render: (r) => <span>{r.div} <span className="muted">· {r.divRank}/{all.filter((x) => x.div === r.div).length}</span></span> },
    { key: "rec", label: "Record", hideSm: true, get: (r) => r.rec.w - r.rec.l, first: "desc", render: (r) => <span className="num">{r.rec.w}-{r.rec.l}{r.rec.t ? `-${r.rec.t}` : ""}</span> },
    { key: "val", label: mm.label, title: mm.long, first: mm.low ? "asc" : "desc", get: (r) => rel(r, mm.idx), render: (r) => <Bar v={rel(r, mm.idx)} domain={domain} low={mm.low} /> },
    ...METRICS.filter((m) => m.key !== metric).map((m) => ({ key: m.key, hideSm: true, label: m.label, title: m.long, align: "r" as const, get: (r: TeamRow) => rel(r, m.idx), render: (r: TeamRow) => <span>{fmt(rel(r, m.idx))}<span className="muted"> #{r.rank[m.key]}</span></span> })),
    { key: "chg", label: "Δ rank", hideSm: true, align: "r", get: (r) => (r.prev == null ? null : r.prev - r.rank.sp), render: (r) => (r.prev == null ? <span className="muted">—</span> : <span className={`delta ${r.prev > r.rank.sp ? "up" : r.prev < r.rank.sp ? "down" : "flat"}`}>{r.prev > r.rank.sp ? "▲" : r.prev < r.rank.sp ? "▼" : "–"} {Math.abs(r.prev - r.rank.sp)}</span>) },
    { key: "trend", label: "By week", hideSm: true, get: () => null, render: (r) => <Spark values={Array.from({ length: data.ratingsThroughWeek }, (_, i) => ratingsAt(data, r.abbr, i + 1)?.[0] ?? null)} label={`${r.name} rating by week`} /> },
  ];

  const notes = useMemo(() => {
    const out: string[] = [];
    const up = [...all].filter((r) => r.prev != null).sort((a, b) => (b.prev! - b.rank.sp) - (a.prev! - a.rank.sp));
    if (up[0] && up[0].prev! > up[0].rank.sp) out.push(`Biggest climb into week ${week}: ${up[0].name} up ${up[0].prev! - up[0].rank.sp} to ${ord(up[0].rank.sp)} (was ${ord(up[0].prev)}).`);
    const dn = up[up.length - 1];
    if (dn && dn.prev! < dn.rank.sp) out.push(`Biggest drop: ${dn.name} down ${dn.rank.sp - dn.prev!} to ${ord(dn.rank.sp)}.`);
    const lop = [...all].sort((a, b) => Math.abs(b.rank.off - b.rank.def) - Math.abs(a.rank.off - a.rank.def))[0];
    if (lop) out.push(`Most lopsided: ${lop.name} is ${ord(lop.rank.off)} on offense and ${ord(lop.rank.def)} on defense.`);
    return out;
  }, [all, week]);

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div>
            <h2>NFL team ratings{route.group ? ` · ${route.group}` : ""}</h2>
            <p className="sub" style={{ margin: 0 }}>Ratings before week {week} games · {rows.length} of {all.length} teams · from nflverse play-by-play: opponent-adjusted EPA per play, in points per game{mm.low ? "; lower is better" : ""}</p>
          </div>
          <div className="seg" role="group" aria-label="Rating shown in the bars">
            {METRICS.map((m) => <button key={m.key} type="button" aria-pressed={m.key === metric} onClick={() => nav({ p: { metric: m.key === "sp" ? null : m.key, sort: null, dir: null } })}>{m.label}</button>)}
          </div>
        </div>
        <SortTable label="NFL ratings table" cols={cols} rows={rows} rowKey={(r) => r.abbr} selected={route.team}
          sort={{ key: route.p.sort || "rk", dir: (route.p.dir as "asc" | "desc") || "asc", set: (key, dir) => nav({ p: { sort: key, dir } }) }}
          expand={(r) => (
            <dl className="kv">
              <div><dt>Rating / rank</dt><dd>{fmt(r.r[0])} / {r.rank.sp}</dd></div>
              <div><dt>Offense / rank</dt><dd>{fmt(r.r[1])} / {r.rank.off}</dd></div>
              <div><dt>Defense / rank</dt><dd>{fmt(r.r[2])} / {r.rank.def}</dd></div>
              <div><dt>Special teams / rank</dt><dd>{fmt(r.r[3])} / {r.rank.st}</dd></div>
              <div><dt>Conference rank</dt><dd><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><ConfLogo conf={r.conf} size={20} />{r.confRank} of {all.filter((x) => x.conf === r.conf).length} in the {r.conf}</span></dd></div>
              <div><dt>Division rank</dt><dd>{r.divRank} of 4 in the {r.div}</dd></div>
              <div><dt>Record before week {week}</dt><dd>{r.rec.w}-{r.rec.l}{r.rec.t ? `-${r.rec.t}` : ""}</dd></div>
              <div><dt></dt><dd><button type="button" className="btn small" onClick={() => nav({ view: "team", team: r.abbr })}>Open team</button> <button type="button" className="btn small" onClick={() => nav({ view: "simulator", p: { a: r.abbr } })}>Simulate a game</button></dd></div>
            </dl>
          )} />
        <p className="sub" style={{ marginTop: 8 }}>Rating = offense − defense + special teams, each in points per game against an average opponent. Offense and defense show how far from the league average they are. Before week 1 the ratings are last season's, pulled halfway back toward average.</p>
        <Notes items={notes} />
      </div>
    </div>
  );
}
