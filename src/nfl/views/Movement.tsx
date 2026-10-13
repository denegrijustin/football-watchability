import { useMemo, useState } from "react";
import { useNfl } from "../useNfl";
import { useNflRoute } from "../store";
import { ratingsAt, teamRows } from "../model";
import { LinesChart, SeriesPicker, type LineSeries } from "../../spplus/charts/Lines";
import { C } from "../../spplus/charts/kit";
import { fmt, fmtSigned, ord } from "../../spplus/data/derive";
import { Notes, NflTeamLink } from "../common";

export default function Movement() {
  const { data } = useNfl();
  const [route, nav] = useNflRoute();
  const [active, setActive] = useState<string | null>(null);
  if (!data) return null;
  const last = data.ratingsThroughWeek;
  const weeks = Array.from({ length: last }, (_, i) => i + 1);
  const rows = useMemo(() => teamRows(data, last), [data, last]);
  const chosen = useMemo(() => {
    let list = rows.filter((r) => !route.group || r.conf === route.group || r.div === route.group);
    list = [...list].sort((a, b) => a.rank.sp - b.rank.sp);
    if (!route.group) list = list.slice(0, Number(route.p.n) || 12);
    const keep = new Set(list.map((r) => r.abbr));
    if (route.team && !keep.has(route.team)) { const t = rows.find((r) => r.abbr === route.team); if (t) list.push(t); }
    return list;
  }, [rows, route.group, route.team, route.p.n]);

  const colorOf = (abbr: string) => (abbr === route.team ? C.ink : data.teams[abbr].conf === "AFC" ? C.s[0] : C.s[1]);
  const rankSeries = useMemo<LineSeries[]>(() => {
    const raw = chosen.map((r) => ({ r, v: weeks.map((w) => { const x = ratingsAt(data, r.abbr, w); return x ? x[0] : null; }) }));
    return raw.map(({ r, v }) => ({
      id: r.abbr, label: r.name, color: colorOf(r.abbr),
      // Bump order: each week the shown teams are lined up by rating (the circles keep the league rank).
      values: v.map((x, wi) => (x == null ? null : 1 + raw.filter((o) => o.v[wi] != null && (o.v[wi] as number) > x).length)),
    }));
  }, [chosen, data, route.team]);
  const leagueRank = (abbr: string, w: number) => teamRows(data, w).find((r) => r.abbr === abbr)?.rank.sp ?? null;
  const ratingSeries = useMemo<LineSeries[]>(() => chosen.map((r) => ({ id: r.abbr, label: r.name, color: colorOf(r.abbr), values: weeks.map((w) => ratingsAt(data, r.abbr, w)?.[0] ?? null) })), [chosen, data, route.team]);

  // Net change from the first week to the latest, for all 32 teams.
  const movers = useMemo(() => {
    const first = teamRows(data, 1);
    return rows.map((r) => ({ r, a: first.find((x) => x.abbr === r.abbr)?.rank.sp ?? null })).filter((m) => m.a != null).map((m) => ({ ...m, d: (m.a as number) - m.r.rank.sp })).sort((x, y) => y.d - x.d);
  }, [rows, data]);
  const notes: string[] = [];
  if (movers[0] && movers[0].d > 0) notes.push(`${movers[0].r.name} climbed ${movers[0].d} spots since week 1 (${ord(movers[0].a)} to ${ord(movers[0].r.rank.sp)}).`);
  const fell = movers[movers.length - 1];
  if (fell && fell.d < 0) notes.push(`${fell.r.name} fell ${Math.abs(fell.d)} spots (${ord(fell.a)} to ${ord(fell.r.rank.sp)}).`);
  const pick = (id: string) => nav({ team: route.team === id ? "" : id });

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div><h2>Rating rank by week{route.group ? ` · ${route.group}` : ""}</h2><p className="sub" style={{ margin: 0 }}>Weeks 1–{last} · {chosen.length} teams · circles show the league rank · AFC blue, NFC orange · tap a line or name to pin it</p></div>
          {!route.group && <div className="seg" role="group" aria-label="Teams shown">{[8, 12, 20].map((k) => <button key={k} type="button" aria-pressed={(Number(route.p.n) || 12) === k} onClick={() => nav({ p: { n: k === 12 ? null : String(k) } })}>Top {k}</button>)}</div>}
        </div>
        <LinesChart xs={weeks} xLabel={(x) => `Wk ${x}`} series={rankSeries} height={Math.max(300, Math.min(560, chosen.length * 30 + 60))} invertY yDomain={[1, Math.max(2, chosen.length)]} yTicks={[]} yTitle="Higher = better rank. Circles show the league rank"
          pointText={(_v, s, xi) => String(leagueRank(s.id, weeks[xi]) ?? "")} endLabels activeId={active} pickedId={route.team || null} onActive={setActive} onPick={pick}
          tipRows={(xi, s) => { const r = ratingsAt(data, s.id, weeks[xi]); return [["League rank", ord(leagueRank(s.id, weeks[xi]))], ["Rating", fmt(r?.[0])], ["Offense", fmt(r?.[1])], ["Defense", fmt(r?.[2])]]; }} ariaLabel="Bump chart of rating rank by week" />
        <SeriesPicker series={rankSeries} activeId={active} pickedId={route.team || null} onActive={setActive} onPick={pick} />
        <Notes items={notes} />
      </div>
      <div className="grid2" style={{ ["--cols" as string]: "minmax(0,1.6fr) minmax(0,1fr)" } as React.CSSProperties}>
        <div className="panel"><h2>Rating by week</h2><p className="sub">Points per game better than average · higher is better</p>
          <LinesChart xs={weeks} xLabel={(x) => `Wk ${x}`} series={ratingSeries} height={260} yTitle="Rating" yFormat={(v) => v.toFixed(0)} activeId={active} pickedId={route.team || null} onActive={setActive} onPick={pick}
            tipRows={(xi, s) => [["Rating", fmtSigned(ratingsAt(data, s.id, weeks[xi])?.[0])]]} ariaLabel="Line chart of rating by week" /></div>
        <div className="panel"><h2>Biggest movers</h2><p className="sub">League-rank change, week 1 to {last}</p>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Team</th><th className="r">Wk 1</th><th className="r">Wk {last}</th><th className="r">Net</th></tr></thead>
            <tbody>{[...movers.slice(0, 5), ...movers.slice(-5)].map((m, i) => <tr key={m.r.abbr} style={i === 5 ? { borderTop: "2px solid var(--axis)" } : undefined}><td><NflTeamLink abbr={m.r.abbr} size={18} /></td><td className="r num">{m.a}</td><td className="r num">{m.r.rank.sp}</td><td className={`r num delta ${m.d > 0 ? "up" : m.d < 0 ? "down" : "flat"}`}>{m.d > 0 ? "▲" : m.d < 0 ? "▼" : "–"} {Math.abs(m.d)}</td></tr>)}</tbody></table></div></div>
      </div>
    </div>
  );
}
