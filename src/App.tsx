import { useState } from "react";
import {
  dayName,
  filterGames,
  filterResults,
  results,
  slate,
  tiers,
  type FilterState,
  type League,
  type View,
} from "./data";
import { Filters } from "./components/Filters";
import { GameCard } from "./components/GameCard";
import { ResultCard } from "./components/ResultCard";
import { TvGrid } from "./components/TvGrid";
import { setTz, tzLabel, useTz, ZONES } from "./tz";
import { downloadSlateJpg } from "./exportJpg";

const upcomingCount = (l: League) => slate.games.filter((g) => g.league === l).length;
const finalCount = (l: League) => results.filter((r) => r.league === l).length;
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / (xs.length || 1));

const initial: FilterState = {
  league: "NFL",
  conference: "all-fbs",
  query: "",
  day: "all",
  minScore: 0,
};

export default function App() {
  const tz = useTz();
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<FilterState>(initial);
  const [view, setView] = useState<View>(upcomingCount("NFL") ? "upcoming" : "final");
  const update = (patch: Partial<FilterState>) => {
    setFilters((f) => ({ ...f, ...patch }));
    // Switching to a league with nothing in this view flips to the other one.
    if (patch.league) {
      if (view === "upcoming" && !upcomingCount(patch.league) && finalCount(patch.league)) setView("final");
      if (view === "final" && !finalCount(patch.league) && upcomingCount(patch.league)) setView("upcoming");
    }
  };
  const { league } = filters;
  const games = filterGames(filters);
  const finals = filterResults(filters);
  const weeks = [...new Set(finals.map((r) => r.week))];
  const total = view === "final" ? finalCount(league) : upcomingCount(league);
  const shown = view === "final" ? finals.length : games.length;
  const switchView = (v: View) => {
    setView(v);
    setFilters((f) => ({ ...f, day: "all" }));
  };
  const filtered =
    filters.query !== "" ||
    filters.day !== "all" ||
    filters.minScore !== 0 ||
    (league === "CFB" && filters.conference !== "all-fbs");
  const heading =
    (league === "NFL" ? "NFL" : "College") +
    (filters.day === "all" ? (view === "final" ? " results" : " matchups") : ` · ${dayName(filters.day)}`);

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
        <label className="tz-pick">
          <span className="sr-only">Time zone</span>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <select value={tz} onChange={(e) => setTz(e.target.value)} aria-label="Time zone">
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label} ({z.abbr})
              </option>
            ))}
          </select>
        </label>
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
                A 0–100 forecast of how fun the game should be; “Why it’s a…”
                shows the math. ▲▼ is the change since the last update. After
                the game, Final scores what actually happened on the same scale.
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
                Updated 8am Central Tue, Thu, Fri, Sun and Mon for{" "}
                {slate.period}. Rankings and odds are projections; TV and
                weather aren't live.
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

        {view !== "grid" && <Filters {...filters} view={view} onChange={update} />}

        <section id="games" tabIndex={-1} aria-label="Game dashboard">
          <div className="view-row">
          <div className="view-switch segmented" role="group" aria-label="Games to show">
            <button aria-pressed={view === "upcoming"} onClick={() => switchView("upcoming")}>
              Upcoming<span className="count">{upcomingCount(league)}</span>
            </button>
            <button aria-pressed={view === "grid"} onClick={() => switchView("grid")}>
              TV grid
            </button>
            <button aria-pressed={view === "final"} onClick={() => switchView("final")}>
              Final<span className="vs-extra"> · forecast vs actual</span><span className="count">{finalCount(league)}</span>
            </button>
          </div>
          <div className="export-btns">
            <button
              type="button"
              className="export-jpg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await downloadSlateJpg();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {busy ? (
                "Making image…"
              ) : (
                <>
                  Download<span className="dl-extra"> weekend</span> JPG
                </>
              )}
            </button>
            <details className="export">
              <summary aria-label="More export options">More</summary>
              <div className="export-menu">
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await downloadSlateJpg({ onlyEntertaining: true });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <strong>Entertaining games only (JPG)</strong>
                  <span>Just the 74+ games, Thursday to Monday</span>
                </button>
                <a href="/exports/watch-slate.csv" download={`watch-slate-${slate.period.replace(/[^\w]+/g, "-")}.csv`}>
                  <strong>Spreadsheet (CSV)</strong>
                  <span>Every game with all the numbers, times Central</span>
                </a>
                <a href="/exports/entertaining.ics" download="entertaining-games.ics">
                  <strong>Calendar (.ics)</strong>
                  <span>Entertaining games as calendar events</span>
                </a>
              </div>
            </details>
          </div>
          </div>
          {view === "grid" ? (
            <TvGrid />
          ) : (
            <>
          <div className="board-heading">
            <h2>{heading}</h2>
            <span role="status">
              {shown} of {total} games
            </span>
            {filtered && (
              <button
                className="reset"
                onClick={() => setFilters({ ...initial, league })}
              >
                Reset filters
              </button>
            )}
            <span className="sort-label">
              {view === "final" ? "Sorted by actual watchability" : "Sorted by watchability"}
            </span>
          </div>
          {view === "final" ? (
            finals.length ? (
              weeks.map((w) => {
                const rs = finals.filter((r) => r.week === w);
                const best = [...rs].sort((a, b) => b.delta - a.delta)[0];
                return (
                  <section key={w} className="week-block" aria-label={`Results, ${w}`}>
                    <div className="week-head">
                      <h3>{w}</h3>
                      <p>
                        {rs.length} final{rs.length === 1 ? "" : "s"} · forecast avg {avg(rs.map((r) => r.forecast.score))} · actual avg{" "}
                        {avg(rs.map((r) => r.actual.score))}
                        {rs.some((r) => r.scoreCheck) && (
                          <>
                            {" "}
                            · winners picked {rs.filter((r) => r.scoreCheck?.winnerRight).length} of{" "}
                            {rs.filter((r) => r.scoreCheck).length} · margin off by{" "}
                            {(
                              rs.reduce((a, r) => a + Math.abs(r.scoreCheck?.marginMiss ?? 0), 0) /
                              (rs.filter((r) => r.scoreCheck).length || 1)
                            ).toFixed(1)}{" "}
                            on average
                          </>
                        )}
                        {best && best.delta > 4 && (
                          <>
                            {" "}
                            · biggest overachiever: {best.matchup} (+{best.delta})
                          </>
                        )}
                      </p>
                    </div>
                    <div className="game-grid">
                      {rs.map((r) => (
                        <ResultCard key={r.espnId} result={r} />
                      ))}
                    </div>
                  </section>
                );
              })
            ) : (
              <div className="empty-state">
                <h3>No finished games yet.</h3>
                <p>
                  {finalCount(league)
                    ? "Try another team, channel, day or conference."
                    : "Results appear here after the Friday, Sunday, Monday and Tuesday morning updates."}
                </p>
                {filtered && <button onClick={() => setFilters({ ...initial, league })}>Clear filters</button>}
              </div>
            )
          ) : games.length ? (
            <div className="game-grid">
              {games.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>{upcomingCount(league) ? "No matchups found." : "No games left this week."}</h3>
              <p>
                {upcomingCount(league)
                  ? "Try another team, channel, day or conference."
                  : "Switch to Final to see how each game played against its forecast."}
              </p>
              {filtered && <button onClick={() => setFilters({ ...initial, league })}>Clear filters</button>}
            </div>
          )}
            </>
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
              who will win. The board refreshes five mornings a week, not live.
              Kickoff times are shown in {tzLabel(tz)} time; change it at the top of the page.
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
