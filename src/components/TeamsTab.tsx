import { Suspense, useDeferredValue, useEffect, useState, useSyncExternalStore } from "react";
import type { League } from "../data";
import { hubTeam, openTeam, pointRatingsAt, setHubTeam, subscribeHub, type TeamRef } from "../openTeam";
import { ChipImg } from "../logoTone";
import { lazyView } from "../lazyView";
import { ResumeRow, useResumes } from "./ResumesTab";
import { InjuriesTab } from "./InjuriesTab";
import { Skeleton } from "./Skeleton";
import "../resume.css";
import "../teams.css";

const SpPlusTab = lazyView(() => import("../spplus/SpPlusTab"), "SpPlusTab");
const NflTab = lazyView(() => import("../nfl/NflTab"), "NflTab");

type Section = "resume" | "ratings" | "injuries";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "resume", label: "Resumé" },
  { id: "ratings", label: "Ratings & performance" },
  { id: "injuries", label: "Injuries" },
];

/**
 * One page per team. Every team name or logo in the app opens it: the resumé (best wins, losses, schedule strength), the ratings and the eight
 * performance views (the NFL+ and SP+ team views), and the team's injuries. With no team chosen it is the list of every team to pick from.
 */
export function TeamsTab({ defaultLeague }: { defaultLeague: League }) {
  const team = useSyncExternalStore(subscribeHub, hubTeam, hubTeam);
  const [lg, setLg] = useState<"CFB" | "NFL">(team ? (team.league === "NFL" ? "NFL" : "CFB") : defaultLeague === "CFB" ? "CFB" : "NFL");
  useEffect(() => { if (team) setLg(team.league === "NFL" ? "NFL" : "CFB"); }, [team]);
  return team ? <TeamPage team={team} /> : <TeamList lg={lg} setLg={setLg} />;
}

function TeamList({ lg, setLg }: { lg: "CFB" | "NFL"; setLg: (l: "CFB" | "NFL") => void }) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim().toLowerCase());
  const { data, error, rows, logoOf } = useResumes(lg);
  const shown = dq ? rows.filter((r) => r.name.toLowerCase().includes(dq) || (r.conf ?? "").toLowerCase().includes(dq)) : rows;
  return (
    <section className="tm" aria-label="Teams">
      <div className="rs-head">
        <h2>Teams</h2>
        <div className="sd-chips" role="group" aria-label="League">
          {(["CFB", "NFL"] as const).map((k) => <button key={k} type="button" aria-pressed={lg === k} onClick={() => setLg(k)}>{k === "CFB" ? "College (all FBS)" : "NFL"}</button>)}
        </div>
        <label className="rs-search"><span className="sr-only">Find a team or conference</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a team or conference" /></label>
      </div>
      {error ? <p role="alert" className="rs-none">The teams could not load. Reload the page to try again.</p> : !data ? <Skeleton rows={6} /> : (
        <ul className="tm-grid">
          {shown.map((r) => (
            <li key={r.key}>
              <button type="button" className="tm-pick" onClick={() => openTeam(r.ref)}>
                {logoOf(r.logoKey, r.name) ? <ChipImg src={logoOf(r.logoKey, r.name)!} size={30} /> : <span className="rs-nologo" aria-hidden="true">{r.name.slice(0, 2)}</span>}
                <span><b>{r.name}</b><small>#{r.rank} · {r.w}-{r.l}{r.t ? `-${r.t}` : ""}{r.conf ? ` · ${r.conf}` : ""}</small></span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="rs-none">No team matches “{q}”.</li>}
        </ul>
      )}
    </section>
  );
}

function TeamPage({ team }: { team: TeamRef }) {
  const lg = team.league === "NFL" ? "NFL" : "CFB";
  const [section, setSection] = useState<Section>("resume");
  const { data, error, rows, logoOf } = useResumes(lg);
  const row = rows.find((r) => (lg === "NFL" ? (r.ref.abbr === team.abbr || r.name === team.name) : r.name === team.name || r.key === team.id));
  useEffect(() => { if (section === "ratings") pointRatingsAt(team); }, [section, team]);
  const names = [team.name, team.abbr, row?.name, row?.ref.abbr].filter(Boolean) as string[];
  return (
    <section className="tm" aria-label={`${team.name} team page`}>
      <div className="tm-head">
        <button type="button" className="tm-back" onClick={() => setHubTeam(null)}><span aria-hidden="true">‹</span> All teams</button>
        {row && logoOf(row.logoKey, row.name) && <ChipImg src={logoOf(row.logoKey, row.name)!} size={40} />}
        <div><h2>{row?.name ?? team.name}</h2>{row && <p>#{row.rank} · {row.w}-{row.l}{row.t ? `-${row.t}` : ""}{row.conf ? ` · ${row.conf}` : ""}</p>}</div>
      </div>
      <div className="tm-sections segmented" role="group" aria-label="Team page sections">
        {SECTIONS.map((s) => <button key={s.id} type="button" aria-pressed={section === s.id} onClick={() => setSection(s.id)}>{s.label}</button>)}
      </div>
      {section === "resume" && (error ? <p role="alert" className="rs-none">The resumé could not load.</p> : !data ? <Skeleton rows={3} /> : row ? <ol className="rs-list"><ResumeRow r={row} logoOf={logoOf} /></ol> : <p className="rs-none">No resumé for {team.name} yet.</p>)}
      {section === "ratings" && <Suspense fallback={<Skeleton rows={4} />}>{lg === "NFL" ? <NflTab /> : <SpPlusTab />}</Suspense>}
      {section === "injuries" && <InjuriesTab defaultLeague={lg} only={{ league: lg, names }} />}
    </section>
  );
}
