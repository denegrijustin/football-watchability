import type { Result } from "../data";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { AdvancedStats } from "./AdvancedStats";
export function ResultAnalysis({ result: r }: { result: Result }) {
  const [away, home] = r.teams;
  const sourceNote =
    r.forecast.source === "published"
      ? "Forecast as published before this site switched to its current formula, so there's no component breakdown."
      : r.forecast.source === "reconstructed"
        ? "No pregame forecast was saved for this game; it was rebuilt from ESPN's pregame line with the current formula."
        : null;
  return (
      <div className="game-details">
        <details>
          <summary>
            Why it scored {r.actual.score}
            <span aria-hidden="true">+</span>
          </summary>
          <div className="detail-content">
            <ScoreBreakdown
              base={r.actual.base}
              parts={r.actual.parts}
              total={r.actual.score}
              caption="Actual watchability"
            />
          </div>
        </details>
        {(away.advanced || home.advanced) && (
          <details>
            <summary>
              Advanced stats + rankings<span aria-hidden="true">+</span>
            </summary>
            <AdvancedStats
              league={r.league}
              away={{ abbr: away.abbr, adv: away.advanced ?? null }}
              home={{ abbr: home.abbr, adv: home.advanced ?? null }}
            />
          </details>
        )}
        <details>
          <summary>
            The forecast ({r.forecast.score})<span aria-hidden="true">+</span>
          </summary>
          <div className="detail-content">
            {r.forecast.take && (
              <p className="forecast-take">“{r.forecast.take}”</p>
            )}
            {r.forecast.line && (
              <p className="source-note">Pregame line: {r.forecast.line}</p>
            )}
            {r.forecast.parts ? (
              <ScoreBreakdown
                base={r.forecast.base}
                parts={r.forecast.parts}
                total={r.forecast.score}
                caption="Pregame forecast"
              />
            ) : null}
            {sourceNote && <p className="source-note">{sourceNote}</p>}
          </div>
        </details>
      </div>
  );
}
