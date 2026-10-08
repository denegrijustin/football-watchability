import type { Game } from "../data";
import { MatchupComparison, type MatchupData } from "./MatchupComparison";
import type { Breakdown } from "../data";
import { SeasonTrends } from "./Trends";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { AdvancedStats, type Advanced } from "./AdvancedStats";
import type { CSSProperties } from "react";
import { logos, teamColor } from "../data";
import { Headshot } from "./Headshot";
import { InjuryReport, hasInjuryData, injurySummary } from "./InjuryReport";

type KeyPlayer = {
  name: string;
  short: string;
  pos: string | null;
  jersey: string | null;
  headshot: string | null;
  category: string;
  line: string;
  team: string;
  logoId: string;
  side: "away" | "home";
};

/** Season leaders for both teams: photo, name, position, team and stat line, in team colors. */
function KeyPlayers({ game, players }: { game: Game; players: KeyPlayer[] }) {
  const teams = game.teams as unknown as { color?: string | null }[];
  return (
    <div className="kp">
      {(["away", "home"] as const).map((side, i) => {
        const ps = players.filter((p) => p.side === side);
        if (!ps.length) return null;
        const color = teamColor(teams[i]?.color ?? null) ?? "#1d2a35";
        return (
          <ul key={side} className="kp-team" style={{ "--team": color } as CSSProperties}>
            {ps.map((p) => (
              <li key={`${p.category}-${p.name}`} className="kp-card">
                <span className="kp-photo">
                  <Headshot src={p.headshot} name={p.name} size={44} />
                  {logos[p.logoId] && <img className="kp-logo" src={logos[p.logoId]} alt="" width="18" height="18" />}
                </span>
                <span className="kp-text">
                  <strong>
                    {p.name}
                    {p.pos && <span className="kp-pos">{p.pos}</span>}
                  </strong>
                  <span className="kp-team-line">
                    {p.team}
                    {p.jersey ? ` · #${p.jersey}` : ""} · {p.category}
                  </span>
                  <small>{p.line}</small>
                </span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
export function GameDetails({ game, matchup = (game as Game & { matchupComparison?: MatchupData }).matchupComparison }: { game: Game; matchup?: MatchupData }) {
  return (
    <div className="game-details">
      {matchup && <MatchupComparison data={matchup} />}
      {"breakdown" in game && (
        <details open>
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
          <details open>
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
      {hasInjuryData(game) && (
        <details open>
          <summary>
            <div className="inj-title">
              Injury report <small className="inj-sum">{injurySummary(game)}</small>
            </div>
            <span aria-hidden="true">+</span>
          </summary>
          <InjuryReport game={game} />
        </details>
      )}
      <details open>
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
        <details open>
          <summary>
            Season trends<span aria-hidden="true">+</span>
          </summary>
          <SeasonTrends game={game} />
        </details>
      )}
      <details open>
        <summary>
          History + key players<span aria-hidden="true">+</span>
        </summary>
        <div className="detail-content history-content">
          {game.history.boxes.map((box, i) => (
            <div key={i}>
              <h4 className="micro-label">{box.label}</h4>
              {box.value && <p className="series-value">{box.value}</p>}
              {(box as { players?: KeyPlayer[] }).players?.length ? (
                <KeyPlayers game={game} players={(box as { players: KeyPlayer[] }).players} />
              ) : (
                box.items.length > 0 && (
                  <ul>
                    {box.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                )
              )}
            </div>
          ))}
          {game.history.games && game.history.games.length > 5 && (
            <details open className="all-meetings">
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
