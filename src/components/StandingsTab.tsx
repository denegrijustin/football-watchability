import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchData } from "../data/load";
import { logos, type League } from "../data";
import { ChipImg } from "../logoTone";
import { TeamOpen } from "../openTeam";
import { Skeleton } from "./Skeleton";
import "../standings.css";

type Logo = { id?: string; url?: string | null };
type Row = { id: string; name: string; short: string; abbr: string; logo: Logo; w: number; l: number; t: number; overall: string; pct: number; conf: string | null; div: string | null; home: string | null; away: string | null; pf: number; pa: number; diff: number; streak: string | null; seed: number | null; division?: string };
type Nfl = { season: number | null; conferences: { name: string; full: string; divisions: { name: string; teams: Row[] }[] }[] };
type Cfb = { season: number | null; conferences: { name: string; full: string; teams: Row[] }[] };
type Data = { updatedAt: string; nfl: Nfl | null; cfb: Cfb | null };

const src = (l: Logo) => (l.id ? logos[l.id] : l.url ?? undefined);
const diffText = (n: number) => (n > 0 ? `+${n}` : String(n));
const pctText = (n: number) => (n >= 1 ? "1.000" : n.toFixed(3).replace(/^0/, ""));

function Team({ r, nfl }: { r: Row; nfl: boolean }) {
  const s = src(r.logo), to = { league: nfl ? "NFL" : "CFB", name: nfl ? r.name : r.short, abbr: r.abbr };
  return <span className="sd-team">{s && <TeamOpen className="img" team={to}><ChipImg src={s} size={22} /></TeamOpen>}<b><TeamOpen team={to}>{r.short}</TeamOpen></b>{r.division && <em>{r.division}</em>}</span>;
}

type SortKey = "pct" | "pf" | "pa" | "diff";
const SORTS: Record<SortKey, (r: Row) => number> = { pct: (r) => r.pct, pf: (r) => r.pf, pa: (r) => r.pa, diff: (r) => r.diff };

