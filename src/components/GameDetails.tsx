import type { Game } from "../data";
export function GameDetails({ game }: { game: Game }) {
  return (
    <div className="game-details">
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
          <p className="source-note">{game.history.source}</p>
        </div>
      </details>
    </div>
  );
}
