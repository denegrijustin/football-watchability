import { useState } from "react";
import {
  dayName,
  filterGames,
  slate,
  tiers,
  type FilterState,
} from "./data";
import { Filters } from "./components/Filters";
import { GameCard } from "./components/GameCard";

const initial: FilterState = {
  league: "NFL",
  conference: "all-fbs",
  query: "",
  day: "all",
  minScore: 0,
};

export default function App() {
  const [filters, setFilters] = useState<FilterState>(initial);
  const update = (patch: Partial<FilterState>) =>
    setFilters((f) => ({ ...f, ...patch }));
  const { league } = filters;
  const games = filterGames(filters);
  const total = slate.games.filter((g) => g.league === league).length;
  const filtered =
    filters.query !== "" ||
    filters.day !== "all" ||
    filters.minScore !== 0 ||
    (league === "CFB" && filters.conference !== "all-fbs");
  const heading =
    (league === "NFL" ? "NFL" : "College") +
    (filters.day === "all" ? " matchups" : ` · ${dayName(filters.day)}`);

  return (
    <>
      <a className="skip-link" href="#games">
        Skip to games
      </a>
      <header className="site-header">
        <a href="/" className="brand" aria-label="Football Watchability home">
          <span className="brand-mark" aria-hidden="true">
            FW
          </span>
          <span className="brand-name">Football Watchability</span>
        </a>
        <div className="edition">
          <span className="status-dot" aria-hidden="true" />
          <span className="edition-label">Weekly board</span>
          <span className="edition-date">{slate.period}</span>
        </div>
      </header>
      <main className="page">
        <h1 className="sr-only">Football Watchability — {slate.period}</h1>

        <details className="how-to">
          <summary>How to read a card</summary>
          <div className="how-grid">
            <div>
              <strong>Score</strong>
              <p>
                An editorial 0–100 rating of how fun the game should be. ▲▼
                shows the change since the last rating.
              </p>
            </div>
            <div>
              <strong>At stake</strong>
              <p>
                Projected ranking and playoff odds now, after a{" "}
                <span className="scenario-1">win</span> and after a{" "}
                <span className="scenario-2">loss</span>. The bar shows the
                full swing; the white tick is today.
              </p>
            </div>
            <div>
              <strong>Snapshot</strong>
              <p>
                Saved slate for {slate.period}. Rankings and odds are
                projections; TV and weather aren't live.
              </p>
            </div>
          </div>
          <ul className="legend" aria-label="Score guide">
            {tiers.map((t) => (
              <li key={t.id} className={t.id}>
                <i />
                {t.min ? `${t.min}+` : "<64"} {t.label}
              </li>
            ))}
          </ul>
        </details>

        <Filters {...filters} onChange={update} />

        <section id="games" tabIndex={-1} aria-label="Game dashboard">
          <div className="board-heading">
            <h2>{heading}</h2>
            <span role="status">
              {games.length} of {total} games
            </span>
            {filtered && (
              <button
                className="reset"
                onClick={() => setFilters({ ...initial, league })}
              >
                Reset filters
              </button>
            )}
            <span className="sort-label">Sorted by watchability</span>
          </div>
          {games.length ? (
            <div className="game-grid">
              {games.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No matchups found.</h3>
              <p>Try another team, channel, day or conference.</p>
              <button onClick={() => setFilters({ ...initial, league })}>
                Clear filters
              </button>
            </div>
          )}
        </section>
        <footer>
          <p>{slate.broadcastNote.replace(/^📺\s*/, "")}</p>
          <details>
            <summary>About this slate & data</summary>
            <p>{slate.provenance.note}</p>
            {slate.footerNotes.map((note, i) => (
              <p key={i}>{note}</p>
            ))}
            <p>
              Watchability scores rate how worth watching a game should be, not
              who will win. The board is a weekly snapshot, not a live feed.
              All kickoff times are Eastern.
            </p>
          </details>
          <div className="footer-bottom">
            <span>Football Watchability</span>
            <span>Make every screen count.</span>
          </div>
        </footer>
      </main>
    </>
  );
}
