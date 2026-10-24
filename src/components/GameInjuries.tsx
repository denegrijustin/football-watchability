import { logos } from "../data";
import { injuriesForTeam, useInjuryReport, type Player } from "../injuries";
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

function Row({ p }: { p: Player }) {
  const im = p.impact;
  return (
    <li>
      <details className="gi-row">
        <summary>
          <Headshot src={p.headshot} name={p.name} size={36} className="gi-head" />
          <span className="gi-name"><strong>{p.name}</strong> <em>{p.pos}{p.jersey ? ` #${p.jersey}` : ""}</em><span className="gi-inj">{injuryText(p.injury)}</span></span>
          <span className="gi-right"><span className={`gi-status ${cls(p.status)}`}>{short(p.status)}</span><span className={`gi-tier tier-${im.tier.toLowerCase()}`}>{im.tier}{im.score != null ? ` ${im.score}` : ""}</span></span>
        </summary>
        <div className="gi-more">
          <InjuryFigure type={p.injury.type} location={p.injury.location} side={p.injury.side} detail={p.injury.detail} size={52} />
          <div className="gi-text">
            <p><span className={`gi-sev ${p.severity.replace(/[^a-z]/gi, "").toLowerCase()}`}>{p.severity}</span> <b>{p.ret.label}</b> <small>{p.ret.source === "ESPN" ? "ESPN date" : p.ret.source === "reported" ? "reported" : "estimate"}</small></p>
            <span className="gi-meter"><i className={`tier-${im.tier.toLowerCase()}`} style={{ transform: `scaleX(${(im.score ?? 0) / 100})` }} /></span>
            <p>{im.reason} <small>Based on: {im.basis}.</small></p>
            {im.split && <p><small>Team with him: {im.split.with.pf} scored, {im.split.with.pa} allowed ({im.split.with.n} g). Without: {im.split.without.pf} scored, {im.split.without.pa} allowed ({im.split.without.n} g).</small></p>}
          </div>
        </div>
      </details>
    </li>
  );
}

type Mode = "section" | "fold" | "bare";

function Lists({ teams, league, d }: { teams: T[]; league: string; d: NonNullable<ReturnType<typeof useInjuryReport>> }) {
  const lists = teams.map((t) => ({ t, list: injuriesForTeam(d, league, t.logoId) }));
  return (
    <>
      {lists.map(({ t, list }) => (
        <div key={t.logoId} className="gi-team">
          <h5>{logos[t.logoId] && <ChipImg src={logos[t.logoId]} size={18} />} {t.name} <small>{list.length ? `${list.length} listed` : "none listed"}</small></h5>
          {list.length > 0 && <ul>{list.slice(0, 6).map((p) => <Row key={p.id} p={p} />)}</ul>}
          {list.length > 6 && <p className="gi-more-note">+{list.length - 6} more</p>}
        </div>
      ))}
      <button type="button" className="btn small ghost" onClick={openReport}>Full injury report →</button>
    </>
  );
}

/**
 * Each team's injured players, biggest impact first, each opening to a figure of the injured area, severity, return and why it matters.
 * "fold" is the card's closed-by-default option, "bare" is the content alone (for the Game Center's own expandable section).
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
        <summary><span className="cd-h">Injuries</span> <small>{count} listed · tap for who, what and how much it matters</small></summary>
        <Lists teams={teams} league={league} d={d} />
      </details>
    );
  }
  return (
    <section className="cd-sec gi" aria-label="Injuries">
      <h4 className="cd-h">Injuries <small>impact of each absence, from prior games</small></h4>
      <Lists teams={teams} league={league} d={d} />
    </section>
  );
}

/** The Game Center's expandable injury option: closed until opened, with the injury count on its heading. */
export function InjuryImpact({ teams, league }: { teams: T[]; league: string }) {
  const d = useInjuryReport();
  if (!d) return null;
  const count = teams.reduce((n, t) => n + injuriesForTeam(d, league, t.logoId).length, 0);
  if (!count) return null;
  return (
    <details>
      <summary>Injuries by impact <small className="inj-sum">{count} listed · photo, injury area, return and effect on the team</small><span aria-hidden="true">+</span></summary>
      <div className="detail-content"><GameInjuries teams={teams} league={league} mode="bare" /></div>
    </details>
  );
}
