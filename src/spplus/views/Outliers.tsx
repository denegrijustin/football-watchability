import { useMemo } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { fmt, fmtSigned, linreg, ord, resolveWeek, rowsFor } from "../data/derive";
import { winPct } from "../data/model";
import { CompareToggle, Derived, Notes, TeamLink } from "../components/common";
import { Scatter, type ScatterPoint } from "../charts/Scatter";
import { confColor } from "../charts/kit";
import { DIV_LABEL, type DivKey, type Team } from "../data/types";

type Preset = "offdef" | "winpct" | "second" | "margin" | "since0" | "st";
const PRESETS: { key: Preset; label: string; fbsOnly?: boolean }[] = [
  { key: "offdef", label: "Offense vs. defense" },
  { key: "winpct", label: "SP+ vs. win %" },
  { key: "since0", label: "SP+ now vs. week 0" },
  { key: "st", label: "Special teams vs. SP+", fbsOnly: true },
  { key: "second", label: "Wins vs. 2nd-order wins", fbsOnly: true },
  { key: "margin", label: "Scoring vs. adjusted margin", fbsOnly: true },
];

export default function Outliers() {
  const { model } = useData();
  const [route, nav] = useRoute();
  if (!model) return null;
  const week = resolveWeek(model, route.week);
  const div: DivKey = route.div === "ALL" ? "FBS" : route.div;
  let preset = (route.p.preset as Preset) || "offdef";
  const spec = PRESETS.find((p) => p.key === preset)!;
  if (spec.fbsOnly && div !== "FBS") preset = "offdef";
  const q = route.q.trim().toLowerCase();

  const base = useMemo(() => rowsFor(model, div, week), [model, div, week]);
  const fbsOnly = div === "FBS";

  const built = useMemo(() => {
    const out: { team: Team; x: number; y: number; tip: [string, string][] }[] = [];
    const season = new Map(model.season.map((s) => [s.team, s]));
    for (const { team, tw } of base) {
      let x: number | null = null, y: number | null = null, tip: [string, string][] = [];
      if (preset === "offdef") { x = tw.off; y = tw.def; tip = [["Offense", `${fmt(tw.off)} · #${tw.offRk}`], ["Defense", `${fmt(tw.def)} · #${tw.defRk}`], ["SP+", `${fmt(tw.sp)} · #${tw.spRk}`]]; }
      else if (preset === "winpct") { const wp = winPct(tw.record?.text); x = tw.sp; y = wp == null ? null : Math.round(wp * 1000) / 10; tip = [["SP+", `${fmt(tw.sp)} · #${tw.spRk}`], ["Record", tw.record?.text ?? "—"], ["Win %", y == null ? "—" : `${y}`]]; }
      else if (preset === "since0") { const w0 = team.weeks[model.weeks[0]]; x = w0?.sp ?? null; y = tw.sp; tip = [[`Week ${model.weeks[0]} SP+`, fmt(x)], [`Week ${week} SP+`, fmt(tw.sp)], ["Change", fmtSigned(x == null || tw.sp == null ? null : tw.sp - x)]]; }
      else if (preset === "st") { x = tw.sp; y = tw.st; tip = [["SP+", `${fmt(tw.sp)} · #${tw.spRk}`], ["Special teams", `${fmt(tw.st)} · #${tw.stRk}`]]; }
      else { const s = season.get(team.name); if (s) { if (preset === "second") { x = s.secondOrder; y = s.wins; tip = [["Wins", String(s.wins)], ["2nd-order wins", fmt(s.secondOrder, 2)], ["Games", String(s.games)]]; } else { x = s.adjMgn; y = s.scoringMgn; tip = [["Scoring margin", String(s.scoringMgn)], ["Adjusted margin", fmt(s.adjMgn)], ["Games", String(s.games)]]; } } }
      if (x != null && y != null) out.push({ team, x, y, tip });
    }
    return out;
  }, [base, preset, model, week]);

  const spec2 = {
    offdef: { xt: "Offense SP+ (higher is better)", yt: "Defense SP+ (lower is better, axis reversed)", invY: true, title: "Offense vs. defense", mean: true },
    winpct: { xt: "SP+", yt: "Win percentage from the record", invY: false, title: "SP+ vs. win percentage", reg: true },
    since0: { xt: `SP+ in week ${model.weeks[0]}`, yt: `SP+ in week ${week}`, invY: false, title: `SP+ now vs. week ${model.weeks[0]}`, diag: "no change" },
    st: { xt: "Overall SP+", yt: "Special teams SP+", invY: false, title: "Special teams vs. overall SP+", reg: true },
    second: { xt: "Second-order wins (sheet)", yt: "Actual wins", invY: false, title: "Wins vs. second-order wins", diag: "wins = second-order wins" },
    margin: { xt: "Adjusted margin (sheet)", yt: "Scoring margin", invY: false, title: "Scoring margin vs. adjusted margin", diag: "scoring = adjusted" },
  }[preset] as { xt: string; yt: string; invY: boolean; title: string; mean?: boolean; reg?: boolean; diag?: string };

  const mean = (k: "x" | "y") => built.reduce((s, p) => s + p[k], 0) / Math.max(built.length, 1);
  const reg = useMemo(() => (spec2.reg ? linreg(built.map((p) => ({ x: p.x, y: p.y }))) : null), [built, spec2.reg]);

  const points: ScatterPoint[] = built.map((b) => {
    const tw = b.team.weeks[week];
    const inConf = !route.conf || tw?.conf === route.conf;
    const inQ = !q || b.team.name.toLowerCase().includes(q);
    return { id: b.team.id, name: b.team.name, x: b.x, y: b.y, color: confColor(tw?.conf), logo: b.team.logo?.local ?? b.team.logo?.remote, dim: !(inConf && inQ), tip: [...b.tip, ["Conference", tw?.conf ?? "—"]] };
  });
  const sel = built.find((b) => b.team.id === route.team);

  const notes = useMemo(() => {
    const out: string[] = [];
    if (built.length < 5) return out;
    if (spec2.reg && reg) {
      const res = built.map((b) => ({ b, r: b.y - (reg.slope * b.x + reg.icpt) })).sort((a, c) => c.r - a.r);
      const unit = preset === "winpct" ? "points of win %" : "ST points";
      out.push(`Above the trend: ${res[0].b.team.name} (${fmtSigned(res[0].r)} ${unit}). Below it: ${res[res.length - 1].b.team.name} (${fmtSigned(res[res.length - 1].r)}). R² ${reg.r2.toFixed(2)} ${"·"} derived from a least-squares line over ${built.length} teams.`);
    } else if (spec2.diag) {
      const res = built.map((b) => ({ b, r: b.y - b.x })).sort((a, c) => c.r - a.r);
      const lab = preset === "since0" ? "SP+ points" : preset === "second" ? "wins" : "points of margin";
      out.push(`Furthest above the dashed line: ${res[0].b.team.name} (${fmtSigned(res[0].r)} ${lab}). Furthest below: ${res[res.length - 1].b.team.name} (${fmtSigned(res[res.length - 1].r)}).`);
    } else if (preset === "offdef") {
      const gap = built.map((b) => ({ b, d: (b.team.weeks[week]?.offRk ?? 0) - (b.team.weeks[week]?.defRk ?? 0) })).sort((a, c) => c.d - a.d);
      out.push(`Defense far ahead of offense: ${gap[0].b.team.name} is ${ord(gap[0].b.team.weeks[week]?.defRk)} on defense and ${ord(gap[0].b.team.weeks[week]?.offRk)} on offense.`);
      const g2 = gap[gap.length - 1];
      out.push(`Offense far ahead of defense: ${g2.b.team.name} is ${ord(g2.b.team.weeks[week]?.offRk)} on offense and ${ord(g2.b.team.weeks[week]?.defRk)} on defense.`);
    }
    return out;
  }, [built, reg, preset, week]);

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div><h2>{spec2.title}</h2><p className="sub" style={{ margin: 0 }}>{DIV_LABEL[div]}{preset === "second" || preset === "margin" ? "" : ` · week ${week}`} · {built.length} teams · {route.conf || q ? "teams outside the filter are dimmed" : "select a team to pin it"}</p></div>
          <div className="seg" role="group" aria-label="Chart">
            {PRESETS.filter((p) => !p.fbsOnly || fbsOnly).map((p) => <button key={p.key} type="button" aria-pressed={p.key === preset} onClick={() => nav({ p: { preset: p.key === "offdef" ? null : p.key } }, { replace: true })}>{p.label}</button>)}
          </div>
        </div>
        <Scatter points={points} xTitle={spec2.xt} yTitle={spec2.yt} invertY={spec2.invY}
          refLines={spec2.mean ? { x: mean("x"), y: mean("y"), label: `${div} average` } : undefined} diagonal={spec2.diag} trend={reg}
          selected={route.team || null} onSelect={(id) => nav({ team: route.team === id ? "" : id }, { replace: true })} ariaLabel={spec2.title} />
        <div className="legend">
          {[...new Set(points.map((p) => model.byId.get(p.id)?.weeks[week]?.conf))].filter(Boolean).slice(0, 14).map((c) => <span key={c}><i style={{ background: confColor(c) }} />{c}</span>)}
          {reg && <span><i style={{ background: "#e66767", height: 3 }} />Trend line <Derived why="Least-squares fit over the teams shown" /></span>}
        </div>
        <Notes items={notes} />
        <details className="vals"><summary>Values behind the chart</summary>
          <div className="tbl-wrap" style={{ maxHeight: 280 }}><table className="tbl"><thead><tr><th>Team</th><th className="r">{spec2.xt}</th><th className="r">{spec2.yt}</th></tr></thead>
            <tbody>{[...built].sort((a, b) => b.y - a.y).map((b) => <tr key={b.team.id}><td>{b.team.name}</td><td className="r num">{fmt(b.x, 2)}</td><td className="r num">{fmt(b.y, 2)}</td></tr>)}</tbody></table></div>
        </details>
      </div>
      {sel && (
        <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <TeamLink team={sel.team} size={28} />
          <dl className="kv" style={{ flex: 1 }}>{sel.tip.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <CompareToggle id={sel.team.id} />
        </div>
      )}
    </div>
  );
}
