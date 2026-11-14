import { BarChart3, Clock, Link2, Repeat2 } from "lucide-react";
import type { LiveGame } from "./GameCenter";
import "../plays2.css";

const secs = (t: string | undefined) => {
  const m = /^(\d+):(\d{2})$/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const mmss = (n: number) => `${Math.floor(n / 60)}:${String(Math.abs(n) % 60).padStart(2, "0")}`;

/** Game at a glance: four numbers for the score bar (total yards, first downs, turnovers, time of possession), each with who is ahead and by how much. */
export function GlanceTiles({ game, away, home }: { game: LiveGame; away: string; home: string }) {
  const [A, H] = game.teams.map((t) => game.teamStats[t.id]);
  if (!A || !H) return null;
  const edge = (a: number, h: number, fmt = (n: number) => String(n)) => (a === h ? "Even" : `${a > h ? away : home} +${fmt(Math.abs(a - h))}`);
  const topA = secs(A.top), topH = secs(H.top);
  const tiles: [typeof BarChart3, string, string, string][] = [
    [BarChart3, String(A.yards + H.yards > 0 ? Math.max(A.yards, H.yards) : 0), "Total Yds", edge(A.yards, H.yards)],
    [Link2, String(Math.max(A.firstDowns, H.firstDowns)), "First Downs", edge(A.firstDowns, H.firstDowns)],
    [Repeat2, String(A.turnovers + H.turnovers), "Turnovers", `${away} ${A.turnovers}, ${home} ${H.turnovers}`],
    [Clock, mmss(Math.max(topA, topH)), "Time of Poss.", topA === topH ? "Even" : `${topA > topH ? away : home} +${mmss(Math.abs(topA - topH))}`],
  ];
  return (
    <div className="glance" aria-label="Game at a glance">
      <h4>Game at a glance{game.status.state === "in" && /half/i.test(game.status.detail) ? <small> (Halftime)</small> : null}</h4>
      <ul>
        {tiles.map(([Icon, v, label, sub]) => (
          <li key={label}><Icon size={26} aria-hidden="true" /><div><b>{v}</b><span>{label}</span><small>{sub}</small></div></li>
        ))}
      </ul>
    </div>
  );
}
