import type { Game } from '../data';
import { TeamImpact } from './TeamImpact';
import { GameDetails } from './GameDetails';
export function GameCard({game}: {game: Game}) {
  return <article className={`game-card ${game.tier}`} aria-labelledby={`${game.id}-title`}>
    <header className="card-header"><div><div className="card-eyebrow">{game.chips[0]}<span>{game.delta}</span></div><h3 id={`${game.id}-title`}>{game.matchup}</h3></div><div className="score" aria-label={`Watchability ${game.score} out of 100`}><strong>{game.score}</strong><span>/ 100</span></div></header>
    <p className="game-meta">{game.meta}</p>
    <div className="broadcast"><span className="tv-icon" aria-hidden="true">▣</span><span><span className="micro-label">Where to watch</span><strong>{game.broadcast}</strong></span></div>
    <div className="weather"><span className="weather-icon" aria-hidden="true">{game.weather.icon}</span><div><strong>{game.weather.title}</strong><span>{game.weather.detail}</span></div><span className="weather-impact">{game.weather.impact}</span></div>
    <div className="teams-grid">{game.teams.map(team=><TeamImpact key={team.name} team={team}/>)}</div>
    <GameDetails game={game}/>
  </article>;
}
