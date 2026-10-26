import { TeamName } from "../teamShort";
import { TeamOpen } from "../openTeam";
import { MomentumFlow } from "./MomentumFlow";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { haptic, useChanged, usePauseOffscreen } from "../motion";
import { closeAndLate, liveHeat } from "../watchNow";
import { lineTextFor, useFreshLine } from "../lines";
import { CompactGame } from "./CompactGame";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { deltaValue, logos, parseMeta, tierLabel, type Breakdown, type Game } from "../data";
import {
  broadcastExtra,
  networkLogo,
  rankLine,
  rankTitle,
  recordLine,
  teamColor,
  type Ranks,
} from "../data";
import { PregameWinProb, type WinProbData } from "./PregameWinProb";
import { CardLine } from "./CardLine";
import { MatchupBars } from "./MatchupBars";
import { ProjectedScore, type Projection } from "./ProjectedScore";
import { GameStatus, TeamScore, useFlow, useLive } from "../live";
import { InsanityMeter } from "./InsanityMeter";
import { useOpenGame } from "./GameCenterContext";
import { type Advanced } from "./AdvancedStats";
import { InjuryWatch } from "./InjuryReport";
import { GameInjuries, InjuryStrip } from "./GameInjuries";
import { useInjuryReport } from "../injuries";
import { Booth, type CrewMember } from "./Booth";
import { dayOf, timeOf, tzAbbr } from "../tz";
import { NetChip } from "./NetChip";
import { LiveMeters } from "./LiveMeters";
import { HalftimeBand } from "../halftime";
import { HalftimeAct } from "../nflHalftime";
import { GameBadgeRow } from "./GameBadge";
import { RivalryBadge, type Rivalry } from "./RivalryBadge";
import { gameBadge } from "../gameLogo";
import { upsetBy } from "../upset";
import { UpsetBanner } from "./UpsetBanner";
import { isHalftime } from "../halftimeLogic";
import { PlusRank } from "./PlusRank";
import { plusRankFor, usePlusRanks, type TeamRef } from "../plusRanks";

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
    // A tap elsewhere closes this card, but only once that tap has finished: closing it on the press moved the page under a finger that was
    // about to lift on a button, and the tap was lost. (A tap that was already under way when the card opened is ignored.)
    const armedAt = performance.now();
    const outside = (event: MouseEvent) => {
      if (!event.isTrusted || event.timeStamp <= armedAt || document.querySelector("dialog[open]") || (event.target as Element | null)?.closest?.("dialog")) return; // (a tap inside the Game Center, even the one that closes it, is not a tap elsewhere)
      if (!cardRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) setExpanded(false);
    };
    document.addEventListener("click", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [expanded, defaultExpanded]);
  const net = (game as { network?: string | null }).network;
  const netLogo = networkLogo(net);
  // The saved line is from the last rebuild; when the current one is in hand (see lines.ts) the card shows that.
  const freshLine = useFreshLine(game.espnId);
  const savedMeta = parseMeta(game.meta);
  const freshText = freshLine && freshLine.state === "pre" ? lineTextFor(freshLine, game.teams as { name: string; abbr?: string }[], game.league) : null;
  const meta = freshText ? { ...savedMeta, line: freshText } : savedMeta;
  const date = (game as { date?: string }).date ?? "";
  const delta = deltaValue(game.delta);
  const impact = impactLevel(game.weather.impact);
  const [away, home] = game.teams;
  // Card background: the home team's dark color (deepened for contrast at build time).
  const awayAbbr = (away as { abbr?: string }).abbr ?? away.name;
  const homeAbbr = (home as { abbr?: string }).abbr ?? home.name;
  const live = useLive(game.espnId);
  const flow = useFlow(game.espnId, game.league, live);
  usePauseOffscreen(cardRef);
  // Motion cues: a pulse when the score changes, a buzz when the game kicks off, and "up N" when the game gets more worth watching as it plays.
  const cl = closeAndLate(live);
  const pulse = useChanged(live?.state === "in" ? live.away + live.home : undefined, 1500);
  const heat = liveHeat(game.score, live);
  const heatSeen = useRef(heat);
  const [rise, setRise] = useState(0);
  useEffect(() => {
    const d = Math.round(heat - heatSeen.current);
    heatSeen.current = heat;
    if (d < 3 || live?.state !== "in") return;
    setRise(d);
    const t = setTimeout(() => setRise(0), 45_000);
    return () => clearTimeout(t);
  }, [heat, live?.state]);
  const wasState = useRef(live?.state);
  useEffect(() => {
    if (wasState.current === "pre" && live?.state === "in") haptic();
    wasState.current = live?.state;
  }, [live?.state]);
  const injuryData = useInjuryReport();
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
  const badge = gameBadge(game as { meta?: string; event?: string | null; teams: { logoId?: string }[] });
  // An upset alert while the game is on: the team the SP+ (college) or NFL+ (NFL) ranking puts lower is ahead. It becomes an upset final if it holds.
  const plus = usePlusRanks();
  const fpis = game.teams.map((t) => plusRankFor(plus, game.league, t as TeamRef)?.n);
  const upsetNow = live && live.state !== "pre" ? upsetBy(fpis, [live.away, live.home]) : null;
  const upset: "alert" | "final" | null = upsetNow ? (live!.state === "post" ? "final" : "alert") : null;
  const abbrOf = (t: unknown) => (t as { abbr?: string; name: string }).abbr ?? (t as { name: string }).name;
  const upsetBanner =
    upset && upsetNow ? (
      <UpsetBanner
        kind={upset}
        winner={{ abbr: abbrOf(game.teams[upsetNow.winner]), rank: fpis[upsetNow.winner]! }}
        loser={{ abbr: abbrOf(game.teams[1 - upsetNow.winner]), rank: fpis[1 - upsetNow.winner]! }}
      />
    ) : null;
  const atHalf = live?.state === "in" && !!game.espnId && (game.league === "CFB" || game.league === "NFL") && isHalftime(live.detail);
  const Halftime = game.league === "NFL" ? HalftimeAct : HalftimeBand;
  const bandTop = atHalf ? <Halftime badge={badge} weather={game.weather} espnId={game.espnId} away={{ ...(game.teams[0] as { abbr?: string; name: string; color?: string | null; logoId?: string }), conf: (game.teams[0] as { ranks?: { confName?: string } }).ranks?.confName }} home={{ ...(game.teams[1] as { abbr?: string; name: string; color?: string | null; logoId?: string }), conf: (game.teams[1] as { ranks?: { confName?: string } }).ranks?.confName }} /> : null;
  return (
    <article
      ref={cardRef}
      data-game-id={game.id}
      className={`game-card ${game.tier}${pulse ? " score-pulse" : ""}${homeColor ? " team-tinted" : ""}${expanded ? " expanded" : " compact"}${upset ? ` upset-${upset}` : ""}`}
      style={
        homeColor ? ({ "--team-bg": homeColor } as CSSProperties) : undefined
      }
      aria-labelledby={`${game.id}-title`}
      onClick={(e) => {
        if (!expanded && !(e.target as HTMLElement).closest("a,button,summary"))
          setExpanded(true);
      }}
    >
      {pulse && <span className="pulse-ring" aria-hidden="true" />}
      {!expanded && <CompactGame titleId={`${game.id}-title`} matchup={game.matchup} date={date} broadcast={game.broadcast} network={game.network} espnId={game.espnId} teams={game.teams} league={game.league} score={game.score} tier={game.tier} venue={meta.venue} driveChart={live?.state === "in" && game.espnId ? <LiveMeters espnId={game.espnId} league={game.league} wp={flow ?? []} away={awayAbbr} home={homeAbbr} /> : undefined} top={<>{cl.both && <div className="late-flag" role="status"><i aria-hidden="true" />{cl.label}</div>}{upsetBanner}{bandTop}</>} badge={<><GameBadgeRow badge={badge} /><RivalryBadge rivalry={(game as { rivalry?: Rivalry }).rivalry} /></>} weather={game.weather} status={<GameStatus live={live} />} scores={[<TeamScore live={live} side="away" />, <TeamScore live={live} side="home" />]} lineStrip={<><CardLine line={meta.line} wp={"winProb" in game ? (game.winProb as WinProbData) : null} projected={"projected" in game ? (game.projected as Projection) : null} away={awayAbbr} home={homeAbbr} showBar={!live || live.state === "pre"} /></>} injuries={<InjuryStrip teams={game.teams as never} league={game.league} />} why={"breakdown" in game ? <ScoreBreakdown {...(game.breakdown as Breakdown)} total={game.score} caption={`Why it's a ${game.score}`} /> : undefined} rise={rise} onExpand={() => setExpanded(true)} momentum={live?.state === "post" ? <MomentumFlow wp={flow ?? []} away={awayAbbr} home={homeAbbr} compact status={live ? { state: live.state, period: flow?.at(-1)?.[1] ?? 1, clock: flow?.at(-1)?.[2]?.clock ?? "15:00" } : undefined} pendingLabel="Play data unavailable" /> : undefined} />}
      {expanded && (
        <>
      {upsetBanner}
      {bandTop}
      <header className="card-top">
        <div className="kickoff">
          <strong>{dayOf(date)}</strong> {timeOf(date)} {tzAbbr()}
        </div>
        <div
          className={`tv ${netLogo ? "has-logo" : ""}`}
          title="Where to watch"
        >
          {netLogo ? (
            <NetChip network={net} logo={netLogo} game={{ league: game.league, espnId: game.espnId, broadcast: game.broadcast }} />
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
          {netLogo ? (
            <>
              <span className="sr-only">{game.broadcast}</span>
              {broadcastExtra(game.broadcast, net) && <span aria-hidden="true">{broadcastExtra(game.broadcast, net)}</span>}
            </>
          ) : (
            game.broadcast
          )}
        </div>
      </header>
      <GameBadgeRow badge={badge} />
      <RivalryBadge rivalry={(game as { rivalry?: Rivalry }).rivalry} />
          <button
            type="button"
            className="gc-open"
            onClick={() => openGame(game.espnId)}
          >
            <span>
              <strong>Game Center</strong> · matchup stats, players & deeper analysis
            </span>
            <span aria-hidden="true">↗</span>
          </button>
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
              <TeamOpen className="img" team={{ league: game.league, name: team.name, abbr: (team as { abbr?: string }).abbr }}><img
                src={logos[team.logoId]}
                alt=""
                width="36"
                height="36"
                loading="lazy"
              /></TeamOpen>
              <div>
                <h4>
                  <PlusRank league={game.league} team={team} />
                  <TeamOpen team={{ league: game.league, name: team.name, abbr: (team as { abbr?: string }).abbr }}><TeamName league={game.league} name={team.name} /></TeamOpen>
                  {i === 1 && <span className="home-tag">Home</span>}
                </h4>
                <p>{recordLine(team.record, game.league)}</p>
                {rankLine((team as { ranks?: Ranks }).ranks) && (
                  <p
                    className="rank-line"
                    title={rankTitle((team as { ranks?: Ranks }).ranks, null, { overall: false })}
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

      <ul className="facts cd-info" aria-label="Game info">
        <li className="cd-tile">
          <span className="cd-k"><span className="fact-icon" aria-hidden="true">📍</span> Venue</span>
          <span className="cd-v">{meta.venue}</span>
        </li>
        {meta.line && (
          <li className="cd-tile">
            <span className="cd-k"><span className="fact-icon" aria-hidden="true">⚖️</span> Line</span>
            <span className="cd-v">{meta.line.replace(/\s*•\s*/g, " · ")}</span>
          </li>
        )}
        <li className={`cd-tile weather impact-${impact}`}>
          <span className="cd-k"><span className="fact-icon" aria-hidden="true">{game.weather.icon}</span> Weather</span>
          <span className="cd-v">
            {game.weather.title}
            <span className="weather-detail"> · {game.weather.detail}</span>
            {impact !== "low" && impact !== "none" && <span className={`impact-pill ${impact}`}>{impact} weather impact</span>}
          </span>
        </li>
        <Booth crew={(game as { announcers?: CrewMember[] }).announcers} />
      </ul>
        </>
      )}
      {expanded && (
        <div className="card-more" id={`${game.id}-more`}>
          <section className="cd-sec" aria-labelledby={`${game.id}-preview`}>
            <h4 className="cd-h" id={`${game.id}-preview`}>Preview</h4>
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
          </section>
          {(() => {
            const adv = { away: { abbr: awayAbbr, adv: (away as { advanced?: Advanced }).advanced ?? null }, home: { abbr: homeAbbr, adv: (home as { advanced?: Advanced }).advanced ?? null } };
            if (!adv.away.adv?.eff && !adv.home.adv?.eff && !adv.away.adv?.qbr && !adv.home.adv?.qbr) return null;
            return (
              <section className="cd-sec" aria-labelledby={`${game.id}-matchup`}>
                <h4 className="cd-h" id={`${game.id}-matchup`}>Matchup</h4>
                <MatchupBars away={adv.away} home={adv.home} />
              </section>
            );
          })()}
          {injuryData ? <GameInjuries teams={game.teams as never} league={game.league} mode="fold" /> : <InjuryWatch game={game} />}
        </div>
      )}
      {expanded && toggle}
    </article>
  );
}
