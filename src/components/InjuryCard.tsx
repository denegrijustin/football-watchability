import { logos } from "../data";
import { logoSlug } from "../nfl/model";
import { backShort, basisShort, impactShort, injuryLine, type Player } from "../injuries";
import { ChipImg } from "../logoTone";
import { Headshot } from "./Headshot";
import { InjuryFigure } from "./InjuryFigure";
import "../injuryCard.css";

const short = (s: string) => ({ "Injured Reserve": "Injured reserve", "Out for season": "Out for season" })[s] ?? s;

/**
 * One injured player, in a few words: who, how serious, the injury, the status, when he is back, an animated figure of the injured area, and how
 * much the team misses him. The reason behind the impact is in the tooltip, not on the card.
 */
export function InjuryCard({ p, nfl, season }: { p: Player; nfl: boolean; season?: number }) {
  const logo = nfl ? logos[logoSlug(p.teamName ?? "")] : p.logoId ? logos[p.logoId] : undefined;
  const im = p.impact, imp = impactShort(im), basis = basisShort(im, season);
  const sev = p.severity.replace(/[^a-z]/gi, "").toLowerCase();
  return (
    <li className={`jc sev-${sev}`}>
      <div className="jc-who">
        <Headshot src={p.headshot} name={p.name} size={48} className="jc-head" />
        <div className="jc-name"><b>{p.name}</b><span>{p.pos}{p.jersey ? ` #${p.jersey}` : ""} · {logo && <ChipImg src={logo} size={16} />} {p.teamName ?? p.team}</span></div>
        <span className={`jc-sev ${sev}`}>{p.severity}</span>
      </div>
      <div className="jc-mid">
        <dl className="jc-facts">
          <div><dt>Injury</dt><dd>{injuryLine(p.injury)}</dd></div>
          <div><dt>Status</dt><dd>{short(p.status)}</dd></div>
          <div><dt>Back</dt><dd>{backShort(p.ret)}</dd></div>
        </dl>
        <InjuryFigure type={p.injury.type} location={p.injury.location} side={p.injury.side} detail={p.injury.detail} size={44} />
      </div>
      <div className={`jc-impact tier-${im.tier.toLowerCase()}`} title={`${im.reason} Based on: ${im.basis}.`}>
        <div className="jc-top"><b>{imp.label}</b>{imp.top && <span>{imp.top}</span>}</div>
        <span className="jc-bar"><i style={{ transform: `scaleX(${(im.score ?? 0) / 100})` }} /></span>
        <small>{basis.text}{basis.last && <em> · last season</em>}</small>
      </div>
    </li>
  );
}
