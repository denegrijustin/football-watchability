import { lazy, Suspense, useState } from "react";
import { dayName, results, slate, tiers, type FilterState, type League, type View } from "./data";
import { Filters } from "./components/Filters";
import { GameBoard, useBoard } from "./components/GameBoard";
import { InsanityBoard } from "./components/InsanityBoard";
import { Outlook } from "./components/Outlook";
import { defaultLeague } from "./league";

// The map and its shapes load only when the tab is opened.
const ImperialismMap = lazy(() => import("./components/ImperialismMap").then((m) => ({ default: m.ImperialismMap })));
import { TvGrid } from "./components/TvGrid";
import { setTz, tzLabel, useTz, ZONES } from "./tz";

const gameCount = (l: League) => slate.games.filter((g) => g.league === l).length + results.filter((r) => r.league === l).length;

const initial: FilterState = {
  league: defaultLeague(),
  conference: "all-fbs",
  query: "",
  day: "all",
  minScore: 0,
  status: "all",
};

export default function App() {
  const tz = useTz();
  const [filters, setFilters] = useState<FilterState>(initial);
  const [view, setView] = useState<View>("board");
  const update = (patch: Partial<FilterState>) => setFilters((f) => ({ ...f, ...patch }));
  const { league } = filters;
  const board = useBoard(filters);
  const switchView = (v: View) => {
    setView(v);
    setFilters((f) => ({ ...f, day: "all" }));
  };
  const filtered =
    filters.query !== "" ||
    filters.day !== "all" ||
    filters.minScore !== 0 ||
    filters.status !== "all" ||
    (league === "CFB" && filters.conference !== "all-fbs");
  const heading = (league === "NFL" ? "NFL" : "College") + (filters.day === "all" ? " games" : ` · ${dayName(filters.day)}`);

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
              <strong>Rank line</strong>
              <p>
                “NFC #4 · #7 overall (FPI)” is the team's place in its conference and in the whole league, both by
                ESPN's FPI power rating, not by record or the polls. The record sits beside it, and AP polls are
                labeled AP.
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

        {view === "board" && <Filters {...filters} counts={board.counts} onChange={update} />}

        <section id="games" tabIndex={-1} aria-label="Game dashboard">
          <div className="view-row">
          <div className="view-switch segmented" role="group" aria-label="Games to show">
            <button aria-pressed={view === "board"} onClick={() => switchView("board")}>
              Games<span className="count">{gameCount(league)}</span>
            </button>
            <button aria-pressed={view === "grid"} onClick={() => switchView("grid")}>
              TV grid
            </button>
            <button aria-pressed={view === "insanity"} onClick={() => switchView("insanity")}>
              Insanity
            </button>
            <button aria-pressed={view === "outlook"} onClick={() => switchView("outlook")}>
              Outlook
            </button>
            <button aria-pressed={view === "empire"} onClick={() => switchView("empire")} title="Imperialism Map: territory changes hands as teams win">
              Empire
            </button>
          </div>
          <div className="export-btns">
            <details className="export">
              <summary aria-label="Export options">Export</summary>
              <div className="export-menu">
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
          {view === "empire" ? (
            <Suspense fallback={<p className="ol-note" role="status">Loading the map…</p>}>
              <ImperialismMap defaultLeague={league} />
            </Suspense>
          ) : view === "outlook" ? (
            <Outlook defaultLeague={league} />
          ) : view === "insanity" ? (
            <InsanityBoard defaultLeague={league === "CFB" ? "CFB" : "NFL"} />
          ) : view === "grid" ? (
            <TvGrid />
          ) : (
            <>
          <div className="board-heading">
            <h2>{heading}</h2>
            <span role="status">
              {board.counts.live} in progress · {board.counts.final} completed · {board.counts.upcoming} upcoming
            </span>
            {filtered && (
              <button className="reset" onClick={() => setFilters({ ...initial, league })}>
                Reset filters
              </button>
            )}
            <span className="sort-label">Kickoff time slots · best watchability first in each slot</span>
          </div>
          <GameBoard
            board={board}
            status={filters.status}
            filtered={filtered}
            onReset={() => setFilters({ ...initial, league })}
          />
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
