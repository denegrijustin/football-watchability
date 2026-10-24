import { useState } from "react";
import { logos } from "../data";
import { backShort, impactShort, injuriesForTeam, injuryLine, useInjuryReport, type Player } from "../injuries";
import { ChipImg } from "../logoTone";
import { Headshot } from "./Headshot";
import { InjuryFigure } from "./InjuryFigure";
import "../gameInjuries.css";

type T = { name: string; abbr?: string; logoId: string };
const short = (s: string) => ({ "Injured Reserve": "IR", "Out for season": "Out (season)" })[s] ?? s;
const cls = (s: string) => (/^out|injured/i.test(s) ? "out" : /doubtful/i.test(s) ? "doubtful" : "questionable");
const lastName = (n: string) => n.replace(/\s+(Jr|Sr|II|III|IV)\.?$/i, "").split(" ").slice(-1)[0];
const injuryText = (i: Player["injury"]) => [i.side, i.type ?? "undisclosed"].filter(Boolean).join(" ").toLowerCase();
const openReport = () => window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: "injuries" }));
/** Players worth a mention on the card face: out, doubtful or questionable, and a real loss (High, or Medium for a starter). */
const keyOnes = (list: Player[]) => list.filter((p) => p.status !== "Probable" && (p.impact.tier === "High" || p.impact.tier === "Medium") && p.ret.weeks[1] >= 0);

/** One line on the collapsed card: the biggest injuries in this game, with the injury and how much the loss matters. */
export function InjuryStrip({ teams, league }: { teams: T[]; league: string }) {
  const d = useInjuryReport();
  const items = teams.flatMap((t) => keyOnes(injuriesForTeam(d, league, t.logoId)).slice(0, 2).map((p) => ({ p, abbr: t.abbr ?? t.name }))).sort((a, b) => (b.p.impact.score ?? 0) - (a.p.impact.score ?? 0)).slice(0, 3);
  if (!items.length) return null;
  return (
    <p className="gi-strip" aria-label="Key injuries">
      <span className="gi-label">Injuries</span>
      {items.map(({ p, abbr }) => (
        <span key={p.id} className={`gi-chip ${cls(p.status)}`} title={`${p.name}: ${p.status}${p.injury.type ? `, ${injuryText(p.injury)}` : ""}. Impact ${p.impact.tier}${p.impact.score != null ? ` (${p.impact.score})` : ""}. ${p.ret.label}.`}>
          <Headshot src={p.headshot} name={p.name} size={18} className="gi-av" /><b>{abbr}</b> {lastName(p.name)} <em>{p.pos}</em> · {short(p.status)}{p.injury.type ? ` · ${injuryText(p.injury)}` : ""} <i className={`tier-${p.impact.tier.toLowerCase()}`}>{p.impact.tier}</i>
        </span>
      ))}
    </p>
  );
}

const SHOWN = 4;
function Row({ p, team }: { p: Player; team: string }) {
  const im = impactShort(p.impact), sev = p.severity.replace(/[^a-z]/gi, "").toLowerCase();
  return (
    <li className={`gi-card sev-${sev}`} title={`${p.impact.reason} Based on: ${p.impact.basis}.`}>
      <Headshot src={p.headshot} name={p.name} size={40} className="gi-head" />
      <span className="gi-name"><b>{p.name}</b> <em>{p.pos}</em> <span className={`gi-sev ${sev}`}>{p.severity}</span></span>
      <span className="gi-line">{injuryLine(p.injury)} · {backShort(p.ret)}</span>
      <span className={`gi-impact tier-${p.impact.tier.toLowerCase()}`}>{im.label}{im.top ? ` · ${im.top}` : ""}</span>
      <span className="gi-fig"><InjuryFigure team={team} type={p.injury.type} location={p.injury.location} side={p.injury.side} detail={p.injury.detail} size={28} /></span>
    </li>
  );
}

type Mode = "section" | "fold" | "bare";

function Lists({ teams, league, d }: { teams: T[]; league: string; d: NonNullable<ReturnType<typeof useInjuryReport>> }) {
  return (
    <>
      {teams.map((t) => <Side key={t.logoId} t={t} list={injuriesForTeam(d, league, t.logoId)} />)}
      <button type="button" className="btn small ghost" onClick={openReport}>All injuries →</button>
    </>
  );
}
function Side({ t, list }: { t: T; list: Player[] }) {
  const [all, setAll] = useState(false);
  const high = list.filter((p) => p.impact.tier === "High").length;
  return (
    <div className="gi-team">
      <h5>{logos[t.logoId] && <ChipImg src={logos[t.logoId]} size={18} />} {t.name} <small>{list.length ? `${list.length} out${high ? ` · ${high} high-impact` : ""}` : "none listed"}</small></h5>
      {list.length > 0 && <ul>{(all ? list : list.slice(0, SHOWN)).map((p) => <Row key={p.id} p={p} team={t.logoId} />)}</ul>}
      {list.length > SHOWN && <button type="button" className="gi-more-btn" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${list.length}`}</button>}
    </div>
  );
}

/**
 * Each team's injured players, biggest impact first, in a few words and an animated figure of the injured area. "fold" is the card's closed-by-default
 * option, "bare" is the content alone (for the Game Center's expandable section).
 */
export function GameInjuries({ teams, league, mode = "section" }: { teams: T[]; league: string; mode?: Mode }) {
  const d = useInjuryReport();
  if (!d) return null;
  const count = teams.reduce((n, t) => n + injuriesForTeam(d, league, t.logoId).length, 0);
  if (!count) return null;
  if (mode === "bare") return <div className="gi gi-bare"><Lists teams={teams} league={league} d={d} /></div>;
  if (mode === "fold") {
    return (
      <details className="cd-sec gi gi-fold">
        <summary><span className="cd-h">Injuries</span> <small>{count} out</small></summary>
        <Lists teams={teams} league={league} d={d} />
      </details>
    );
  }
  return (
    <section className="cd-sec gi" aria-label="Injuries">
      <h4 className="cd-h">Injuries</h4>
      <Lists teams={teams} league={league} d={d} />
    </section>
  );
}

/** Whether the report has anyone to show for this game (the Game Center falls back to the conference report when it does not). */
export function useHasInjuryReport(teams: T[], league: string) {
  const d = useInjuryReport();
  return !!d && teams.some((t) => injuriesForTeam(d, league, t.logoId).length);
}
