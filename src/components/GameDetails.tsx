import type { Game } from "../data";
import type { Breakdown } from "../data";
import { SeasonTrends } from "./Trends";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { AdvancedStats, type Advanced } from "./AdvancedStats";
export function GameDetails({ game }: { game: Game }) {
  return (
    <div className="game-details">
      {"breakdown" in game && (
        <details>
          <summary>
            Why it's a {game.score}
            <span aria-hidden="true">+</span>
          </summary>
          <div className="detail-content">
            <ScoreBreakdown
              {...(game.breakdown as Breakdown)}
              total={game.score}
              caption="Watchability forecast"
            />
          </div>
        </details>
      )}
      {(() => {
        const [a, h] = game.teams as unknown as { abbr?: string; name: string; advanced?: Advanced }[];
        if (!a.advanced && !h.advanced) return null;
        return (
          <details>
            <summary>
              Advanced stats + rankings<span aria-hidden="true">+</span>
            </summary>
            <AdvancedStats
              league={game.league}
              away={{ abbr: a.abbr ?? a.name, adv: a.advanced ?? null }}
              home={{ abbr: h.abbr ?? h.name, adv: h.advanced ?? null }}
            />
          </details>
        );
      })()}
      <details>
        <summary>
          Why watch / skip<span aria-hidden="true">+</span>
        </summary>
        <div className="detail-content why-content">
          <div className="why-col watch-col">
            <h4 className="micro-label">Why watch</h4>
            <ul>
              {game.watch.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="why-col skip-col">
            <h4 className="micro-label">Why skip</h4>
            <ul>
              {game.skip.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="tag-list">
            {game.narrativeChips.map((chip, i) => (
              <span key={i}>{chip}</span>
            ))}
          </div>
        </div>
      </details>
      {(game.teams as { trend?: unknown }[]).some((t) => t.trend) && (
        <details>
          <summary>
            Season trends<span aria-hidden="true">+</span>
          </summary>
          <SeasonTrends game={game} />
        </details>
      )}
      <details>
        <summary>
          History + key players<span aria-hidden="true">+</span>
        </summary>
        <div className="detail-content history-content">
          {game.history.boxes.map((box, i) => (
            <div key={i}>
              <h4 className="micro-label">{box.label}</h4>
              {box.value && <p className="series-value">{box.value}</p>}
              {box.items.length > 0 && (
                <ul>
                  {box.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {game.history.games && game.history.games.length > 5 && (
            <details className="all-meetings">
              <summary>
                All {game.history.games.length} meetings
                <span aria-hidden="true">+</span>
              </summary>
              <ol reversed>
                {game.history.games.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ol>
            </details>
          )}
          <p className="source-note">{game.history.source}</p>
        </div>
      </details>
    </div>
  );
}
