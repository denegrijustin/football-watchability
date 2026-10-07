import { CompactGame } from "./CompactGame";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { nameParts } from "../teamName";
import { deltaValue, logos, parseMeta, tierLabel, type Game } from "../data";
import { Stakes } from "./TeamImpact";
import { GameDetails } from "./GameDetails";
import { WeatherLook } from "./WeatherLook";
import { TeamForm } from "./Trends";
import {
  networkLogo,
  rankLine,
  rankTitle,
  recordLine,
  teamColor,
  type Ranks,
} from "../data";
import { PregameWinProb, type WinProbData } from "./PregameWinProb";
import { ProjectedScore, type Projection } from "./ProjectedScore";
import { GameStatus, TeamScore, useFlow, useLive } from "../live";
import { InsanityMeter } from "./InsanityMeter";
import { useOpenGame } from "./GameCenter";
import { EdgeLine, type Advanced } from "./AdvancedStats";
import { InjuryWatch } from "./InjuryReport";
import { Booth, type CrewMember } from "./Booth";
import { dayOf, timeOf, tzAbbr } from "../tz";
import { directvChannel, directvTitle } from "../directv";

const impactLevel = (impact: string) =>
  impact.replace(/\s*impact$/i, "").toLowerCase();

/**
 * One upcoming game. Opens compact (teams, watchability, venue, line and
 * weather); a click expands it in place to the full card, and a click on the
 * matchup of an expanded card opens the Game Center.
 */
