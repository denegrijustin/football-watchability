import { useEffect, useMemo, useState } from "react";
import { fetchData } from "../data/load";
import { logos, type League } from "../data";
import { logoSlug } from "../nfl/model";
import { ChipImg } from "../logoTone";
import { Headshot } from "./Headshot";
import { Skeleton } from "./Skeleton";
import "../injuries.css";

type Impact = { score: number | null; tier: "High" | "Medium" | "Low" | "Minimal" | "Unknown"; basis: string; reason: string; usage?: number; share?: number; rank?: number; split?: { with: { n: number; pf: number; pa: number }; without: { n: number; pf: number; pa: number } } };
type Player = {
  id: string; name: string; pos: string | null; group: string | null; team: string; teamName?: string; logoId?: string; jersey: string | null; headshot: string | null;
  status: string; reported: string | null;
  injury: { type: string | null; location: string | null; side: string | null; detail: string | null };
  ret: { label: string; date: string | null; weeks: [number, number]; source: "ESPN" | "reported" | "estimate"; season: boolean };
  severity: "Season-ending" | "Long-term" | "Short-term" | "Game-time";
  impact: Impact; note: string | null; next: { opp: string | null; home: boolean; date: string; week: number | null } | null;
};
type League_ = { asOf: string; players: Player[]; season?: number; weeksLeft?: number };
type Data = { updatedAt: string; nfl: League_ | null; cfb: League_ | null };

const SEV_RANK = { "Season-ending": 3, "Long-term": 2, "Short-term": 1, "Game-time": 0 } as const;
const TIER_RANK = { High: 3, Medium: 2, Low: 1, Minimal: 0, Unknown: -1 } as const;
const SRC_NOTE = { ESPN: "ESPN's projected return", reported: "from the team or ESPN note", estimate: "an estimate: typical for this injury" } as const;
const short = (s: string) => ({ "Injured Reserve": "IR", "Out for season": "Out (season)" })[s] ?? s;
const statusCls = (s: string) => (/^out/i.test(s) || /injured/i.test(s) ? "out" : /doubtful/i.test(s) ? "doubtful" : /question/i.test(s) ? "questionable" : "other");
const GROUPS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "ST"];
const GROUP_NAME: Record<string, string> = { QB: "Quarterbacks", RB: "Running backs", WR: "Receivers", TE: "Tight ends", OL: "Offensive line", DL: "Defensive line", LB: "Linebackers", DB: "Defensive backs", ST: "Kickers and punters" };
const when = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const injuryText = (i: Player["injury"]) => [i.side, i.type ?? "Undisclosed"].filter(Boolean).join(" ") + (i.detail && i.detail !== i.type ? ` · ${i.detail}` : "");

function Card({ p, nfl }: { p: Player; nfl: boolean }) {
  const logo = nfl ? logos[logoSlug(p.teamName ?? "")] : p.logoId ? logos[p.logoId] : undefined;
  const im = p.impact;
  return (
    <li className={`ij-card sev-${p.severity.replace(/[^a-z]/gi, "").toLowerCase()}`}>
      <header>
        <Headshot src={p.headshot} name={p.name} size={44} className="ij-head" />
        <div className="ij-who">
          <strong>{p.name}</strong>
          <span>{p.pos ?? ""}{p.jersey ? ` #${p.jersey}` : ""} · {logo && <ChipImg src={logo} size={16} />} {p.team}</span>
        </div>
        <span className={`ij-status ${statusCls(p.status)}`}>{short(p.status)}</span>
      </header>
      <p className="ij-injury"><b>{injuryText(p.injury)}</b>{p.injury.location && p.injury.location !== p.injury.type ? <small> ({p.injury.location.toLowerCase()})</small> : null}</p>
      <div className="ij-ret">
        <span className={`ij-sev ${p.severity.replace(/[^a-z]/gi, "").toLowerCase()}`}>{p.severity}</span>
        <span className="ij-back">{p.ret.label}</span>
        <small title={SRC_NOTE[p.ret.source]}>{p.ret.source === "ESPN" ? "ESPN date" : p.ret.source === "reported" ? "reported" : "estimate"}</small>
      </div>
      <div className="ij-impact" role="group" aria-label={`Impact of the absence: ${im.tier}${im.score != null ? `, ${im.score} out of 100` : ""}`}>
        <div className="ij-imp-head"><span>Impact of the absence</span><b className={`tier-${im.tier.toLowerCase()}`}>{im.tier}{im.score != null ? ` · ${im.score}` : ""}</b></div>
        <span className="ij-meter"><i className={`tier-${im.tier.toLowerCase()}`} style={{ transform: `scaleX(${(im.score ?? 0) / 100})` }} /></span>
        <p className="ij-why">{im.reason}</p>
        <p className={`ij-basis${/^\d{4}/.test(im.basis) && im.basis.includes("no games this season") || im.basis.includes("only") ? " fallback" : ""}`}>Based on: {im.basis}</p>
        {im.split && <p className="ij-split">Team with him: {im.split.with.pf} scored, {im.split.with.pa} allowed ({im.split.with.n} g). Without: {im.split.without.pf} scored, {im.split.without.pa} allowed ({im.split.without.n} g). <small>Small sample.</small></p>}
      </div>
      {p.next && <p className="ij-next">Next: {p.next.home ? "vs" : "at"} {p.next.opp ?? "TBD"} · {when(p.next.date)}</p>}
      {p.note && <details className="ij-note"><summary>Latest note</summary><p>{p.note}</p></details>}
    </li>
  );
}

