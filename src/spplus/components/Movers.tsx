import { useMemo, useState, type ReactNode } from "react";
import { LinesChart, type LineSeries } from "../charts/Lines";
import { C } from "../charts/kit";

/** One team's week-by-week ranks (overall, offense, defense; index = week, null when unrated) and rating. */
export interface MoverTeam {
  id: string;
  /** The team's logo and name as a link to its profile. */
  link: ReactNode;
  /** The short name for chart legends and tooltips. */
  name: string;
  sub?: string;
  color?: string;
  rank: { sp: (number | null)[]; off: (number | null)[]; def: (number | null)[] };
  rating: (number | null)[];
}

type Metric = "sp" | "off" | "def";
type Window = "week" | "four" | "season";
const METRICS: { key: Metric; label: string; long: string }[] = [
  { key: "sp", label: "Rating", long: "overall rating" },
  { key: "off", label: "Offense", long: "offense" },
  { key: "def", label: "Defense", long: "defense" },
];
const WINDOWS: { key: Window; label: string }[] = [{ key: "week", label: "1 week" }, { key: "four", label: "4 weeks" }, { key: "season", label: "Season" }];
const SHOWN = 25;
const MAX_COMPARE = 4;

/** Rank by week as a tiny line: better ranks sit higher. */
function Spark({ ranks, n, up }: { ranks: (number | null)[]; n: number; up: boolean | null }) {
  const pts = ranks.map((r, i) => (r == null ? null : [i, r] as const)).filter((p): p is readonly [number, number] => p != null);
  if (pts.length < 2) return <span className="mv-spark" aria-hidden="true" />;
  const W = 64, H = 18, x = (i: number) => (i / Math.max(1, ranks.length - 1)) * (W - 4) + 2, y = (r: number) => 2 + ((r - 1) / Math.max(1, n - 1)) * (H - 4);
  const color = up == null ? "var(--muted)" : up ? "#4cc27a" : "#f08a8a";
  return (
    <svg className="mv-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <polyline points={pts.map(([i, r]) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts[pts.length - 1][0])} cy={y(pts[pts.length - 1][1])} r="2" fill={color} />
    </svg>
  );
}

