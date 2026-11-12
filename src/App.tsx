import { Suspense, useEffect, useState } from "react";
import { lazyView } from "./lazyView";
import { useUpdateCheck } from "./useUpdateCheck";
import { TrophyCredits } from "./components/TrophyCredits";
import { LiveFreshness } from "./live";
import { PrimaryNav } from "./nav/PrimaryNav";
import { pushNav, readNav, useViewHistory } from "./nav/useViewHistory";
import { useOpenGame } from "./components/GameCenterContext";
import { dayName, results, slate, tiers, type FilterState, type League, type View } from "./data";
import { Filters } from "./components/Filters";
import { GameBoard, useBoard } from "./components/GameBoard";
import { BoardSort, type BoardSortKey } from "./components/BoardSort";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScoreTicker } from "./components/ScoreTicker";
import { FinalScores, FinalScoresToggle, useFinalScoresOpen, useFinalTiles } from "./components/FinalScores";
import { defaultLeague } from "./league";
import { isView } from "./nav/navConfig";

// The map and its shapes load only when the tab is opened.
const ImperialismMap = lazyView(() => import("./components/ImperialismMap").then((m) => ({ default: m.ImperialismMap })), "ImperialismMap");
import { RefreshUi } from "./components/RefreshUi";
import { ViewSkeleton } from "./components/Skeleton";
const PicksHub = lazyView(() => import("./components/PicksHub").then((m) => ({ default: m.PicksHub })), "PicksHub");
const InsanityBoard = lazyView(() => import("./components/InsanityBoard").then((m) => ({ default: m.InsanityBoard })), "InsanityBoard");
const TvGrid = lazyView(() => import("./components/TvGrid").then((m) => ({ default: m.TvGrid })), "TvGrid");
const SpPlusTab = lazyView(() => import("./spplus/SpPlusTab"), "SpPlusTab");
const NflTab = lazyView(() => import("./nfl/NflTab"), "NflTab");
const InjuriesTab = lazyView(() => import("./components/InjuriesTab").then((m) => ({ default: m.InjuriesTab })), "InjuriesTab");
const TradeFinder = lazyView(() => import("./components/TradeFinder").then((m) => ({ default: m.TradeFinder })), "TradeFinder");
const TeamsTab = lazyView(() => import("./components/TeamsTab").then((m) => ({ default: m.TeamsTab })), "TeamsTab");
const ResumesTab = lazyView(() => import("./components/ResumesTab").then((m) => ({ default: m.ResumesTab })), "ResumesTab");
const StandingsHub = lazyView(() => import("./components/StandingsHub").then((m) => ({ default: m.StandingsHub })), "StandingsHub");
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
  const [filters, setFilters] = useState<FilterState>(() => ({ ...initial, status: readNav().status }));
  const [view, setView] = useState<View>(() => {
    // The address names the section (?view=trades); an unknown name is the board. After the automatic reload that picks up a new
    // version, come back to the tab that was being opened.
    const named = new URLSearchParams(location.search).get("view");
    if (named) return readNav().view;
    try {
      if (sessionStorage.getItem("fbwatch-resume")) {
        sessionStorage.removeItem("fbwatch-resume");
        const v = sessionStorage.getItem("fbwatch-view");
        if (v && isView(v)) return v;
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
      if (isView(v)) switchView(v);
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
  const finalTiles = useFinalTiles(board);
  const [fsOpen, setFsOpen] = useFinalScoresOpen();
  const [boardSort, setBoardSort] = useState<BoardSortKey>("time");
  const switchView = (v: View) => {
    pushNav(v, filters.status);
    setView(v);
    try {
      sessionStorage.setItem("fbwatch-view", v);
    } catch {
      /* storage blocked */
    }
    setFilters((f) => ({ ...f, day: "all" }));
  };
  // Games status entries in the menu: the existing status filter, on the board (choosing the active one clears it, as the chips do).
  const showStatus = (s: Exclude<FilterState["status"], "all">) => {
    const next = view === "board" && filters.status === s ? "all" : s;
    pushNav("board", next);
    setView("board");
    setFilters((f) => ({ ...f, day: "all", status: next }));
  };
  // The dashboard entry on the board itself clears the status filter; from another section it keeps the reader's filters.
  const showBoard = (v: View) => {
    if (v === "board" && view === "board" && filters.status !== "all") showStatus(filters.status as Exclude<FilterState["status"], "all">);
    else switchView(v);
  };
  useViewHistory(view, filters.status, (n) => {
    setView(n.view);
    setFilters((f) => ({ ...f, status: n.status }));
  });
  // Game Center from the menu: the top game on the board (a live one first, else the most watchable upcoming one, else a finished one).
  const openGame = useOpenGame();
  const openTopGame = () => {
    const top = board.closing[0] ?? board.live[0] ?? [...board.upcoming].sort((a, b) => b.score - a.score)[0] ?? board.justFinal[0] ?? board.finals[0];
    if (!top) return false;
    if (view !== "board") switchView("board");
    openGame(top.espnId);
    return true;
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
      <RefreshUi />
      {outdated && (
        <div className="update-bar" role="status">
          A new version of the board is ready.
          <button type="button" onClick={() => location.reload()}>Reload</button>
        </div>
      )}
      <ScoreTicker />
      <header className="site-header">
        <a href="/" className="brand" aria-label="Football Watchability home">
          <img className="brand-logo" src="/icon-192.png" alt="" width="34" height="34" decoding="async" />
          <span className="brand-name">Football Watchability</span>
        </a>
      <details className="how-to" id="how-to-read">
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


        {view === "board" && <Filters {...filters} onChange={update} />}

        <section id="games" tabIndex={-1} aria-label="Game dashboard">
          <div className="view-row">
            <PrimaryNav
              view={view}
              status={filters.status}
              counts={{ ...board.counts, all: gameCount(league) }}
              onView={showBoard}
              onStatus={showStatus}
              onGameCenter={openTopGame}
            />
          </div>
          <div key={view} className="view-in">
          {view !== "board" ? (
            <ErrorBoundary resetKey={view}>
              <Suspense fallback={<ViewSkeleton />}>
                {view === "empire" ? (
                  <ImperialismMap defaultLeague={league} />
                ) : view === "picks" ? (
                  <PicksHub defaultLeague={league} />
                ) : view === "trades" ? (
                  <TradeFinder />
                ) : view === "teams" ? (
                  <TeamsTab defaultLeague={league} />
                ) : view === "resumes" ? (
                  <ResumesTab defaultLeague={league} />
                ) : view === "standings" ? (
                  <StandingsHub defaultLeague={league} />
                ) : view === "injuries" ? (
                  <InjuriesTab defaultLeague={league} />
                ) : view === "outlook" ? (
                  <StandingsHub defaultLeague={league} start="playoff" />
                ) : view === "spplus" ? (
                  <SpPlusTab />
                ) : view === "nfl" ? (
                  <NflTab />
                ) : view === "upset" ? (
                  <PicksHub defaultLeague={league} start="upset" />
                ) : view === "sim" ? (
                  <PicksHub defaultLeague={league} start="sim" />
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
            <span role="status" className="status-chips">
              {([["all", board.counts.all, "All games", "All"], ["live", board.counts.live, "Live", "Live"], ["upcoming", board.counts.upcoming, "Upcoming", "Soon"], ["final", board.counts.final, "Final", "Final"]] as const).map(([k, n, label, short]) => (
                <button key={k} type="button" data-short={short} data-status-chip={k} className={`status-chip${filters.status === k ? " on" : ""}`} aria-pressed={filters.status === k} onClick={() => update({ status: k })}>
                  <b>{n}</b> <span className="sc-l">{label}</span>
                </button>
              ))}
              <FinalScoresToggle count={finalTiles.length} open={fsOpen} onToggle={() => setFsOpen(!fsOpen)} />
            </span>
            {filtered && (
              <button className="reset" onClick={() => setFilters({ ...initial, league })}>
                Reset filters
              </button>
            )}
            {filters.status !== "final" && board.counts.live + board.counts.upcoming > 1 && <BoardSort value={boardSort} onChange={setBoardSort} />}
          </div>
          <FinalScores tiles={finalTiles} open={fsOpen} />
          <GameBoard
            board={board}
            sort={boardSort}
            status={filters.status}
            filtered={filtered}
            onReset={() => setFilters({ ...initial, league })}
          />
            </>
          )}
          </div>
        </section>
        <footer>
          <p>{slate.broadcastNote.replace(/^📺\s*/, "")}</p>
          <details id="about-slate">
            <summary>About this slate & data</summary>
            <p>{slate.provenance.note}</p>
            {slate.footerNotes.map((note, i) => (
              <p key={i}>{note}</p>
            ))}
            <TrophyCredits />
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
