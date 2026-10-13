import { useMemo, useState } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { fmt, fmtSigned, ord } from "../data/derive";
import { cols2, Derived, Notes, TeamLink } from "../components/common";
import { LinesChart, SeriesPicker, type LineSeries } from "../charts/Lines";
import { C, confColor, confHasHue } from "../charts/kit";
import { DIV_LABEL, type DivKey, type Team } from "../data/types";

export default function Movement() {
  const { model } = useData();
  const [route, nav] = useRoute();
  const [active, setActive] = useState<string | null>(null);
  if (!model) return null;
  const div: DivKey = route.div === "ALL" ? "FBS" : route.div;
  const topN = Number(route.p.n) || 12;
  const latest = model.latest;

  const divTeams = useMemo(() => model.teams.filter((t) => t.division === div), [model, div]);
  const chosen = useMemo(() => {
    const q = route.q.trim().toLowerCase();
    let list = divTeams.filter((t) => t.weeks[latest]);
    if (route.conf) list = list.filter((t) => t.weeks[latest]?.conf === route.conf);
    if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));
    list = [...list].sort((a, b) => (a.weeks[latest]?.spRk ?? 999) - (b.weeks[latest]?.spRk ?? 999));
    if (!route.conf && !q) list = list.slice(0, topN);
    else list = list.slice(0, 24);
    const keep = new Set(list.map((t) => t.id));
    for (const id of [route.team, ...route.compare]) { const t = id ? model.byId.get(id) : undefined; if (t && t.division === div && !keep.has(t.id)) { list.push(t); keep.add(t.id); } }
    return list;
  }, [divTeams, route.conf, route.q, route.team, route.compare, topN, latest, model, div]);

  const series = (key: "spRk" | "sp"): LineSeries[] => chosen.map((t) => ({
    id: t.id, label: t.name, color: t.id === route.team ? C.ink : confColor(t.weeks[latest]?.conf),
    values: model.weeks.map((w) => t.weeks[w]?.[key] ?? null),
  }));
  // Bump chart order: each week the shown teams are lined up by their national rank (the circles keep the national rank itself).
  const rankSeries = useMemo(() => {
    const raw = series("spRk");
    return raw.map((s) => ({ ...s, values: s.values.map((v, wi) => (v == null ? null : 1 + raw.filter((o) => o.values[wi] != null && o.values[wi]! < v).length)) }));
  }, [chosen, route.team]);
  const spSeries = useMemo(() => series("sp"), [chosen, route.team]);
  const maxRank = Math.max(2, chosen.length);
  const byId = (id: string) => model.byId.get(id) as Team;

  // Derived: net rank change from the first week to the latest, for every team in the division.
  const first = model.weeks[0];
  const movers = useMemo(() => {
    return divTeams.map((t) => ({ t, a: t.weeks[first]?.spRk ?? null, b: t.weeks[latest]?.spRk ?? null })).filter((m) => m.a != null && m.b != null).map((m) => ({ ...m, d: m.a! - m.b! })).sort((x, y) => y.d - x.d);
  }, [divTeams, first, latest]);
  const risers = movers.slice(0, 6), fallers = movers.slice(-6).reverse();

  const confLegend = useMemo(() => {
    const confs = [...new Set(chosen.map((t) => t.weeks[latest]?.conf ?? ""))].filter(Boolean);
    return confs.map((c) => ({ c, color: confColor(c) }));
  }, [chosen, latest]);

  const notes: string[] = [];
  if (risers[0]) notes.push(`${risers[0].t.name} climbed ${risers[0].d} spots since week ${first}: ${ord(risers[0].a)} to ${ord(risers[0].b)} (SP+ ${fmt(risers[0].t.weeks[first]?.sp)} to ${fmt(risers[0].t.weeks[latest]?.sp)}).`);
  if (fallers[0] && fallers[0].d < 0) notes.push(`${fallers[0].t.name} fell ${Math.abs(fallers[0].d)} spots: ${ord(fallers[0].a)} to ${ord(fallers[0].b)}.`);
  const steady = chosen.map((t) => { const v = t.weeks && model.weeks.map((w) => t.weeks[w]?.spRk).filter((x): x is number => x != null); return { t, span: Math.max(...v) - Math.min(...v) }; }).sort((a, b) => a.span - b.span)[0];
  if (steady && chosen.length > 3) notes.push(`Steadiest in view: ${steady.t.name}, never outside a ${steady.span}-spot range across weeks ${first}–${latest}.`);

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div>
            <h2>{DIV_LABEL[div]} SP+ rank by week{route.conf ? ` · ${route.conf}` : ""}</h2>
            <p className="sub" style={{ margin: 0 }}>Weeks {first}–{latest} · {chosen.length} teams · circles show each team’s national rank · tap a line or name to pin it</p>
          </div>
          {!route.conf && !route.q.trim() && (
            <div className="seg" role="group" aria-label="Teams shown">
              {[8, 12, 20].map((n) => <button key={n} type="button" aria-pressed={topN === n} onClick={() => nav({ p: { n: n === 12 ? null : String(n) } }, { replace: true })}>Top {n}</button>)}
            </div>
          )}
        </div>
        {chosen.length === 0 ? <p className="empty">No teams match these filters.</p> : (
          <>
            <LinesChart
              xs={model.weeks} xLabel={(x) => `Wk ${x}`} series={rankSeries} height={Math.max(300, Math.min(560, chosen.length * 30 + 60))}
              invertY yDomain={[1, maxRank]} yTicks={[]} yTitle="Higher = better rank. Circles show the national rank" pointText={(_v, s, xi) => String(byId(s.id).weeks[model.weeks[xi]]?.spRk ?? "")} endLabels
              activeId={active} pickedId={route.team || null} onActive={setActive} onPick={(id) => nav({ team: route.team === id ? "" : id }, { replace: true })}
              tipRows={(xi, s) => { const tw = byId(s.id).weeks[model.weeks[xi]]; return [["Rank", ord(tw?.spRk)], ["SP+", fmt(tw?.sp)], ["Record", tw?.record?.text ?? "—"], ["Change", tw?.chg == null ? "—" : fmtSigned(tw.chg, 0)]]; }}
              ariaLabel="Bump chart of SP+ rank by week"
            />
            <div className="legend" aria-label="Conference colors">
              {confLegend.map((l) => <span key={l.c}><i style={{ background: l.color }} />{l.c}{!confHasHue(l.c) ? " (gray)" : ""}</span>)}
              {route.team && <span><i style={{ background: C.ink }} />Pinned team</span>}
            </div>
            <SeriesPicker series={rankSeries} activeId={active} pickedId={route.team || null} onActive={setActive} onPick={(id) => nav({ team: route.team === id ? "" : id }, { replace: true })} />
          </>
        )}
        <Notes items={notes} />
      </div>

      <div className="grid2" style={cols2("minmax(0,1.6fr) minmax(0,1fr)")}>
        <div className="panel">
          <h2>SP+ rating by week</h2>
          <p className="sub">Same teams · rating points · higher is better</p>
          {chosen.length > 0 && (
            <LinesChart xs={model.weeks} xLabel={(x) => `Wk ${x}`} series={spSeries} height={260} yTitle="SP+" yFormat={(v) => v.toFixed(0)}
              activeId={active} pickedId={route.team || null} onActive={setActive} onPick={(id) => nav({ team: route.team === id ? "" : id }, { replace: true })}
              tipRows={(xi, s) => { const tw = byId(s.id).weeks[model.weeks[xi]]; return [["SP+", fmt(tw?.sp)], ["Offense", fmt(tw?.off)], ["Defense", fmt(tw?.def)]]; }}
              ariaLabel="Line chart of SP+ rating by week" />
          )}
        </div>
        <div className="panel">
          <h2>Biggest movers <Derived why="First-week rank minus latest rank, from the sheet's division ranks" /></h2>
          <p className="sub">Spots gained or lost, week {first} to {latest}</p>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Team</th><th className="r">Wk {first}</th><th className="r">Wk {latest}</th><th className="r">Net</th></tr></thead>
            <tbody>
              {[...risers, ...fallers].map((m, i) => (
                <tr key={m.t.id + i} style={i === risers.length ? { borderTop: "2px solid var(--axis)" } : undefined}>
                  <td><TeamLink team={m.t} size={18} /></td><td className="r num">{m.a}</td><td className="r num">{m.b}</td>
                  <td className={`r num delta ${m.d > 0 ? "up" : m.d < 0 ? "down" : "flat"}`}>{m.d > 0 ? "▲" : m.d < 0 ? "▼" : "–"} {Math.abs(m.d)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