/** League-wide injury report: what the injury is, how serious, when the player is likely back, and how much his absence matters. */
export function InjuriesTab({ defaultLeague }: { defaultLeague: League }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [lg, setLg] = useState<"NFL" | "CFB">(defaultLeague === "CFB" ? "CFB" : "NFL");
  const [sort, setSort] = useState<"impact" | "return" | "severity">("impact");
  const [group, setGroup] = useState("all");
  const [team, setTeam] = useState("all");
  const [sev, setSev] = useState("all");
  const [min, setMin] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(30);
  useEffect(() => { let on = true; fetchData<Data>("injuries").then((d) => on && setData(d), () => on && setError(true)); return () => { on = false; }; }, []);
  const block = data ? (lg === "NFL" ? data.nfl : data.cfb) : null;
  const players = block?.players ?? [];
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
        <div className="segmented" role="group" aria-label="League">
          <button aria-pressed={lg === "CFB"} onClick={() => { setLg("CFB"); setTeam("all"); }}>College</button>
          <button aria-pressed={lg === "NFL"} onClick={() => { setLg("NFL"); setTeam("all"); }}>NFL</button>
        </div>
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
          <p className="ol-note ij-asof">{nfl ? "ESPN injury report" : "Conference availability reports for this week's games"}, as of {new Date(block.asOf).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}. Showing {Math.min(shown, list.length)} of {list.length}, {sort === "impact" ? "biggest impact first" : sort === "severity" ? "most serious first" : "back soonest first"}.</p>
          {list.length ? (
            <ul className="ij-grid">{list.slice(0, shown).map((p) => <Card key={p.id} p={p} nfl={nfl} />)}</ul>
          ) : <p className="ol-note">No players match these filters.</p>}
          {list.length > shown && <button type="button" className="btn small" onClick={() => setShown(shown + 30)}>Show {Math.min(30, list.length - shown)} more</button>}
          <details className="ij-how">
            <summary>How to read this</summary>
            <ul>
              <li><b>Injury and severity.</b> The injury is as ESPN lists it. Severity comes from the longest the player could miss: <i>Season-ending</i> (out for the year), <i>Long-term</i> (4 or more weeks, or IR), <i>Short-term</i> (about 1–3 weeks) and <i>Game-time</i> (could play this weekend).</li>
              <li><b>Back when.</b> "ESPN date" is ESPN's own projected return. "Reported" comes from a timeline in the team or ESPN note. "Estimate" is what is typical for that kind of injury (and at least 4 games on IR), not a medical forecast. Dates move.</li>
              <li><b>Impact of the absence</b> (0–100) is how much the team leaned on the player in the games he played: his share of snaps, and where his production per game ranks among players at his position (EPA for offense, tackles, sacks and takeaways for defense), weighted a little by position (a quarterback is harder to replace than a kicker). Linemen have no individual stats, so snaps alone decide theirs. <i>High</i> is 70 or more, <i>Medium</i> 45–69, <i>Low</i> 20–44.</li>
              <li><b>This season, else last.</b> With 3 or more games this season, impact uses this season. With fewer (a player who has been hurt since the summer), it uses last season, and the card says so. A player with no games in either season is shown as Unknown.</li>
              <li><b>With and without</b> shows the team's scoring in this season's games with and without the player, only when each side has at least two games. It is a small sample and also reflects opponents, so treat it as a hint.</li>
              {!nfl && <li><b>College.</b> Conferences (SEC, ACC, Big Ten, Big 12) say who is available, not what the injury is, and only the team's rushing, receiving and passing leaders have stats, so impact is shown only for them.</li>}
            </ul>
          </details>
          <p className="source-note">{nfl ? "Injury reports and return dates: ESPN. Snaps and player stats: nflverse (CC-BY 4.0)." : "Availability: conference reports via ESPN and the board."} Updated with each refresh.</p>
        </>
      )}
    </section>
  );
}
