import { useMemo } from "react";
import { useNfl } from "../useNfl";
import { useNflRoute } from "../store";
import { teamRows, type TeamRow } from "../model";
import { NflTeamLink, Notes } from "../common";
import { SortTable, type Col } from "../../spplus/components/SortTable";
import { fmt } from "../../spplus/data/derive";
import { ConfLogo } from "../../ConfMark";

interface Group {
  key: string;
  label: string;
  conf: string;
  teams: TeamRow[];
  mean: number;
  off: number;
  def: number;
  w: number; l: number; t: number;
  best: TeamRow;
  worst: TeamRow;
  /** Teams in the league's top 8 by rating. */
  top8: number;
  rank: number;
}

const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(v.length, 1);

function summarize(key: string, label: string, conf: string, teams: TeamRow[]): Omit<Group, "rank"> {
  const bySp = [...teams].sort((a, b) => b.r[0] - a.r[0]);
  return {
    key, label, conf, teams: bySp,
    mean: avg(teams.map((t) => t.r[0])), off: avg(teams.map((t) => t.r[1])), def: avg(teams.map((t) => t.r[2])),
    w: teams.reduce((s, t) => s + t.rec.w, 0), l: teams.reduce((s, t) => s + t.rec.l, 0), t: teams.reduce((s, t) => s + t.rec.t, 0),
    best: bySp[0], worst: bySp[bySp.length - 1], top8: teams.filter((t) => t.rank.sp <= 8).length,
  };
}
const rec = (g: { w: number; l: number; t: number }) => `${g.w}-${g.l}${g.t ? `-${g.t}` : ""}`;

/** The two conferences and eight divisions ranked against each other by their teams' average rating, and each division's teams in order. */
export default function Standings() {
  const { data } = useNfl();
  const [route, nav] = useNflRoute();
  if (!data) return null;
  const week = route.week ?? data.ratingsThroughWeek;
  const all = useMemo(() => teamRows(data, week), [data, week]);
  const confs = useMemo(() => {
    const out = ["AFC", "NFC"].map((c) => summarize(c, c, c, all.filter((t) => t.conf === c)));
    return out.sort((a, b) => b.mean - a.mean).map((g, i) => ({ ...g, rank: i + 1 }));
  }, [all]);
  const divs = useMemo(() => {
    const names = [...new Set(all.map((t) => t.div))];
    const out = names.map((d) => summarize(d, d, all.find((t) => t.div === d)!.conf, all.filter((t) => t.div === d)));
    return out.sort((a, b) => b.mean - a.mean).map((g, i) => ({ ...g, rank: i + 1 }));
  }, [all]);

  const cols = (kind: "conference" | "division"): Col<Group>[] => [
    { key: "rk", label: "Rank", align: "r", first: "asc", get: (g) => g.rank, render: (g) => <span className="num">{g.rank}</span> },
    { key: "name", label: kind === "conference" ? "Conference" : "Division", get: (g) => g.label, render: (g) => <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><ConfLogo conf={g.conf} size={20} />{g.label}</span> },
    { key: "mean", label: "Mean rating", align: "r", first: "desc", get: (g) => g.mean, render: (g) => fmt(g.mean) },
    { key: "off", label: "Off", align: "r", hideSm: true, first: "desc", get: (g) => g.off, render: (g) => fmt(g.off) },
    { key: "def", label: "Def", align: "r", hideSm: true, first: "asc", get: (g) => g.def, render: (g) => fmt(g.def) },
    { key: "rec", label: "Record", align: "r", hideSm: true, get: (g) => g.w - g.l, first: "desc", render: (g) => <span className="num">{rec(g)}</span> },
    { key: "best", label: "Best", get: (g) => g.best.r[0], first: "desc", render: (g) => `${g.best.abbr} ${fmt(g.best.r[0])}` },
    { key: "worst", label: "Worst", hideSm: true, get: (g) => g.worst.r[0], render: (g) => `${g.worst.abbr} ${fmt(g.worst.r[0])}` },
    { key: "t8", label: "In top 8", align: "r", hideSm: true, first: "desc", get: (g) => g.top8 },
  ];

  const notes = useMemo(() => {
    const out: string[] = [];
    const [a, b] = confs;
    out.push(`${a.label} leads ${b.label} by ${fmt(a.mean - b.mean)} points per game on average (${fmt(a.mean)} to ${fmt(b.mean)}).`);
    out.push(`${divs[0].label} is the strongest division (${fmt(divs[0].mean)}) and ${divs[divs.length - 1].label} the weakest (${fmt(divs[divs.length - 1].mean)}).`);
    return out;
  }, [confs, divs]);

  const sort = (k: string, dflt: string) => ({ key: route.p[`${k}s`] || dflt, dir: (route.p[`${k}d`] as "asc" | "desc") || (dflt === "rk" ? "asc" : "desc"), set: (key: string, dir: "asc" | "desc") => nav({ p: { [`${k}s`]: key, [`${k}d`]: dir } }) });
  const shown = route.group ? divs.filter((d) => d.conf === route.group || d.label === route.group) : divs;
  return (
    <div className="stack">
      <div className="panel">
        <h2>Conference ranking</h2>
        <p className="sub">Ranked by the average NFL+ rating of each conference's teams · ratings before week {week}.</p>
        <SortTable label="Conference ranking" cols={cols("conference")} rows={confs} rowKey={(g) => g.key} onRowClick={(g) => nav({ view: "rankings", group: g.key })} sort={sort("c", "rk")} />
        <Notes items={notes} />
      </div>
      <div className="panel">
        <h2>Division ranking</h2>
        <p className="sub">All eight divisions ranked by the average rating of their teams.</p>
        <SortTable label="Division ranking" cols={cols("division")} rows={divs} rowKey={(g) => g.key} onRowClick={(g) => nav({ view: "rankings", group: g.key })} sort={sort("d", "rk")} />
      </div>
      <div className="panel">
        <div className="phead"><h2>Inside each division</h2>
          <div className="seg" role="group" aria-label="Conference">
            {["", "AFC", "NFC"].map((c) => <button key={c || "all"} type="button" aria-pressed={route.group === c || (!route.group && !c)} onClick={() => nav({ group: c })}>{c || "Both"}</button>)}
          </div>
        </div>
        <div className="div-grid">
          {shown.map((d) => (
            <section key={d.key} className="div-card" aria-label={d.label}>
              <h3><ConfLogo conf={d.conf} size={18} /> {d.label} <span className="muted">· #{d.rank} of {divs.length}</span></h3>
              <ol>
                {d.teams.map((t, i) => (
                  <li key={t.abbr}>
                    <span className="num muted">{i + 1}</span>
                    <NflTeamLink abbr={t.abbr} size={20} label={t.name.split(" ").pop()} />
                    <span className="num">{fmt(t.r[0])}</span>
                    <span className="muted num">#{t.rank.sp}</span>
                    <span className="muted num">{t.rec.w}-{t.rec.l}{t.rec.t ? `-${t.rec.t}` : ""}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
