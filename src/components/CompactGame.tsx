import { broadcastExtra, logos, networkLogo, recordLine, tierLabel, type League } from "../data";
import type { ReactNode } from "react";
import { dayOf, timeOf, tzAbbr } from "../tz";
import { NetChip } from "./NetChip";
import { useOpenGame } from "./GameCenterContext";
import { SquareActivity } from "lucide-react";
import { PlusRank } from "./PlusRank";
import { ScoreRing } from "./ScoreRing";

type Team = { name: string; logoId: string; record: string; ranks?: unknown; abbr?: string; espnId?: string | null };
export function CompactGame({ titleId, matchup, date, broadcast, network, espnId, teams, league, score, tier, venue, driveChart, top, badge, weather, status, scores, momentum, lineStrip, why, rise, injuries, onExpand }: {
  titleId: string; matchup: string; date: string; broadcast: string; network?: string | null; espnId?: string | null;
  teams: Team[]; league: string; score: number; tier: string; venue: string;
  driveChart?: ReactNode; top?: ReactNode; badge?: ReactNode; weather?: { icon: string; title: string; detail: string; impact: string };
  status?: ReactNode; scores?: ReactNode[]; momentum?: ReactNode; lineStrip?: ReactNode; why?: ReactNode; rise?: number; injuries?: ReactNode; onExpand: () => void;
}) {
  const openGame = useOpenGame();
  const logo = networkLogo(network);
  const impact = weather?.impact.replace(/\s*impact$/i, "").toLowerCase();
  const gc = espnId ? <button type="button" className="cc-gc" title="Open Game Center" aria-label={`Open Game Center for ${matchup}`} onClick={e => { e.stopPropagation(); openGame(espnId); }}><SquareActivity size={16} aria-hidden="true" /><span>GC</span></button> : null;
  return <div className="compact-overview v2">
    {top}
    {/* One row across the top, as on the NHL cards: when it is on, and where to watch it with the Game Center beside it. */}
    <header className="card-top cc-top">
      <div className="cc-when kickoff"><span className="cc-time"><strong>{dayOf(date)}</strong> {timeOf(date)} {tzAbbr()}</span>{status}</div>
      <div className="cc-right">
        <div className="tv cc-network">{logo ? <><NetChip network={network} logo={logo} game={{ league, espnId, broadcast }} /><span className="sr-only">{broadcast}</span>{broadcastExtra(broadcast, network) && <span aria-hidden="true">{broadcastExtra(broadcast, network)}</span>}</> : broadcast}</div>
        {gc}
      </div>
    </header>
    {badge}
    <h3 className="sr-only" id={titleId}>{matchup}</h3>
    <div className="matchup">
      <div className="matchup-teams">{teams.map((team, i) => <div className="team-heading cc-team" key={team.name}>
        <img src={logos[team.logoId]} alt="" width="36" height="36" loading="lazy" decoding="async" />
        <div><h4><PlusRank league={league} team={team} />{team.name}{i === 1 && <span className="home-tag">Home</span>}</h4>
          <p>{recordLine(team.record, league as League).split(" · ")[0]}</p>
        </div>{scores?.[i]}
      </div>)}</div>
      <div className="score cc-rate" aria-label={`Watchability ${score} out of 100, ${tierLabel(tier)}`}><ScoreRing score={score} label={`Watchability ${score} out of 100, ${tierLabel(tier)}`}>{why}</ScoreRing><span className="score-tier">{tierLabel(tier)}</span>{rise ? <em className="rise-tag" title="This game got more worth watching as it played">▲ up {rise}</em> : null}</div>
    </div>
    {driveChart}
    {/* the venue on one quiet line, and the weather only when it will matter; the betting line, booth and full forecast are in Details */}
    <ul className="facts" aria-label="Game info">
      <li className="cc-venue"><span aria-hidden="true">📍 </span>{venue}
        {weather && impact && impact !== "none" && impact !== "low" && <span className="weather cc-weather"> · {weather.icon} {weather.title} <span className={`impact-pill ${impact}`}>{impact} weather impact</span></span>}
      </li>
    </ul>
    {injuries}
    {lineStrip}
    {momentum}
    <div className="cc-actions"><button className="card-toggle cc-chevron" type="button" aria-label="Show game details" aria-expanded={false} onClick={onExpand}>Details <span aria-hidden="true">▾</span></button></div>
  </div>;
}
