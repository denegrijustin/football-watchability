import { Suspense, useEffect, useState } from "react";
import { lazyView } from "./lazyView";
import { useUpdateCheck } from "./useUpdateCheck";
import { LiveFreshness } from "./live";
import { dayName, results, slate, tiers, type FilterState, type League, type View } from "./data";
import { Filters } from "./components/Filters";
import { GameBoard, useBoard } from "./components/GameBoard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScoreTicker } from "./components/ScoreTicker";
import { defaultLeague } from "./league";

// The map and its shapes load only when the tab is opened.
const ImperialismMap = lazyView(() => import("./components/ImperialismMap").then((m) => ({ default: m.ImperialismMap })), "ImperialismMap");
const Outlook = lazyView(() => import("./components/Outlook").then((m) => ({ default: m.Outlook })), "Outlook");
const InsanityBoard = lazyView(() => import("./components/InsanityBoard").then((m) => ({ default: m.InsanityBoard })), "InsanityBoard");
const TvGrid = lazyView(() => import("./components/TvGrid").then((m) => ({ default: m.TvGrid })), "TvGrid");
const SpPlusTab = lazyView(() => import("./spplus/SpPlusTab"), "SpPlusTab");
const NflTab = lazyView(() => import("./nfl/NflTab"), "NflTab");
const UpsetMeter = lazyView(() => import("./components/UpsetMeter").then((m) => ({ default: m.UpsetMeter })), "UpsetMeter");
const SimTab = lazyView(() => import("./sim/SimTab"), "SimTab");
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
  const outdated = useUpdateCheck();
  const [filters, setFilters] = useState<FilterState>(initial);
  const [view, setView] = useState<View>(() => {
    // After the automatic reload that picks up a new version, come back to the tab that was being opened.
    try {
      if (sessionStorage.getItem("fbwatch-resume")) {
        sessionStorage.removeItem("fbwatch-resume");
        const v = sessionStorage.getItem("fbwatch-view") as View | null;
        if (v) return v;
      }
    } catch {
      /* storage blocked: start on the board */
    }
    return "board";
  });
  const update = (patch: Partial<FilterState>) => setFilters((f) => ({ ...f, ...patch }));
  // Other parts of the page (the Game Center) can send the reader to a tab.
  useEffect(() => {
    const open = (e: Event) => {
      const v = (e as CustomEvent<View>).detail;
      if (v) switchView(v);
    };
    window.addEventListener("fbwatch:open-view", open);
    return () => window.removeEventListener("fbwatch:open-view", open);
  });
  // The ticker, the header, the filters and the tab row all stay at the top of the page. Each sticks under the ones above it, so each one's
  // offset is the height of the sticky ones before it (the header and filters only stick on wide screens; see styles.css).
  useEffect(() => {
    const root = document.documentElement;
    const pick = (sel: string) => document.querySelector<HTMLElement>(sel);
    const apply = () => {
      const tall = (el: HTMLElement | null) => (el && getComputedStyle(el).position === "sticky" ? el.offsetHeight : 0);
      const t = tall(pick(".ticker"));
      const h = tall(pick(".site-header"));
      const d = tall(pick(".filter-dock"));
      root.style.setProperty("--stk-header", `${t}px`);
      root.style.setProperty("--stk-dock", `${t + h}px`);
      root.style.setProperty("--stk-nav", `${t + h + d}px`);
    };
    apply();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    for (const sel of [".ticker", ".site-header", ".filter-dock"]) {
      const el = pick(sel);
      if (el) ro?.observe(el);
    }
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [view, filters.league]);
  const { league } = filters;
  const board = useBoard(filters);
  const switchView = (v: View) => {
    setView(v);
    try {
      sessionStorage.setItem("fbwatch-view", v);
    } catch {
      /* storage blocked */
    }
    setFilters((f) => ({ ...f, day: "all" }));
  };
  const filtered =
    filters.query !== "" ||
    filters.day !== "all" ||
    filters.minScore !== 0 ||
    filters.status !== "all" ||
    filters.conference !== "all-fbs";
  const heading = (league === "NFL" ? "NFL" : "College") + (filters.day === "all" ? " games" : ` · ${dayName(filters.day)}`);

  return (
    <>
      <a className="skip-link" href="#games">
        Skip to games
      </a>
      {outdated && (
        <div className="update-bar" role="status">
          A new version of the board is ready.
          <button type="button" onClick={() => location.reload()}>Reload</button>
        </div>
      )}
      <ScoreTicker />
      <header className="site-header">
        <a href="/" className="brand" aria-label="Football Watchability home">
          <span className="brand-mark" aria-hidden="true">
            FW
          </span>
          <span className="brand-name">Football Watchability</span>
        </a>
      <details className="how-to">
        <summary aria-label="How to read a card"><span>How to read a card</span></summary>
        <div className="how-pop">
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
              “NFC #4 (FPI)” is the team's place in its conference by ESPN's FPI power rating, not by record or the
              polls. The small number to the left of a team's name is its national rank: SP+ for college, NFL+ for the
              NFL, the same rankings as those two tabs.
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
        </div>
      </details>
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
          <LiveFreshness />
        </div>
      </header>
      <main className="page">
        <h1 className="sr-only">Football Watchability — {slate.period}</h1>


        {view === "board" && <Filters {...filters} counts={board.counts} onChange={update} />}

        <section id="games" tabIndex={-1} aria-label="Game dashboard">
          <div className="view-row">
          <div className="view-switch segmented" role="group" aria-label="Games to show">
            <button aria-pressed={view === "board"} onClick={() => switchView("board")}>
              Games<span className="count">{gameCount(league)}</span>
            </button>
            <button aria-label="TV grid" aria-pressed={view === "grid"} onClick={() => switchView("grid")}>
              <span className="t-long">TV grid</span>
              <span className="t-short">TV</span>
            </button>
            <button aria-label="Upset Alert Meter" aria-pressed={view === "upset"} onClick={() => switchView("upset")} title="Upset Alert Meter: how much has to go wrong for each favorite, and which upsets have happened">
              <span className="t-long">Upsets</span>
              <span className="t-short">Upsets</span>
            </button>
            <button aria-pressed={view === "insanity"} onClick={() => switchView("insanity")}>
              Insanity
            </button>
            <button aria-pressed={view === "outlook"} onClick={() => switchView("outlook")}>
              Outlook
            </button>
            <button aria-label="Empire" aria-pressed={view === "empire"} onClick={() => switchView("empire")} title="Imperialism Map: territory changes hands as teams win">
              <span className="t-long">Empire</span>
              <span className="t-short">War</span>
            </button>
            <button aria-label="CFB SP+" aria-pressed={view === "spplus"} onClick={() => switchView("spplus")} title="CFB SP+: ratings, a matchup simulator and an against-the-spread tracker for college football">
              <span className="t-long">CFB SP+</span>
              <span className="t-short">SP+</span>
            </button>
            <button aria-label="NFL+" aria-pressed={view === "nfl"} onClick={() => switchView("nfl")} title="NFL+: EPA-based team ratings, a matchup simulator and an against-the-spread tracker, from nflverse">
              <span className="t-long">NFL+</span>
              <span className="t-short">NFL+</span>
            </button>
            <button aria-label="Simulator" aria-pressed={view === "sim"} onClick={() => switchView("sim")} title="Game simulator: a full play-by-play game built from real season stats, with a forecast from thousands of replays">
              <span className="t-long">Simulator</span>
              <span className="t-short">Sim</span>
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
          {view !== "board" ? (
            <ErrorBoundary resetKey={view}>
              <Suspense fallback={<p className="ol-note" role="status">Loading…</p>}>
                {view === "empire" ? (
                  <ImperialismMap defaultLeague={league} />
                ) : view === "outlook" ? (
                  <Outlook defaultLeague={league} />
                ) : view === "spplus" ? (
                  <SpPlusTab />
                ) : view === "nfl" ? (
                  <NflTab />
                ) : view === "upset" ? (
                  <UpsetMeter defaultLeague={league} />
                ) : view === "sim" ? (
                  <SimTab defaultLeague={league} />
                ) : view === "insanity" ? (
                  <InsanityBoard defaultLeague={league === "CFB" ? "CFB" : "NFL"} />
                ) : (
                  <TvGrid />
                )}
              </Suspense>
            </ErrorBoundary>
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
