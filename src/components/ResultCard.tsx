import { useState, type CSSProperties } from "react";
import { nameParts } from "../teamName";
import { attendanceView } from "../attendance";
import { useVenues } from "../venues";
import {
  logos,
  networkLogo,
  rankLine,
  rankTitle,
  teamColor,
  tierLabel,
  type Result,
} from "../data";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { InsanityMeter } from "./InsanityMeter";
import { AdvancedStats } from "./AdvancedStats";
import { useOpenGame } from "./GameCenter";
import { Booth, type CrewMember } from "./Booth";
import { dayOf, timeOf, tzAbbr } from "../tz";

const short = (r: Result, i: number) =>
  r.league === "NFL" ? r.teams[i].name.split(" ").pop()! : r.teams[i].abbr;

/** A finished game: final score, forecast vs actual watchability and why. */
export function ResultCard({ result: r, defaultExpanded = false }: { result: Result; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const netLogo = networkLogo(r.network);
  const [away, home] = r.teams;
  const winner = away.score > home.score ? 0 : home.score > away.score ? 1 : -1;
  const periods = Math.max(away.linescores.length, home.linescores.length);
  const d = r.delta;
  const sc = r.scoreCheck;
  const extra = r.final.detail.replace(/^final\/?/i, "").trim();
  const openGame = useOpenGame();
  const sourceNote =
    r.forecast.source === "published"
      ? "Forecast as published before this site switched to its current formula, so there's no component breakdown."
      : r.forecast.source === "reconstructed"
        ? "No pregame forecast was saved for this game; it was rebuilt from ESPN's pregame line with the current formula."
        : null;
  return (
    <article
      className={`game-card result-card ${r.actual.tier}${teamColor(home.color) ? " team-tinted" : ""}${expanded ? " expanded" : " compact"}`}
      style={
        teamColor(home.color)
          ? ({ "--team-bg": teamColor(home.color) } as CSSProperties)
          : undefined
      }
      aria-labelledby={`r-${r.espnId}`}
      onClick={(e) => {
        if (!expanded && !(e.target as HTMLElement).closest("a,button,summary")) setExpanded(true);
      }}
    >
      {!expanded && (
        <div className="cc">
          <div className="cc-main">
            <div className="cc-when">
              <span className="game-status post">
                <span className="gs-pill">Final</span>
                {extra && <span className="gs-period">{extra}</span>}
              </span>
              <span className="cc-time">
                <strong>{dayOf(r.date)}</strong> {timeOf(r.date)} {tzAbbr()}
              </span>
            </div>
            <h3 id={`r-${r.espnId}`} className="sr-only">
              {r.matchup}, final {away.score}–{home.score}
            </h3>
            {[away, home].map((t, i) => (
              <div className="cc-team" key={t.name}>
                <img src={logos[t.logoId]} alt="" width="28" height="28" loading="lazy" />
                <span className="cc-name">{(([pre, nick]) => (<>{pre && <span className="cc-pre">{pre}</span>}{nick}</>))(nameParts(t.name, r.league))}</span>
                <span className={`team-score${winner === i ? " won" : winner >= 0 ? " lost" : ""}`}>{t.score}</span>
              </div>
            ))}
          </div>
          <div className="cc-rate" aria-label={`Actual watchability ${r.actual.score} out of 100, ${tierLabel(r.actual.tier)}`}>
            <strong>{r.actual.score}</strong>
            <span>{tierLabel(r.actual.tier)}</span>
            {Math.abs(d) > 4 && <em className={d > 0 ? "up" : "down"}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}</em>}
          </div>
          <button
            type="button"
            className="card-toggle cc-chevron"
            aria-expanded={false}
            aria-label="Show game details"
            onClick={() => setExpanded(true)}
          >
            <span aria-hidden="true">▾</span>
          </button>
        </div>
      )}
      {expanded && (
        <>
      <header className="card-top">
        <div className="kickoff">
          <strong>{dayOf(r.date)}</strong> {timeOf(r.date)} {tzAbbr()}
        </div>
        <div
          className={`tv ${netLogo ? "has-logo" : ""}`}
          title="Where it aired"
        >
          {netLogo && (
            <span className="net-chip">
              <img src={netLogo} alt="" height="16" loading="lazy" />
            </span>
          )}
          <span className="sr-only">Aired on: </span>
          {r.broadcast}
        </div>
      </header>

      <Attendance attendance={r.attendance} venueId={r.venueId} />

      <h3 id={`r-${r.espnId}`} className="sr-only">
        {r.matchup}, final {away.score}–{home.score}
      </h3>
      <div
        className="final-board gc-open-area"
        onClick={() => openGame(r.espnId)}
        title="Open Game Center"
      >
        <div className="game-status post">
          <span className="gs-pill">Final</span>
          {r.final.detail.replace(/^final\/?/i, "").trim() && (
            <span className="gs-period">{r.final.detail.replace(/^final\/?/i, "").trim()}</span>
          )}
        </div>
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
            </tr>
          </thead>
          <tbody>
            {[away, home].map((t, i) => (
              <tr key={t.name} className={winner === i ? "won" : undefined}>
                <th scope="row">
                  <span className="ls-team">
                    <img
                      src={logos[t.logoId]}
                      alt=""
                      width="26"
                      height="26"
                      loading="lazy"
                    />
                    <span className="ls-name">
                      {t.name}
                      <span className="ls-rec">{t.record}</span>
                      {rankLine(t.ranks) && (
                        <span
                          className="ls-rec rank-line"
                          title={rankTitle(t.ranks)}
                        >
                          {rankLine(t.ranks)}
                        </span>
                      )}
                    </span>
                    <span className="ls-total team-score">{t.score}</span>
                  </span>
                </th>
                {Array.from({ length: periods }, (_, q) => (
                  <td key={q} className="ls-q">
                    {t.linescores[q] ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Booth crew={(r as { announcers?: CrewMember[] }).announcers} as="p" />
      {sc && (
        <section
          className={`score-call grade-${sc.grade}`}
          aria-label="Projected score versus final"
        >
          <h4 className="micro-label">Score: projected vs final</h4>
          <div className="sc-row">
            <div className="sc-box">
              <span className="micro-label">Projected</span>
              <strong>
                {away.abbr} {sc.projected.away}–{sc.projected.home} {home.abbr}
              </strong>
            </div>
            <span className={`sc-badge ${sc.winnerRight ? "right" : "wrong"}`}>
              <span aria-hidden="true">{sc.winnerRight ? "✓" : "✗"}</span>{" "}
              {sc.winnerRight ? "Winner" : "Wrong winner"}
              <span className="sc-miss">
                Margin{" "}
                {sc.marginMiss === 0
                  ? "exact"
                  : `off ${Math.abs(sc.marginMiss)}`}
              </span>
            </span>
            <div className="sc-box final">
              <span className="micro-label">Final</span>
              <strong>
                {away.abbr} {away.score}–{home.score} {home.abbr}
              </strong>
            </div>
          </div>
          <p className="take sc-head">{sc.headline}</p>
          <ul className="readout">
            {sc.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <p className="sc-source">
            {sc.projected.source.endsWith("(rebuilt)")
              ? `No pregame projection was saved for this game; rebuilt from the ${sc.projected.source.replace(" (rebuilt)", "")}.`
              : `Projected before kickoff from the ${sc.projected.source}.`}
          </p>
        </section>
      )}

      <h4 className="micro-label fva-label">
        Watchability: forecast vs actual
      </h4>
      <div
        className="fva"
        aria-label={`Forecast ${r.forecast.score}, actual ${r.actual.score}`}
      >
        <div className={`fva-box ${r.forecast.tier}`}>
          <span className="micro-label">Forecast</span>
          <strong>{r.forecast.score}</strong>
          <span className="fva-tier">{tierLabel(r.forecast.tier)}</span>
        </div>
        <span
          className={`fva-delta ${d > 4 ? "up" : d < -4 ? "down" : "even"}`}
        >
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
      <InsanityMeter
        wp={r.wp}
        final
        overtime={r.final.overtime}
        away={short(r, 0)}
        home={short(r, 1)}
      />

      <button
        type="button"
        className="gc-open"
        onClick={() => openGame(r.espnId)}
      >
        <span>
          <strong>Game Center</strong> · drive chart, momentum, field tilt, top
          3 / bottom 3, player tracker
        </span>
        <span aria-hidden="true">↗</span>
      </button>
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
      <button type="button" className="card-toggle" aria-expanded={true} onClick={() => setExpanded(false)}>
        Less <span aria-hidden="true">▴</span>
      </button>
        </>
      )}
    </article>
  );
}

/** Attendance at the top of a completed game's card: the count, and a bar for the share of capacity when known. */
function Attendance({ attendance, venueId }: { attendance?: number | null; venueId?: string | null }) {
  const venues = useVenues();
  const venue = venueId ? venues[venueId] : undefined;
  const v = attendanceView(attendance, venue?.capacity);
  if (!v) return null;
  return (
    <div className={`attendance${v.level ? ` ${v.level}` : ""}`}>
      <div className="att-line">
        <span className="att-label">Attendance</span>
        <strong>{v.attendance.toLocaleString("en-US")}</strong>
        {v.pct != null && v.capacity != null && (
          <span className="att-pct" title={venue?.source === "wikipedia" ? "Stadium capacity from Wikipedia" : venue?.source === "seed" ? "Stadium capacity from published stadium guides" : undefined}>
            {Math.round(v.pct)}% of {v.capacity.toLocaleString("en-US")} capacity
          </span>
        )}
      </div>
      {v.fill != null && (
        <div
          className="att-bar"
          role="meter"
          aria-label="Attendance as a share of stadium capacity"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(v.fill)}
          aria-valuetext={`${Math.round(v.pct!)} percent of capacity`}
        >
          <i style={{ width: `${v.fill}%` }} />
        </div>
      )}
    </div>
  );
}