export function GameCard({
  game,
  defaultExpanded = false,
}: {
  game: Game;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!expanded || defaultExpanded) return;
    const outside = (event: PointerEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (!cardRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) setExpanded(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [expanded, defaultExpanded]);
  const net = (game as { network?: string | null }).network;
  const netLogo = networkLogo(net);
  const meta = parseMeta(game.meta);
  const date = (game as { date?: string }).date ?? "";
  const delta = deltaValue(game.delta);
  const impact = impactLevel(game.weather.impact);
  const [away, home] = game.teams;
  // Card background: the home team's dark color (deepened for contrast at build time).
  const awayAbbr = (away as { abbr?: string }).abbr ?? away.name;
  const homeAbbr = (home as { abbr?: string }).abbr ?? home.name;
  const live = useLive(game.espnId);
  const flow = useFlow(game.espnId, game.league, live);
  const openGame = useOpenGame();
  const homeColor = teamColor((home as { color?: string | null }).color);
  const toggle = (
    <button
      type="button"
      className="card-toggle"
      aria-expanded={expanded}
      aria-controls={`${game.id}-more`}
      onClick={() => setExpanded((x) => !x)}
    >
      {expanded ? "Less" : "Details"}{" "}
      <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
    </button>
  );
  const chevron = (
    <button
      type="button"
      className="card-toggle cc-chevron"
      aria-expanded={false}
      aria-controls={`${game.id}-more`}
      aria-label="Show game details"
      onClick={() => setExpanded(true)}
    >
      <span aria-hidden="true">▾</span>
    </button>
  );
  return (
    <article
      ref={cardRef}
      data-game-id={game.id}
      className={`game-card ${game.tier}${homeColor ? " team-tinted" : ""}${expanded ? " expanded" : " compact"}`}
      style={
        homeColor ? ({ "--team-bg": homeColor } as CSSProperties) : undefined
      }
      aria-labelledby={`${game.id}-title`}
      onClick={(e) => {
        if (!expanded && !(e.target as HTMLElement).closest("a,button,summary"))
          setExpanded(true);
      }}
    >
      {!expanded && <CompactGame titleId={`${game.id}-title`} matchup={game.matchup} date={date} broadcast={game.broadcast} network={game.network} teams={game.teams} league={game.league} score={game.score} tier={game.tier} venue={meta.venue} line={meta.line} crew={(game as { announcers?: CrewMember[] }).announcers} weather={game.weather} status={<GameStatus live={live} />} scores={[<TeamScore live={live} side="away" />, <TeamScore live={live} side="home" />]} onExpand={() => setExpanded(true)} />}
      {expanded && (
        <>
      <header className="card-top">
        <div className="kickoff">
          <strong>{dayOf(date)}</strong> {timeOf(date)} {tzAbbr()}
        </div>
        <div
          className={`tv ${netLogo ? "has-logo" : ""}`}
          title="Where to watch"
        >
          {netLogo ? (
            <span className={`net-chip${directvChannel(net) ? " has-ch" : ""}`} title={directvTitle(net)}>
              <img src={netLogo} alt="" height="16" loading="lazy" />
              {directvChannel(net) && <b className="ch-num">{directvChannel(net)}</b>}
            </span>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
              <rect
                x="3"
                y="5"
                width="18"
                height="12"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path d="M8 21h8" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
          <span className="sr-only">Where to watch: </span>
          {game.broadcast}
        </div>
      </header>
      {flow && (
        <InsanityMeter
          wp={flow}
          final={live?.state === "post"}
          away={awayAbbr}
          home={homeAbbr}
        />
      )}

      <div
        className="matchup gc-open-area"
        onClick={(e) => {
          if (
            expanded &&
            !(e.target as HTMLElement).closest("a,button,summary")
          )
            openGame(game.espnId);
        }}
        title={expanded ? "Open Game Center" : "Show details"}
      >
        <h3 id={`${game.id}-title`} className="sr-only">
          {game.matchup}
        </h3>
        <div className="matchup-teams">
          <GameStatus live={live} />
          {[away, home].map((team, i) => (
            <div className="team-heading" key={team.name}>
              <img
                src={logos[team.logoId]}
                alt=""
                width="36"
                height="36"
                loading="lazy"
              />
              <div>
                <h4>
                  {team.name}
                  {i === 1 && <span className="home-tag">Home</span>}
                </h4>
                <p>{recordLine(team.record, game.league)}</p>
                {rankLine((team as { ranks?: Ranks }).ranks) && (
                  <p
                    className="rank-line"
                    title={rankTitle((team as { ranks?: Ranks }).ranks)}
                  >
                    {rankLine((team as { ranks?: Ranks }).ranks)}
                  </p>
                )}
              </div>
              <TeamScore live={live} side={i === 0 ? "away" : "home"} />
            </div>
          ))}
        </div>
        <div
          className="score"
          aria-label={`Watchability ${game.score} out of 100, ${tierLabel(game.tier)}`}
        >
          <strong>{game.score}</strong>
          <span className="score-tier">{tierLabel(game.tier)}</span>
          {delta !== 0 && (
            <span
              className={`score-delta ${delta > 0 ? "up" : "down"}`}
              title="Change since the last rating"
            >
              {delta > 0 ? "▲" : "▼"}
              {Math.abs(delta)}
            </span>
          )}
        </div>
      </div>

      <ul className="facts" aria-label="Game info">
        <li>
          <span className="fact-icon" aria-hidden="true">
            📍
          </span>
          {meta.venue}
        </li>
        {meta.line && (
          <li>
            <span className="fact-icon" aria-hidden="true">
              ⚖️
            </span>
            {meta.line}
          </li>
        )}
        <Booth crew={(game as { announcers?: CrewMember[] }).announcers} />
        <li className={`weather impact-${impact}`}>
          <span className="fact-icon" aria-hidden="true">
            {game.weather.icon}
          </span>
          <span>
            {game.weather.title}
            <span className="weather-detail"> · {game.weather.detail}</span>
          </span>
          {impact !== "low" && impact !== "none" && (
            <span className={`impact-pill ${impact}`}>
              {impact} weather impact
            </span>
          )}
        </li>
      </ul>
        </>
      )}
      {expanded && (
        <div className="card-more" id={`${game.id}-more`}>
          <WeatherLook game={game} />

          <p className="take">{game.narrative}</p>
          {"projected" in game && (
            <ProjectedScore
              p={game.projected as Projection}
              away={awayAbbr}
              home={homeAbbr}
            />
          )}
          {"winProb" in game && (
            <PregameWinProb
              wp={game.winProb as WinProbData}
              away={(away as { abbr?: string }).abbr ?? away.name}
              home={(home as { abbr?: string }).abbr ?? home.name}
            />
          )}
          <EdgeLine
            away={{
              abbr: awayAbbr,
              adv: (away as { advanced?: Advanced }).advanced ?? null,
            }}
            home={{
              abbr: homeAbbr,
              adv: (home as { advanced?: Advanced }).advanced ?? null,
            }}
          />
          <InjuryWatch game={game} />
          <Stakes game={game} />
          <TeamForm game={game} />
          <button
            type="button"
            className="gc-open"
            onClick={() => openGame(game.espnId)}
          >
            <span>
              <strong>Game Center</strong> · live win probability, momentum,
              field tilt, drive chart, player tracker
            </span>
            <span aria-hidden="true">↗</span>
          </button>
          <GameDetails game={game} />
        </div>
      )}
      {expanded && toggle}
    </article>
  );
}
