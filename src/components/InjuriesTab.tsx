import { useEffect, useMemo, useState } from "react";
import { fetchData } from "../data/load";
import type { League } from "../data";
import { Skeleton } from "./Skeleton";
import { InjuryCard } from "./InjuryCard";
import "../injuries.css";
import "../gameInjuries.css";
import type { InjuryData, Player } from "../injuries";

type Data = InjuryData;

const SEV_RANK = { "Season-ending": 3, "Long-term": 2, "Short-term": 1, "Game-time": 0 } as const;
const TIER_RANK = { High: 3, Medium: 2, Low: 1, Minimal: 0, Unknown: -1 } as const;
const GROUPS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "ST"];
const GROUP_NAME: Record<string, string> = { QB: "Quarterbacks", RB: "Running backs", WR: "Receivers", TE: "Tight ends", OL: "Offensive line", DL: "Defensive line", LB: "Linebackers", DB: "Defensive backs", ST: "Kickers and punters" };

/** League-wide injury report: what the injury is, how serious, when the player is likely back, and how much his absence matters. */
export function InjuriesTab({ defaultLeague, only }: { defaultLeague: League; /** Just one team (the Teams tab): its league and the names it goes by. */ only?: { league: "NFL" | "CFB"; names: string[] } }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [lg, setLg] = useState<"NFL" | "CFB">(only?.league ?? (defaultLeague === "CFB" ? "CFB" : "NFL"));
  const [sort, setSort] = useState<"impact" | "return" | "severity">("impact");
  const [group, setGroup] = useState("all");
  const [team, setTeam] = useState("all");
  const [sev, setSev] = useState("all");
  const [min, setMin] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(30);
  useEffect(() => { let on = true; fetchData<Data>("injuries").then((d) => on && setData(d), () => on && setError(true)); return () => { on = false; }; }, []);
  const block = data ? (lg === "NFL" ? data.nfl : data.cfb) : null;
  const names = only?.names.map((n) => n.toLowerCase());
  const players = (block?.players ?? []).filter((p) => !names || names.includes(p.team.toLowerCase()) || names.includes((p.teamName ?? "").toLowerCase()));
  const teams = useMemo(() => [...new Set(players.map((p) => p.team))].sort(), [players]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return players
      .filter((p) => (group === "all" || p.group === group) && (team === "all" || p.team === team) && (sev === "all" || p.severity === sev)
        && (min === "all" || (min === "high" ? p.impact.tier === "High" : TIER_RANK[p.impact.tier] >= 2)) && (!needle || p.name.toLowerCase().includes(needle) || p.team.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const imp = (b.impact.score ?? -1) - (a.impact.score ?? -1), s = SEV_RANK[b.severity] - SEV_RANK[a.severity], r = a.ret.weeks[0] - b.ret.weeks[0];
        return (sort === "impact" ? imp || s : sort === "return" ? r || imp : s || imp) || a.name.localeCompare(b.name);
      });
  }, [players, group, team, sev, min, q, sort]);
  useEffect(() => setShown(30), [lg, group, team, sev, min, q, sort]);
  const nfl = lg === "NFL";
  const count = (f: (p: Player) => boolean) => players.filter(f).length;

  if (error) return <p className="ol-note">The injury report could not be loaded. Reload to try again.</p>;
  if (!data) return <Skeleton rows={4} />;
  return (
    <section className="ij" aria-label="Injury report">
      <div className="ol-controls">
        {!only && <div className="segmented" role="group" aria-label="League">
          <button aria-pressed={lg === "CFB"} onClick={() => { setLg("CFB"); setTeam("all"); }}>College</button>
          <button aria-pressed={lg === "NFL"} onClick={() => { setLg("NFL"); setTeam("all"); }}>NFL</button>
        </div>}
        <div className="segmented" role="group" aria-label="Sort by">
          <button aria-pressed={sort === "impact"} onClick={() => setSort("impact")}>Impact</button>
          <button aria-pressed={sort === "severity"} onClick={() => setSort("severity")}>Severity</button>
          <button aria-pressed={sort === "return"} onClick={() => setSort("return")}>Back soonest</button>
        </div>
      </div>
      {!block ? <p className="ol-note">No {nfl ? "NFL" : "college"} injury data yet. It appears after the next refresh.</p> : (
        <>
          <dl className="ij-tiles">
            <div><dt>Injured players</dt><dd>{players.length}</dd></div>
            <div><dt>High-impact absences</dt><dd>{count((p) => p.impact.tier === "High")}</dd></div>
            <div><dt>Season-ending</dt><dd>{count((p) => p.severity === "Season-ending")}</dd></div>
            <div><dt>Could play this week</dt><dd>{count((p) => p.ret.weeks[0] === 0)}</dd></div>
          </dl>
          <div className="ij-filters">
            <input type="search" aria-label="Search players or teams" placeholder="Search player or team" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)}><option value="all">All teams</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <select aria-label="Position" value={group} onChange={(e) => setGroup(e.target.value)}><option value="all">All positions</option>{GROUPS.map((g) => <option key={g} value={g}>{GROUP_NAME[g]}</option>)}</select>
            <select aria-label="Severity" value={sev} onChange={(e) => setSev(e.target.value)}><option value="all">Any severity</option>{(["Season-ending", "Long-term", "Short-term", "Game-time"] as const).map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select aria-label="Impact" value={min} onChange={(e) => setMin(e.target.value)}><option value="all">Any impact</option><option value="medium">Medium or higher</option><option value="high">High only</option></select>
          </div>
          <p className="ol-note ij-asof">{nfl ? "ESPN" : "Conference reports"} · updated {new Date(block.asOf).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })} · {Math.min(shown, list.length)} of {list.length}, {sort === "impact" ? "biggest impact first" : sort === "severity" ? "most serious first" : "back soonest first"}</p>
          {list.length ? (
            <ul className="ij-grid">{list.slice(0, shown).map((p) => <InjuryCard key={p.id} p={p} nfl={nfl} season={block.season} />)}</ul>
          ) : <p className="ol-note">No players match these filters.</p>}
          {list.length > shown && <button type="button" className="btn small" onClick={() => setShown(shown + 30)}>Show {Math.min(30, list.length - shown)} more</button>}
          <details className="ij-how">
            <summary>How to read this</summary>
            <ul>
              <li><b>Impact</b>: how much the team used him in the games he played (snaps and production against his position). This season once he has 3 games, otherwise last season.</li>
              <li><b>Back</b>: ESPN's date when it has one; "(est.)" is what is typical for that injury.</li>
              <li><b>Severity</b>: game-time, short-term (about 1–3 weeks), long-term (4 or more) or season-ending.</li>
              {!nfl && <li><b>College</b>: conferences list who is out, not the injury, and only team leaders have stats.</li>}
            </ul>
          </details>
          <p className="source-note">{nfl ? "Source: ESPN; snaps and stats from nflverse (CC-BY 4.0)." : "Source: conference availability reports."}</p>
        </>
      )}
    </section>
  );
}
