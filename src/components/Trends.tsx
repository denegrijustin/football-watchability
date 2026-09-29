import { logos, type Game } from "../data";
import { MarginBars, gameLabel, signed, type Trend } from "./MarginBars";

type T = { name: string; logoId: string; record: string; trend?: Trend | null };
const teamsWithTrends = (game: Game) => (game.teams as unknown as T[]).filter((t) => t.trend?.games.length);
function sharedScale(teams: T[]) {
  const max = Math.max(7, ...teams.flatMap((t) => t.trend!.games.map((g) => Math.abs(g.pf - g.pa))));
  const slots = Math.max(...teams.map((t) => t.trend!.games.length));
  return { max, slots };
}

/** Compact form strip on the card: margin per game for both teams. */
export function TeamForm({ game }: { game: Game }) {
  const teams = teamsWithTrends(game);
  if (teams.length < 2) return null;
  const { max, slots } = sharedScale(teams);
  return (
    <div className="form">
      <div className="form-head">
        <span className="micro-label">Form this season</span>
        <span className="form-key" aria-hidden="true">
          <i className="k-win" /> won by <i className="k-loss" /> lost by
        </span>
      </div>
      {teams.map((t) => (
        <div className="form-row" key={t.name}>
          <img src={logos[t.logoId]} alt="" width="20" height="20" loading="lazy" />
          <MarginBars games={t.trend!.games} scale={max} slots={slots} label={`${t.name} margins`} height={34} />
          <span className="form-sum">
            <strong>{t.trend!.streak}</strong>
            <span>{signed(t.trend!.margin)}/g</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Detailed panel: stat tiles, larger chart with weeks, and a table view. */
export function SeasonTrends({ game }: { game: Game }) {
  const teams = teamsWithTrends(game);
  if (!teams.length) return null;
  const { max, slots } = sharedScale(teams);
  return (
    <div className="detail-content trends-content">
      {teams.map((t) => {
        const tr = t.trend!;
        const recent = tr.last3Margin;
        return (
          <section key={t.name} className="trend-team" aria-label={`${t.name} season trends`}>
            <header>
              <img src={logos[t.logoId]} alt="" width="22" height="22" loading="lazy" />
              <strong>{t.name}</strong>
              <span>{t.record.split(" · ")[0]}</span>
            </header>
            <dl className="tiles">
              <div>
                <dt>Points / game</dt>
                <dd>{tr.ppg}</dd>
              </div>
              <div>
                <dt>Allowed / game</dt>
                <dd>{tr.oppg}</dd>
              </div>
              <div>
                <dt>Avg margin</dt>
                <dd>{signed(tr.margin)}</dd>
              </div>
              <div>
                <dt>{recent != null ? "Last 3 margin" : "Streak"}</dt>
                <dd>{recent != null ? signed(recent) : tr.streak}</dd>
              </div>
            </dl>
            <MarginBars games={tr.games} scale={max} slots={slots} height={70} showWeeks label={`${t.name} scoring margin by game`} />
            <details className="trend-table">
              <summary>
                Game-by-game<span aria-hidden="true">+</span>
              </summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Game</th>
                    <th scope="col">Score</th>
                    <th scope="col">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {tr.games.map((g, i) => (
                    <tr key={i}>
                      <td>{gameLabel(g).split(" · ")[0]}</td>
                      <td>
                        {g.pf > g.pa ? "W" : g.pf < g.pa ? "L" : "T"} {g.pf}–{g.pa}
                      </td>
                      <td>{signed(g.pf - g.pa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        );
      })}
      <p className="source-note">Results this season from ESPN. Bars share one scale on this card.</p>
    </div>
  );
}