function Table({ rows, nfl, rank = true }: { rows: Row[]; nfl: boolean; rank?: boolean }) {
  // Click a stat heading to order by it (highest first, then lowest first, then back to the standings order).
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const shown = useMemo(() => (sort ? [...rows].sort((x, y) => (SORTS[sort.key](y) - SORTS[sort.key](x)) * sort.dir || rows.indexOf(x) - rows.indexOf(y)) : rows), [rows, sort]);
  const press = (key: SortKey) => setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const head = (key: SortKey, label: string) => (
    <th scope="col" className="r hide-sm" aria-sort={sort?.key === key ? (sort.dir === 1 ? "descending" : "ascending") : "none"}>
      <button type="button" className="sd-sort" onClick={() => press(key)} title={`Order by ${label}`}>{label}{sort?.key === key ? (sort.dir === 1 ? " ▼" : " ▲") : ""}</button>
    </th>
  );
  return (
    <table className="sd-table">
      <thead>
        <tr>
          {rank && <th scope="col" className="sd-rk">#</th>}
          <th scope="col">Team</th>
          <th scope="col" className="r">Conf</th>
          <th scope="col" className="r">Overall</th>
          {nfl && <th scope="col" className="r hide-sm">Div</th>}
          {head("pct", "Pct")}
          {head("pf", "PF")}
          {head("pa", "PA")}
          {head("diff", "Diff")}
          <th scope="col" className="r">Strk</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((r, i) => (
          <tr key={r.id}>
            {rank && <td className="sd-rk">{i + 1}</td>}
            <th scope="row"><Team r={r} nfl={nfl} />{nfl && r.seed && r.seed <= 7 ? <span className="sd-seed" title={`Playoff seed ${r.seed}`}>{r.seed}</span> : null}</th>
            <td className="r sd-conf">{r.conf ?? "–"}</td>
            <td className="r">{r.overall}</td>
            {nfl && <td className="r hide-sm">{r.div ?? "–"}</td>}
            <td className="r hide-sm">{pctText(r.pct)}</td>
            <td className="r hide-sm">{r.pf}</td>
            <td className="r hide-sm">{r.pa}</td>
            <td className={`r hide-sm ${r.diff > 0 ? "up" : r.diff < 0 ? "down" : ""}`}>{diffText(r.diff)}</td>
            <td className={`r sd-strk ${r.streak?.startsWith("W") ? "up" : r.streak?.startsWith("L") ? "down" : ""}`}>{r.streak ?? "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const matches = (r: Row, q: string) => !q || `${r.name} ${r.short} ${r.abbr ?? ""}`.toLowerCase().includes(q);

/** NFL: each conference's four divisions in order, with the playoff seeds beside the teams that hold one. */
function NflStandings({ data, conf, q }: { data: Nfl; conf: string; q: string }) {
  const c = data.conferences.find((x) => x.name === conf) ?? data.conferences[0];
  const seeds = c.divisions.flatMap((d) => d.teams).filter((t) => t.seed && t.seed <= 7).sort((a, b) => a.seed! - b.seed!);
  return (
    <>
      {!q && seeds.length > 0 && (
        <section className="sd-block" aria-label={`${c.name} playoff picture`}>
          <h3>{c.name} playoff picture</h3>
          <ol className="sd-seeds">
            {seeds.map((t) => <li key={t.id}><i>{t.seed}</i><Team r={t} nfl /><span>{t.overall}</span></li>)}
          </ol>
        </section>
      )}
      {c.divisions.map((d) => ({ d, rows: d.teams.filter((t) => matches(t, q)) })).filter((x) => x.rows.length).map(({ d, rows }) => (
        <section className="sd-block" key={d.name} aria-label={d.name}>
          <h3>{d.name}</h3>
          <Table rows={rows} nfl />
        </section>
      ))}
      {q && !c.divisions.some((d) => d.teams.some((t) => matches(t, q))) && <p className="ol-note">No {c.name} team matches “{q}”.</p>}
    </>
  );
}

/** College: one conference at a time ordered by conference record, or every conference's top teams side by side. */
function CfbStandings({ data, conf, onPick, q }: { data: Cfb; conf: string; onPick: (c: string) => void; q: string }) {
  if (q) {
    // A search looks across the chosen conference, or every conference when All is chosen.
    const pool = conf === "all" ? data.conferences : data.conferences.filter((x) => x.name === conf);
    const rows = pool.flatMap((c) => c.teams).filter((t) => matches(t, q));
    return rows.length ? (
      <section className="sd-block" aria-label="Search results">
        <h3>{rows.length} team{rows.length === 1 ? "" : "s"} match “{q}”</h3>
        <Table rows={rows} nfl={false} rank={false} />
      </section>
    ) : <p className="ol-note">No team matches “{q}”{conf === "all" ? "" : ` in the ${conf}`}.</p>;
  }
  if (conf === "all") {
    return (
      <div className="sd-leaders">
        {data.conferences.map((c) => (
          <section className="sd-block" key={c.name} aria-label={c.name}>
            <h3><button type="button" onClick={() => onPick(c.name)}>{c.name} <span aria-hidden="true">→</span></button></h3>
            <ol className="sd-seeds">
              {c.teams.slice(0, 3).map((t, i) => <li key={t.id}><i>{i + 1}</i><Team r={t} nfl={false} /><span>{t.conf ?? t.overall}</span></li>)}
            </ol>
          </section>
        ))}
      </div>
    );
  }
  const c = data.conferences.find((x) => x.name === conf) ?? data.conferences[0];
  return (
    <section className="sd-block" aria-label={c.full}>
      <h3>{c.full}</h3>
      <Table rows={c.teams} nfl={false} />
    </section>
  );
}

/** Conference standings for both leagues: the NFL by division with playoff seeds, and every college conference ordered by conference record. */
export function StandingsTab({ defaultLeague }: { defaultLeague: League }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [lg, setLg] = useState<"NFL" | "CFB">(defaultLeague === "CFB" ? "CFB" : "NFL");
  const [nflConf, setNflConf] = useState("AFC");
  const [cfbConf, setCfbConf] = useState("all");
  useEffect(() => { let on = true; fetchData<Data>("standings").then((d) => on && setData(d), () => on && setError(true)); return () => { on = false; }; }, []);
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim().toLowerCase());
  const names = useMemo(() => data?.cfb?.conferences.map((c) => c.name) ?? [], [data]);
  if (error) return <p className="ol-note">The standings could not be loaded. Reload to try again.</p>;
  if (!data) return <Skeleton rows={4} kind="row" />;
  const block = lg === "NFL" ? data.nfl : data.cfb;
  return (
    <section className="sd" aria-label="Standings">
      <div className="ol-controls">
        <div className="segmented" role="group" aria-label="League">
          <button aria-pressed={lg === "CFB"} onClick={() => setLg("CFB")}>College</button>
          <button aria-pressed={lg === "NFL"} onClick={() => setLg("NFL")}>NFL</button>
        </div>
        <label className="sd-search"><span className="sr-only">Find a team</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a team" /></label>
        {lg === "NFL" && data.nfl && (
          <div className="segmented" role="group" aria-label="Conference">
            {data.nfl.conferences.map((c) => <button key={c.name} aria-pressed={nflConf === c.name} onClick={() => setNflConf(c.name)}>{c.name}</button>)}
          </div>
        )}
      </div>
      {lg === "CFB" && data.cfb && (
        <div className="sd-chips" role="group" aria-label="Conference">
          {["all", ...names].map((n) => <button key={n} type="button" aria-pressed={cfbConf === n} onClick={() => setCfbConf(n)}>{n === "all" ? "All" : n}</button>)}
        </div>
      )}
      {!block ? <p className="ol-note">No standings yet. They appear after the next refresh.</p> : lg === "NFL" ? <NflStandings data={data.nfl!} conf={nflConf} q={dq} /> : <CfbStandings q={dq} data={data.cfb!} conf={cfbConf} onPick={setCfbConf} />}
      <p className="source-note">Source: ESPN. {lg === "NFL" ? "Ordered by ESPN's tiebreakers; the number is the playoff seed." : "Ordered by conference record, then overall record."}</p>
    </section>
  );
}
