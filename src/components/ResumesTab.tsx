import { useDeferredValue, useMemo, useState } from "react";
import { logos, type League } from "../data";
import { usePickData } from "../pickData";
import { ChipImg } from "../logoTone";
import { cfbResumes, nflResumes, BAD_HOME, BAD_ROAD, type ResGame, type Resume } from "../resume";
import { TeamOpen, type TeamRef } from "../openTeam";
import { Skeleton } from "./Skeleton";
import "../resume.css";

const dateText = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** A stat rank as a heat class: the top fifth is green, the bottom fifth red. */
const heat = (rk: number | null, n: number) => (rk == null ? "" : rk <= n * 0.2 ? "hi" : rk > n * 0.8 ? "lo" : rk <= n * 0.5 ? "mid-hi" : "mid-lo");

function Game({ g, win, logo, to }: { g: ResGame; win: boolean; logo: string | undefined; to: TeamRef }) {
  const where = g.venue === "at" ? "at" : g.venue === "N" ? "N" : "vs";
  const who = g.oppRk != null ? `#${g.oppRk}` : g.oppDiv ?? "";
  return (
    <li className={`rs-g ${win ? "win" : "loss"}${g.bad ? " bad" : ""}`} title={`${win ? "Won" : "Lost"} ${g.pts}–${g.oppPts} ${g.venue === "at" ? "at" : g.venue === "N" ? "(neutral) vs" : "vs"} ${g.opp}${g.oppRk != null ? ` (#${g.oppRk} by the ratings)` : g.oppDiv ? ` (${g.oppDiv})` : ""}, ${dateText(g.date)}${g.bad ? ". A bad loss: to a team outside the ratings' top group." : ""}`}>
      <TeamOpen className="img" team={to}>{logo ? <ChipImg src={logo} size={22} /> : <span className="rs-nologo" aria-hidden="true">{g.opp.slice(0, 2)}</span>}</TeamOpen>
      <span className="rs-score"><b>{g.pts}–{g.oppPts}</b><small>{where} {who}</small></span>
      {g.bad && <em className="rs-bad">BAD</em>}
    </li>
  );
}

function Row({ r, logoOf }: { r: Resume; logoOf: (key: string, name: string) => string | undefined }) {
  return (
    <li className="rs-row">
      <div className="rs-team">
        <span className="rs-rank">{r.rank}</span>
        {logoOf(r.logoKey, r.name) && <TeamOpen className="img" team={r.ref}><ChipImg src={logoOf(r.logoKey, r.name)!} size={30} /></TeamOpen>}
        <span className="rs-name"><b><TeamOpen team={r.ref}>{r.name}</TeamOpen></b><small>{r.w}-{r.l}{r.t ? `-${r.t}` : ""}{r.conf ? ` · ${r.conf}` : ""}</small></span>
      </div>
      <div className="rs-col wins" aria-label={`Best wins, ${r.name}`}>
        <h4>Best wins</h4>
        {r.wins.length ? <ul>{r.wins.map((g, i) => <Game key={i} g={g} win logo={logoOf(g.oppKey, g.opp)} to={g.ref} />)}</ul> : <p className="rs-none">No wins yet</p>}
      </div>
      <div className="rs-col losses" aria-label={`Losses, ${r.name}`}>
        <h4>Losses</h4>
        {r.losses.length ? <ul>{r.losses.map((g, i) => <Game key={i} g={g} win={false} logo={logoOf(g.oppKey, g.opp)} to={g.ref} />)}</ul> : <p className="rs-none">Unbeaten</p>}
      </div>
      <dl className="rs-stats">
        <div className={heat(r.sos, r.of)} title="Strength of schedule so far, among all teams. 1 is the toughest."><dt>SOS</dt><dd>{r.sos ?? "—"}</dd></div>
        <div className={heat(r.off, r.of)} title="Offense rank by the ratings"><dt>OFF</dt><dd>{r.off ?? "—"}</dd></div>
        <div className={heat(r.def, r.of)} title="Defense rank by the ratings"><dt>DEF</dt><dd>{r.def ?? "—"}</dd></div>
      </dl>
    </li>
  );
}

/**
 * Every team's resumé, ranked by the same SP+ (college) and NFL+ (NFL) ratings as the rating tabs: who each team beat, who beat it, how hard its schedule
 * has been, and how its offense and defense rank. College covers every FBS team, not only a top 25.
 */
export function ResumesTab({ defaultLeague }: { defaultLeague: League }) {
  const [lg, setLg] = useState<"CFB" | "NFL">(defaultLeague === "CFB" ? "CFB" : "NFL");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim().toLowerCase());
  const { data, error } = usePickData();
  const rows = useMemo(() => (data ? (lg === "CFB" ? cfbResumes(data.model) : nflResumes(data.nfl)) : []), [data, lg]);
  const logoOf = useMemo(() => (key: string, name: string): string | undefined => {
    if (lg === "NFL") return logos[key];
    const t = data?.model.byName.get(name)?.find((x) => x.division === "FBS") ?? data?.model.byName.get(name)?.[0];
    return t?.logo?.local ?? t?.logo?.remote;
  }, [lg, data]);
  const shown = dq ? rows.filter((r) => r.name.toLowerCase().includes(dq) || (r.conf ?? "").toLowerCase().includes(dq)) : rows;
  const nfl = lg === "NFL";
  return (
    <section className="rs" aria-label="Team resumés">
      <div className="rs-head">
        <h2>Team resumés</h2>
        <div className="sd-chips" role="group" aria-label="League">
          {(["CFB", "NFL"] as const).map((k) => <button key={k} type="button" aria-pressed={lg === k} onClick={() => setLg(k)}>{k === "CFB" ? "College (all FBS)" : "NFL"}</button>)}
        </div>
        <label className="rs-search"><span className="sr-only">Find a team or conference</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a team or conference" /></label>
      </div>
      <details className="rs-note">
        <summary>How to read this</summary>
        <p>
        Ordered by the {nfl ? "NFL+" : "SP+"} rating, best first. <b>Best wins</b> are the three over the highest-rated opponents; <b>losses</b> are all of them. “vs” is at home, “at” on the road, “N” neutral, and #n is the
        opponent's rank. <b className="rs-bad-key">BAD</b> is a loss to a team ranked outside the top {nfl ? BAD_HOME.NFL : BAD_HOME.CFB} ({nfl ? BAD_ROAD.NFL : BAD_ROAD.CFB} on the road){nfl ? "" : ", or to a lower-division school"}. SOS, OFF and DEF are ranks among all {rows.length || (nfl ? 32 : 138)} {nfl ? "NFL" : "FBS"} teams (SOS 1 is the toughest schedule so far).
        </p>
      </details>
      {error ? <p role="alert" className="rs-none">The resumés could not load. Reload the page to try again.</p> : !data ? <Skeleton rows={6} /> : (
        <ol className="rs-list">
          {shown.map((r) => <Row key={r.key} r={r} logoOf={logoOf} />)}
          {!shown.length && <li className="rs-none">No team matches “{q}”.</li>}
        </ol>
      )}
    </section>
  );
}
