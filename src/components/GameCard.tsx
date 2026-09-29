import {
  deltaValue,
  logos,
  parseMeta,
  tierLabel,
  type Game,
} from "../data";
import { Stakes } from "./TeamImpact";
import { GameDetails } from "./GameDetails";
import { WeatherLook } from "./WeatherLook";
import { TeamForm } from "./Trends";
import { networkLogo } from "../data";
import { PregameWinProb, type WinProbData } from "./PregameWinProb";

const impactLevel = (impact: string) =>
  impact.replace(/\s*impact$/i, "").toLowerCase();

export function GameCard({ game }: { game: Game }) {
  const netLogo = networkLogo((game as { network?: string | null }).network);
  const meta = parseMeta(game.meta);
  const delta = deltaValue(game.delta);
  const impact = impactLevel(game.weather.impact);
  const [away, home] = game.teams;
  return (
    <article
      className={`game-card ${game.tier}`}
      aria-labelledby={`${game.id}-title`}
    >
      <header className="card-top">
        <div className="kickoff">
          <strong>{meta.day}</strong> {meta.time}
        </div>
        <div className={`tv ${netLogo ? "has-logo" : ""}`} title="Where to watch">
          {netLogo ? (
            <span className="net-chip">
              <img src={netLogo} alt="" height="16" loading="lazy" />
            </span>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
              <rect x="3" y="5" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M8 21h8" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
          <span className="sr-only">Where to watch: </span>
          {game.broadcast}
        </div>
      </header>

      <div className="matchup">
        <h3 id={`${game.id}-title`} className="sr-only">
          {game.matchup}
        </h3>
        <div className="matchup-teams">
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
                <p>{team.record}</p>
              </div>
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
        <li className={`weather impact-${impact}`}>
          <span className="fact-icon" aria-hidden="true">
            {game.weather.icon}
          </span>
          <span>
            {game.weather.title}
            <span className="weather-detail"> · {game.weather.detail}</span>
          </span>
          {impact !== "low" && impact !== "none" && (
            <span className={`impact-pill ${impact}`}>{impact} weather impact</span>
          )}
        </li>
      </ul>
      <WeatherLook game={game} />

      <p className="take">{game.narrative}</p>
      {"winProb" in game && (
        <PregameWinProb
          wp={game.winProb as WinProbData}
          away={(away as { abbr?: string }).abbr ?? away.name}
          home={(home as { abbr?: string }).abbr ?? home.name}
        />
      )}
      <Stakes game={game} />
      <TeamForm game={game} />
      <GameDetails game={game} />
    </article>
  );
}