const Delta = ({ d }: { d: number | null }) => (d == null ? <span className="delta flat">–</span> : <span className={`delta ${d > 0 ? "up" : d < 0 ? "down" : "flat"}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "–"} {d === 0 ? "" : Math.abs(d)}</span>);

/**
 * Who is moving: the biggest risers and fallers in the chosen window, then every team in one table with its rank now, the change and a small
 * trend line. Pick up to four teams to compare them on a line chart. Ranks are national (the league's for the NFL), so a conference filter does
 * not change them.
 */
export function Movers({ teams, weeks, size, unit, fmtRating, title, filterNote }: {
  teams: MoverTeam[]; weeks: number[]; size: number; unit: string; fmtRating: (v: number | null) => string; title: string; filterNote?: string;
}) {
  const [metric, setMetric] = useState<Metric>("sp");
  const [win, setWin] = useState<Window>("week");
  const [sort, setSort] = useState<"rank" | "change">("rank");
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const last = weeks.length - 1;
  const from = win === "week" ? last - 1 : win === "four" ? Math.max(0, last - 4) : 0;
  const rows = useMemo(() => teams.map((t) => {
    const s = t.rank[metric], now = s[last] ?? null, was = s[from] ?? null;
    return { t, s, now, was, d: now != null && was != null && from < last ? was - now : null };
  }).filter((r) => r.now != null), [teams, metric, last, from]);
  const moved = rows.filter((r) => r.d != null && r.d !== 0);
  const risers = [...moved].sort((a, b) => b.d! - a.d!).filter((r) => r.d! > 0).slice(0, 5);
  const fallers = [...moved].sort((a, b) => a.d! - b.d!).filter((r) => r.d! < 0).slice(0, 5);
  const table = useMemo(() => [...rows].sort(sort === "rank" ? (a, b) => a.now! - b.now! : (a, b) => (b.d ?? -999) - (a.d ?? -999) || a.now! - b.now!), [rows, sort]);
  const shown = all ? table : table.slice(0, SHOWN);
  const m = METRICS.find((x) => x.key === metric)!;
  const wlabel = win === "week" ? `week ${weeks[Math.max(0, last - 1)]} to ${weeks[last]}` : win === "four" ? `week ${weeks[from]} to ${weeks[last]}` : `week ${weeks[0]} to ${weeks[last]}`;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_COMPARE ? [...p.slice(1), id] : [...p, id]));
  const series: LineSeries[] = picked.map((id, i) => { const r = teams.find((t) => t.id === id)!; return { id, label: r.name, color: C.s[i % C.s.length], values: r.rank[metric] }; });
  const [active, setActive] = useState<string | null>(null);

  const List = ({ label, list }: { label: string; list: typeof risers }) => (
    <div className="mv-list">
      <h3>{label}</h3>
      {list.length ? <ol>{list.map((r) => <li key={r.t.id}>{r.t.link}<span className="mv-was">{r.was} → {r.now}</span><Delta d={r.d} /></li>)}</ol> : <p className="empty">Nobody {label === "Risers" ? "moved up" : "fell"} in this window.</p>}
    </div>
  );

  return (
    <div className="stack mv">
      <div className="panel">
        <div className="phead">
          <div>
            <h2>{title}</h2>
            <p className="sub" style={{ margin: 0 }}>Change in {m.long} rank, {wlabel}{filterNote ? ` · ${filterNote}` : ""}</p>
          </div>
        </div>
        <div className="mv-controls">
          <div className="seg" role="group" aria-label="Rank shown">{METRICS.map((x) => <button key={x.key} type="button" aria-pressed={metric === x.key} onClick={() => setMetric(x.key)}>{x.label}</button>)}</div>
          <div className="seg" role="group" aria-label="Change over">{WINDOWS.map((x) => <button key={x.key} type="button" aria-pressed={win === x.key} onClick={() => setWin(x.key)}>{x.label}</button>)}</div>
        </div>
        <div className="mv-lists">
          <List label="Risers" list={risers} />
          <List label="Fallers" list={fallers} />
        </div>
      </div>

      {picked.length > 0 && (
        <div className="panel">
          <div className="phead"><div><h2>Compare</h2><p className="sub" style={{ margin: 0 }}>{m.long[0].toUpperCase() + m.long.slice(1)} rank by week, up to {MAX_COMPARE} teams · higher on the chart is better</p></div>
            <button type="button" className="btn" onClick={() => setPicked([])}>Clear</button></div>
          <LinesChart xs={weeks} xLabel={(x) => `Wk ${x}`} series={series} height={220} invertY yDomain={[1, size]} yFormat={(v) => String(Math.round(v))} yTitle={`${m.label} rank (1 is best)`}
            endLabels activeId={active} onActive={setActive} tipRows={(xi, s) => { const t = teams.find((x) => x.id === s.id)!; return [["Rank", String(t.rank[metric][xi] ?? "—")], [unit, fmtRating(t.rating[xi] ?? null)]]; }} ariaLabel={`Line chart of ${m.long} rank by week`} />
        </div>
      )}

      <div className="panel">
        <div className="phead">
          <div><h2>Every team</h2><p className="sub" style={{ margin: 0 }}>{m.label} rank now, the change since {wlabel.split(" to ")[0]}, and the trend · tick a team to compare</p></div>
          <div className="seg" role="group" aria-label="Sort"><button type="button" aria-pressed={sort === "rank"} onClick={() => setSort("rank")}>By rank</button><button type="button" aria-pressed={sort === "change"} onClick={() => setSort("change")}>By change</button></div>
        </div>
        {rows.length === 0 ? <p className="empty">No teams match these filters.</p> : (
          <div className="tbl-wrap">
            <table className="tbl mv-table">
              <thead><tr><th className="r">#</th><th>Team</th><th className="r">Change</th><th>Trend</th><th className="r">{unit}</th><th><span className="sr-only">Compare</span></th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.t.id}>
                    <td className="r num">{r.now}</td>
                    <td>{r.t.link}{r.t.sub && <small className="mv-sub">{r.t.sub}</small>}</td>
                    <td className="r"><Delta d={r.d} /></td>
                    <td><Spark ranks={r.s} n={size} up={r.d == null || r.d === 0 ? null : r.d > 0} /></td>
                    <td className="r num">{fmtRating(r.t.rating[last] ?? null)}</td>
                    <td><input type="checkbox" aria-label={`Compare ${r.t.name}`} checked={picked.includes(r.t.id)} onChange={() => toggle(r.t.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!all && table.length > SHOWN && <button type="button" className="btn mv-more" onClick={() => setAll(true)}>Show all {table.length} teams</button>}
      </div>
    </div>
  );
}
