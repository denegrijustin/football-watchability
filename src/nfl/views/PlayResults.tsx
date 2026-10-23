import { useMemo } from "react";
import { useNfl } from "../useNfl";
import { navigateNfl, useNflRoute } from "../store";
import { teamRows } from "../model";
import { NflMark, Notes } from "../common";
import { logos } from "../../data";
import { logoSlug } from "../model";
import { PlayResultsBoard, type BoardTeam } from "../../spplus/charts/PlayResultsBoard";
import { fmt } from "../../spplus/data/derive";

const ord = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/** Every team by its rating (how it plays) against its record (what it has to show for it). */
export default function PlayResults() {
  const { data } = useNfl();
  const [route] = useNflRoute();
  if (!data) return null;
  const week = route.week ?? data.ratingsThroughWeek;
  const rows = useMemo(() => teamRows(data, week), [data, week]);

  const teams: BoardTeam[] = useMemo(() => rows.filter((r) => r.rec.w + r.rec.l + r.rec.t > 0).sort((a, b) => b.r[0] - a.r[0]).map((r, i) => {
    const g = r.rec.w + r.rec.l + r.rec.t, rec = `${r.rec.w}-${r.rec.l}${r.rec.t ? `-${r.rec.t}` : ""}`;
    return {
      id: r.abbr, name: r.name, play: r.r[0], playRank: i + 1, winPct: (r.rec.w + r.rec.t / 2) / g, rec,
      rankText: ord(r.rank.sp), tip: `${r.name} · ${rec} · rating ${fmt(r.r[0])} (${ord(r.rank.sp)})`,
      logo: <NflMark abbr={r.abbr} size={32} />, logoSrc: logos[logoSlug(r.name)],
    };
  }), [rows]);

  const group = route.group;
  const keep = new Set(rows.filter((r) => !group || r.conf === group || r.div === group).map((r) => r.abbr));
  const visible = group ? teams.filter((t) => keep.has(t.id)) : teams;
  const n = teams.length, winHi = 0.6, winLo = 0.45, edge = Math.max(1, Math.round(n * 0.25));
  const unlucky = teams.filter((t) => t.playRank <= n / 3 && t.winPct < winLo).map((t) => t.name);
  const lucky = teams.filter((t) => t.playRank > (2 * n) / 3 && t.winPct >= winHi).map((t) => t.name);
  const notes: string[] = [];
  if (unlucky.length) notes.push(`Playing well without the record to show for it: ${unlucky.join(", ")}.`);
  if (lucky.length) notes.push(`Winning without playing like it: ${lucky.join(", ")}.`);

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div><h2>Playing well? Winning?</h2><p className="sub" style={{ margin: 0 }}>NFL · through week {week} · every team by how it plays and what it has to show for it{group ? ` · showing ${group}` : ""}</p></div>
        </div>
        <PlayResultsBoard
          teams={visible} winHi={winHi} winLo={winLo} playLabel="Rating" showRank markTop={edge} markBottom={edge} selected={route.team || null}
          onPick={(abbr) => navigateNfl({ view: "team", team: abbr })}
          playRule={`Play: the model rating, split into thirds across the ${n} teams. Results: winning percentage (${winHi.toFixed(3).slice(1)} and up is winning, under ${winLo.toFixed(3).slice(1)} is losing).`}
        />
        <Notes items={notes} />
      </div>
    </div>
  );
}
