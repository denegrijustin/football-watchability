import { logos, networkLogo, rankLine, rankTitle, recordLine, tierLabel, type Ranks, type League } from "../data";
import { Booth, type CrewMember } from "./Booth";
import type { ReactNode } from "react";
import { dayOf, timeOf, tzAbbr } from "../tz";
import { NetChip } from "./NetChip";
import { useOpenGame } from "./GameCenter";
import { SquareActivity } from "lucide-react";

type Team = { name: string; logoId: string; record: string; ranks?: unknown };
export function CompactGame({ titleId, matchup, date, broadcast, network, espnId, teams, league, score, tier, venue, line, crew, weather, status, scores, onExpand }: {
  titleId: string; matchup: string; date: string; broadcast: string; network?: string | null; espnId?: string | null;
  teams: Team[]; league: string; score: number; tier: string; venue: string; line?: string | null;
  crew?: CrewMember[]; weather?: { icon: string; title: string; detail: string; impact: string };
  status?: ReactNode; scores?: ReactNode[]; onExpand: () => void;
}) {
  const openGame = useOpenGame();
  const logo = networkLogo(network);
  const impact = weather?.impact.replace(/\s*impact$/i, "").toLowerCase();
  return <div className="compact-overview">
    <header className="card-top">
      <div className="cc-when kickoff"><span className="cc-time"><strong>{dayOf(date)}</strong> {timeOf(date)} {tzAbbr()}</span>{status}</div>
      <div className="tv cc-network">{logo && <NetChip network={network} logo={logo} game={{ league, espnId, broadcast }} />}{broadcast}</div>
    </header>
    <h3 className="sr-only" id={titleId}>{matchup}</h3>
    <div className="matchup">
      <div className="matchup-teams">{teams.map((team, i) => <div className="team-heading cc-team" key={team.name}>
        <img src={logos[team.logoId]} alt="" width="36" height="36" loading="lazy" />
        <div><h4>{team.name}{i === 1 && <span className="home-tag">Home</span>}</h4>
          <p>{recordLine(team.record, league as League)}</p>
          {rankLine(team.ranks as Ranks) && <p className="rank-line" title={rankTitle(team.ranks as Ranks)}>{rankLine(team.ranks as Ranks)}</p>}
        </div>{scores?.[i]}
      </div>)}</div>
      <div className="score cc-rate" aria-label={`Watchability ${score} out of 100, ${tierLabel(tier)}`}><strong>{score}</strong><span className="score-tier">{tierLabel(tier)}</span></div>
    </div>
    <ul className="facts" aria-label="Game info">
      <li><span aria-hidden="true">📍 </span>{venue}{line && <span> · ⚖️ {line}</span>}</li>
      <Booth crew={crew} />
      <li className="weather cc-weather"><span>{weather ? `${weather.icon} ${weather.title} · ${weather.detail}` : "Weather: archived forecast unavailable"}</span>
        {impact && impact !== "none" && impact !== "low" && <span className={`impact-pill ${impact}`}>{impact} weather impact</span>}
      </li>
    </ul>
    <div className="cc-actions">{espnId && <button type="button" className="cc-gc" title="Open Game Center" aria-label={`Open Game Center for ${matchup}`} onClick={e => { e.stopPropagation(); openGame(espnId); }}><SquareActivity size={16} aria-hidden="true" /><span>GC</span></button>}<button className="card-toggle cc-chevron" type="button" aria-label="Show game details" aria-expanded={false} onClick={onExpand}>Details <span aria-hidden="true">▾</span></button></div>
  </div>;
}
