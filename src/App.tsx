import { Suspense, useEffect, useRef, useState } from "react";
import { motionOff } from "./motion";
import { lazyView } from "./lazyView";
import { useUpdateCheck } from "./useUpdateCheck";
import { LiveFreshness } from "./live";
import { TabIcon } from "./components/TabIcon";

const MORE_VIEWS: View[] = ["insanity", "resumes", "injuries", "grid", "empire", "spplus", "nfl"];
import { dayName, results, slate, tiers, type FilterState, type League, type View } from "./data";
import { Filters } from "./components/Filters";
import { GameBoard, useBoard } from "./components/GameBoard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScoreTicker } from "./components/ScoreTicker";
import { FinalScores, FinalScoresToggle, useFinalScoresOpen, useFinalTiles } from "./components/FinalScores";
import { defaultLeague } from "./league";

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
  const finalTiles = useFinalTiles(board);
  const [fsOpen, setFsOpen] = useFinalScoresOpen();
  const switchView = (v: View) => {
    setView(v);
    try {
      sessionStorage.setItem("fbwatch-view", v);
    } catch {
      /* storage blocked */
    }
    setFilters((f) => ({ ...f, day: "all" }));
  };
  // The tab highlight slides from the old tab to the new one: only the new tab's underline is animated, from where the old one was (transform only).
  const lastTab = useRef<DOMRect | null>(null);
  useEffect(() => {
    const btn = document.querySelector<HTMLElement>(`.view-switch [data-tab="${view}"]`);
    if (!btn) return;
    const now = btn.getBoundingClientRect(), was = lastTab.current;
    lastTab.current = now;
    if (!was || !now.width || !was.width || motionOff() || !btn.animate) return;
    const dx = was.left + was.width / 2 - (now.left + now.width / 2), sx = was.width / now.width;
    if (Math.abs(dx) < 2) return;
    try { btn.animate([{ transform: `translateX(${dx}px) scaleX(${sx})` }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::after" }); } catch { /* old browser: no slide */ }
  }, [view]);
  // Phones: the secondary sections sit in a sheet over the tab bar. Choosing one (or anything else) closes it.
  const [moreOpen, setMoreOpen] = useState(false);
  const go = (v: View) => {
    setMoreOpen(false);
    switchView(v);
  };
  useEffect(() => {
    if (!moreOpen) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    const away = (e: MouseEvent) =>
      !(e.target as Element).closest?.(".view-switch") && setMoreOpen(false);
    document.addEventListener("keydown", key);
    document.addEventListener("click", away);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("click", away);
    };
  }, [moreOpen]);
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
            {/* Sections: a segmented control on a computer, a bottom tab bar with a More sheet on a phone (CSS decides; the buttons are the same). */}
            <nav
              className="view-switch segmented"
              aria-label="Sections"
              data-more={moreOpen ? "open" : "closed"}
            >
              <button
                data-tab="board"
                aria-pressed={view === "board"}
                onClick={() => go("board")}
              >
                <TabIcon name="board" />
                <span className="tab-label">
                  Games<span className="count">{gameCount(league)}</span>
                </span>
              </button>
              <button
                data-tab="picks"
                aria-label="ATS picks and parlays"
                aria-pressed={view === "picks"}
                onClick={() => go("picks")}
                title="Picks and parlays, the game simulator, the Upset Alert Meter and the full ATS tracker"
              >
                <TabIcon name="picks" />
                <span className="tab-label"><span className="tl-wide">ATS &amp; Parlays</span><span className="tl-short">Picks</span></span>
              </button>
              <button
                data-tab="teams"
                aria-label="Teams"
                aria-pressed={view === "teams"}
                onClick={() => go("teams")}
                title="Teams: one page per team with its resumé, ratings and performance, and injuries"
              >
                <TabIcon name="teams" />
                <span className="tab-label">Teams</span>
              </button>
              <button
                data-tab="standings"
                aria-label="Standings"
                aria-pressed={view === "standings"}
                onClick={() => go("standings")}
                title="Standings and playoff picture: the NFL by division, every college conference, seeds, tracker, leverage, rankings and bowls"
              >
                <TabIcon name="standings" />
                <span className="tab-label">Standings</span>
              </button>
              <button
                type="button"
                className="tab-more"
                aria-haspopup="true"
                aria-expanded={moreOpen}
                aria-controls="more-sheet"
                aria-pressed={moreOpen || MORE_VIEWS.includes(view)}
                onClick={() => setMoreOpen((o) => !o)}
              >
                <TabIcon name="more" />
                <span className="tab-label">More</span>
              </button>
              <div className="more-sheet" id="more-sheet">
                <button
                  data-tab="insanity"
                  aria-pressed={view === "insanity"}
                  onClick={() => go("insanity")}
                >
                  <TabIcon name="insanity" />
                  <span className="tab-label">Insanity</span>
                </button>
                <button
                  data-tab="resumes"
                  aria-label="Team resumés"
                  aria-pressed={view === "resumes"}
                  onClick={() => go("resumes")}
                  title="Team resumés: every team's best wins, losses (bad ones flagged), strength of schedule, offense and defense ranks"
                >
                  <TabIcon name="resumes" />
                  <span className="tab-label">Resumés</span>
                </button>
                <button
                  data-tab="injuries"
                  aria-label="Injury report"
                  aria-pressed={view === "injuries"}
                  onClick={() => go("injuries")}
                  title="Injury report: the injury, how serious, when each player is likely back, and how much his absence matters"
                >
                  <TabIcon name="injuries" />
                  <span className="tab-label">
                    <span className="t-long">Injuries</span>
                    <span className="t-short">Injuries</span>
                  </span>
                </button>
                <button
                  data-tab="grid"
                  aria-label="TV grid"
                  aria-pressed={view === "grid"}
                  onClick={() => go("grid")}
                >
                  <TabIcon name="grid" />
                  <span className="tab-label">
                    <span className="t-long">TV grid</span>
                    <span className="t-short">TV</span>
                  </span>
                </button>
                <button
                  data-tab="empire"
                  aria-label="Empire"
                  aria-pressed={view === "empire"}
                  onClick={() => go("empire")}
                  title="Imperialism Map: territory changes hands as teams win"
                >
                  <TabIcon name="empire" />
                  <span className="tab-label">
                    <span className="t-long">Empire</span>
                    <span className="t-short">War</span>
                  </span>
                </button>
                <button
                  data-tab="spplus"
                  aria-label="CFB SP+"
                  aria-pressed={view === "spplus"}
                  onClick={() => go("spplus")}
                  title="CFB SP+: ratings, a matchup simulator and an against-the-spread tracker for college football"
                >
                  <TabIcon name="spplus" />
                  <span className="tab-label">
                    <span className="t-long">CFB SP+</span>
                    <span className="t-short">SP+</span>
                  </span>
                </button>
                <button
                  data-tab="nfl"
                  aria-label="NFL+"
                  aria-pressed={view === "nfl"}
                  onClick={() => go("nfl")}
                  title="NFL+: EPA-based team ratings, a matchup simulator and an against-the-spread tracker, from nflverse"
                >
                  <TabIcon name="nfl" />
                  <span className="tab-label">NFL+</span>
                </button>
                <a
                  className="more-export"
                  href="/exports/watch-slate.csv"
                  download={`watch-slate-${slate.period.replace(/[^\w]+/g, "-")}.csv`}
                >
                  <TabIcon name="export" />
                  <span className="tab-label">Export CSV</span>
                </a>
                <a
                  className="more-export"
                  href="/exports/entertaining.ics"
                  download="entertaining-games.ics"
                >
                  <TabIcon name="calendar" />
                  <span className="tab-label">Add to calendar</span>
                </a>
              </div>
            </nav>
            <div className="export-btns">
              <details className="export">
                <summary aria-label="Export options">Export</summary>
                <div className="export-menu">
                  <a
                    href="/exports/watch-slate.csv"
                    download={`watch-slate-${slate.period.replace(/[^\w]+/g, "-")}.csv`}
                  >
                    <strong>Spreadsheet (CSV)</strong>
                    <span>Every game with all the numbers, times Central</span>
                  </a>
                  <a
                    href="/exports/entertaining.ics"
                    download="entertaining-games.ics"
                  >
                    <strong>Calendar (.ics)</strong>
                    <span>Entertaining games as calendar events</span>
                  </a>
                </div>
              </details>
            </div>
          </div>
          <div key={view} className="view-in">
          {view !== "board" ? (
            <ErrorBoundary resetKey={view}>
              <Suspense fallback={<ViewSkeleton />}>
                {view === "empire" ? (
                  <ImperialismMap defaultLeague={league} />
                ) : view === "picks" ? (
                  <PicksHub defaultLeague={league} />
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
              {([["live", board.counts.live, "in progress", "live"], ["final", board.counts.final, "completed", "final"], ["upcoming", board.counts.upcoming, "upcoming", "soon"]] as const).map(([k, n, label, short]) => (
                <button key={k} type="button" data-short={short} className={`status-chip${filters.status === k ? " on" : ""}`} aria-pressed={filters.status === k} onClick={() => update({ status: filters.status === k ? "all" : k })}>
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
            <span className="sort-label">Kickoff time slots · best watchability first in each slot</span>
          </div>
          <FinalScores tiles={finalTiles} open={fsOpen} />
          <GameBoard
            board={board}
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
