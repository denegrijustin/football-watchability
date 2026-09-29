import type { CSSProperties } from "react";
import { logos, networkLogo, tierLabel, type Result } from "../data";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { WinProb } from "./WinProb";

const short = (r: Result, i: number) =>
  r.league === "NFL" ? r.teams[i].name.split(" ").pop()! : r.teams[i].abbr;

/** A finished game: final score, forecast vs actual watchability and why. */
export function ResultCard({ result: r }: { result: Result }) {
  const netLogo = networkLogo(r.network);
  const [away, home] = r.teams;
  const winner = away.score > home.score ? 0 : home.score > away.score ? 1 : -1;
  const periods = Math.max(away.linescores.length, home.linescores.length);
  const d = r.delta;
  const sourceNote =
    r.forecast.source === "published"
      ? "Forecast as published before this site switched to its current formula, so there's no component breakdown."
      : r.forecast.source === "reconstructed"
        ? "No pregame forecast was saved for this game; it was rebuilt from ESPN's pregame line with the current formula."
        : null;
  return (
    <article
      className={`game-card result-card ${r.actual.tier}${home.color ? " team-tinted" : ""}`}
      style={home.color ? ({ "--team-bg": home.color } as CSSProperties) : undefined}
      aria-labelledby={`r-${r.espnId}`}
    >
      <header className="card-top">
        <div className="kickoff">
          <strong>{r.final.detail}</strong> · {r.day} {r.time}
        </div>
        <div className={`tv ${netLogo ? "has-logo" : ""}`} title="Where it aired">
          {netLogo && (
            <span className="net-chip">
              <img src={netLogo} alt="" height="16" loading="lazy" />
            </span>
          )}
          <span className="sr-only">Aired on: </span>
          {r.broadcast}
        </div>
      </header>

      <h3 id={`r-${r.espnId}`} className="sr-only">
        {r.matchup}, final {away.score}–{home.score}
      </h3>
      <div className="final-board">
        <table className="linescore">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Team</span>
              </th>
              {Array.from({ length: periods }, (_, i) => (
                <th scope="col" key={i} className="ls-q">
                  {i < 4 ? i + 1 : periods > 5 ? `OT${i - 3}` : "OT"}
                </th>
              ))}
              <th scope="col">T</th>
            </tr>
          </thead>
          <tbody>
            {[away, home].map((t, i) => (
              <tr key={t.name} className={winner === i ? "won" : undefined}>
                <th scope="row">
                  <span className="ls-team">
                    <img src={logos[t.logoId]} alt="" width="26" height="26" loading="lazy" />
                    <span className="ls-name">
                      {t.name}
                      <span className="ls-rec">{t.record}</span>
                    </span>
                  </span>
                </th>
                {Array.from({ length: periods }, (_, q) => (
                  <td key={q} className="ls-q">
                    {t.linescores[q] ?? "–"}
                  </td>
                ))}
                <td className="ls-total">{t.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fva" aria-label={`Forecast ${r.forecast.score}, actual ${r.actual.score}`}>
        <div className={`fva-box ${r.forecast.tier}`}>
          <span className="micro-label">Forecast</span>
          <strong>{r.forecast.score}</strong>
          <span className="fva-tier">{tierLabel(r.forecast.tier)}</span>
        </div>
        <span className={`fva-delta ${d > 4 ? "up" : d < -4 ? "down" : "even"}`}>
          <span aria-hidden="true">{d > 0 ? "▲" : d < 0 ? "▼" : "="}</span>
          {d === 0 ? "Even" : `${d > 0 ? "+" : "−"}${Math.abs(d)}`}
        </span>
        <div className={`fva-box actual ${r.actual.tier}`}>
          <span className="micro-label">Actual</span>
          <strong>{r.actual.score}</strong>
          <span className="fva-tier">{tierLabel(r.actual.tier)}</span>
        </div>
      </div>

      <p className="take readout-head">{r.readout.headline}</p>
      {r.readout.bullets.length > 0 && (
        <ul className="readout">
          {r.readout.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      <WinProb wp={r.wp} away={short(r, 0)} home={short(r, 1)} />

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
        <details>
          <summary>
            The forecast ({r.forecast.score})<span aria-hidden="true">+</span>
          </summary>
          <div className="detail-content">
            {r.forecast.take && <p className="forecast-take">“{r.forecast.take}”</p>}
            {r.forecast.line && <p className="source-note">Pregame line: {r.forecast.line}</p>}
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
    </article>
  );
}
