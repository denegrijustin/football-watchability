import { cleanRank, logos, type Game, type Team } from "../data";

const scenarios = ["now", "with a win", "with a loss"] as const;

function OddsBar({ odds }: { odds: number[] }) {
  const [now, win, loss] = odds;
  const lo = Math.min(win, loss, now);
  const hi = Math.max(win, loss, now);
  return (
    <div className="odds-bar" aria-hidden="true">
      <div
        className="odds-range"
        style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 1)}%` }}
      />
      <div className="odds-now" style={{ left: `${now}%` }} />
    </div>
  );
}

function TeamRow({ team }: { team: Team }) {
  const [rNow, rWin, rLoss] = team.rankings.map(cleanRank);
  const [oNow, oWin, oLoss] = team.playoffOdds;
  return (
    <tr className="team-impact">
      <th scope="row">
        <img src={logos[team.logoId]} alt="" width="22" height="22" loading="lazy" />
        <span className="sr-only">{team.name}</span>
      </th>
      <td className="scenario-0">
        {rNow}
      </td>
      <td className="scenario-1">
        {rWin}
      </td>
      <td className="scenario-2">
        {rLoss}
      </td>
      <td className="odds-cell">
        <div className="odds-values">
          <strong>{oNow}%</strong>
          <span>
            <span className="scenario-1">
              W {oWin}
            </span>
            
            <span className="scenario-2">
              L {oLoss}
            </span>
          </span>
        </div>
        <OddsBar odds={team.playoffOdds} />
      </td>
    </tr>
  );
}

export function Stakes({ game }: { game: Game }) {
  const rankLabel = game.league === "NFL" ? "FPI rank" : "AP rank";
  return (
    <div className="stakes">
      <table>
        <caption className="sr-only">
          What's at stake: projected {rankLabel.toLowerCase()} and playoff odds
          now, with a win and with a loss
        </caption>
        <thead>
          <tr className="group-row">
            <th scope="col" rowSpan={2} className="team-col">
              <span className="sr-only">Team</span>
              <span className="stakes-title" aria-hidden="true">
                At stake
              </span>
            </th>
            <th scope="colgroup" colSpan={3}>
              {rankLabel}
            </th>
            <th scope="col" rowSpan={2} className="odds-head">
              Playoff odds
            </th>
          </tr>
          <tr>
            {scenarios.map((s, i) => (
              <th scope="col" key={s} className={`scenario-${i}`}>
                {i === 0 ? "Now" : i === 1 ? "Win" : "Loss"}
                <span className="sr-only"> ({s})</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {game.teams.map((team) => (
            <TeamRow key={team.name} team={team} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
