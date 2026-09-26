import { useState } from "react";
import { filterGames, slate, type League } from "./data";
import { Filters } from "./components/Filters";
import { GameCard } from "./components/GameCard";
export default function App() {
  const [league, setLeague] = useState<League>("NFL");
  const [conference, setConference] = useState("all-fbs");
  const [query, setQuery] = useState("");
  const games = filterGames(league, conference, query);
  const total = slate.games.filter((g) => g.league === league).length;
  return (
    <>
      <a className="skip-link" href="#games">
        Skip to games
      </a>
      <header className="site-header">
        <a href="/" className="brand" aria-label="Football Watchability home">
          <span className="brand-mark" aria-hidden="true">
            FW<span>↗</span>
          </span>
          <span>
            FOOTBALL
            <br />
            WATCHABILITY
          </span>
        </a>
        <div className="edition">
          <span className="status-dot" />
          THE WEEKLY BOARD<span className="edition-date">{slate.period}</span>
        </div>
      </header>
      <main className="page">
        <section className="intro">
          <div>
            <p className="eyebrow">LESS CHANNEL SURFING. MORE FOOTBALL.</p>
            <h1>
              Find your <em>must-watch.</em>
            </h1>
            <p className="intro-copy">
              Every matchup. The stakes. The screen it belongs on.
            </p>
          </div>
          <div className="slate-stats">
            <div>
              <strong>{slate.games.length}</strong>
              <span>GAMES ON THE BOARD</span>
            </div>
            <div>
              <strong>{slate.games.filter((g) => g.score >= 90).length}</strong>
              <span>MUST-WATCH PICKS</span>
            </div>
          </div>
        </section>
        <div className="snapshot-note">
          <span className="snapshot-badge">SAVED SLATE</span>
          <p>
            {slate.period} · Original dashboard data. Rankings and playoff odds
            are projections; weather and listings are a snapshot, not live
            updates.
          </p>
        </div>
        <Filters
          league={league}
          conference={conference}
          query={query}
          onLeague={setLeague}
          onConference={setConference}
          onQuery={setQuery}
        />
        <section id="games" tabIndex={-1} aria-label="Game dashboard">
          <div className="board-heading">
            <div>
              <h2>{league === "NFL" ? "NFL matchups" : "College matchups"}</h2>
              <span role="status">
                {games.length} of {total} games
              </span>
            </div>
            <span className="sort-label">↓ Highest watchability first</span>
          </div>
          <div className="legend" aria-label="Score guide">
            <span>
              <i className="elite-dot" />
              90+ Must watch
            </span>
            <span>
              <i className="good-dot" />
              70–89 Worth a screen
            </span>
            <span>
              <i className="low-dot" />
              Under 70 Pick your spots
            </span>
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
              <p>Try another team, channel or conference.</p>
              <button
                onClick={() => {
                  setQuery("");
                  setConference("all-fbs");
                }}
              >
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
              Watchability scores are editorial ratings, not game scores.
              Ranking scenarios and playoff odds are imported estimates; no live
              prediction service is connected. All kickoff times are shown as
              supplied in Eastern time.
            </p>
          </details>
          <div className="footer-bottom">
            <span>FOOTBALL WATCHABILITY</span>
            <span>Make every screen count.</span>
          </div>
        </footer>
      </main>
    </>
  );
}
