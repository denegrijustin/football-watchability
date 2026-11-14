import { useEffect, useRef, useState, type ReactNode } from "react";
import { archivedIds, filterGames, filterResults, slate, type FilterState, type Result } from "../data";
import { gameStatus, useLiveMap, useNow } from "../live";
import { timeOf, tzAbbr, useTz } from "../tz";
import { compareDone, type DoneSort } from "../completedSort";
import { insanity } from "../insanity";
import { usePlusRanks } from "../plusRanks";
import { DoneSortControl } from "./DoneSortControl";
import { useClosingUpsets } from "../brewing";
import type { StatusCounts } from "./Filters";
import { GameCard } from "./GameCard";
import { ResultCard } from "./ResultCard";
import { LinesBar } from "./LinesBar";
import { WatchNow } from "./WatchNow";
import { BoardSort, type BoardSortKey } from "./BoardSort";
import { StateNotice } from "./StateNotice";
import { fault } from "../fault";
import { loadResults } from "../data";
import { useOptionalData } from "../data/optional";
import { useFlip } from "../motion";
import { liveHeat } from "../watchNow";
import { observeScores } from "../touchdown";
import { useBoardBusy } from "../boardBusy";

type Game = ReturnType<typeof filterGames>[number];
const refOf = (r: Result) => ({ id: r.espnId, league: r.league, teams: r.teams });
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / (xs.length || 1));
/** Completed games shown under "All" before a "Show all" button, so Upcoming isn't buried. */
const COMPLETED_PREVIEW = 12;

export type Board = {
  /** Kicked off and not final yet. */
  live: Game[];
  /** Live games with an upset brewing in the 4th quarter or overtime, closest to final first (they are not in `live`). */
  closing: Game[];
  /** Finished on the feed but not archived yet: "just finished". */
  justFinal: Game[];
  /** This week's archived finals, filtered. */
  finals: Result[];
  /** Finals from earlier weeks (kept in the archive, shown behind "Earlier weeks", not counted). */
  earlier: Result[];
  upcoming: Game[];
  counts: StatusCounts;
};

/**
 * Splits the board's games by where they are in their life, after the other
 * filters (league, conference, search, day, score). The Status filter only
 * chooses which sections to show, so its buttons can display every count.
 */
export function useBoard(filters: FilterState): Board {
  const map = useLiveMap();
  const now = useNow();
  const games = filterGames(filters).filter((g) => !archivedIds.has(g.espnId));
  const by = (s: "live" | "final" | "upcoming") =>
    games.filter((g) => gameStatus((g as { date?: string }).date ?? "", map[g.espnId], now) === s);
  const closingMap = useClosingUpsets();
  const allLive = by("live");
  const closing = allLive.filter((g) => closingMap.has(g.espnId)).sort((a, b) => closingMap.get(a.espnId)! - closingMap.get(b.espnId)!);
  const live = allLive.filter((g) => !closingMap.has(g.espnId));
  const justFinal = by("final").sort((a, b) => ((b as { date?: string }).date ?? "").localeCompare((a as { date?: string }).date ?? ""));
  const upcoming = by("upcoming");
  // Completed on the board is this week's finals. Earlier weeks stay in the archive, behind "Earlier weeks", and are not counted.
  const archive = filterResults(filters);
  const finals = archive.filter((r) => r.week === slate.period);
  const earlier = archive.filter((r) => r.week !== slate.period);
  const done = justFinal.length + finals.length;
  return {
    live,
    closing,
    justFinal,
    finals,
    earlier,
    upcoming,
    counts: { all: allLive.length + done + upcoming.length, live: allLive.length, final: done, upcoming: upcoming.length },
  };
}

const SECTION_HELP = {
  live: "Kicked off and not final yet, kickoff slots in time order, best watchability first in each slot.",
  final: "Finished games with forecast vs actual, newest week first, ordered within each week by the sort you pick.",
  upcoming: "Still to play, kickoff slots in time order, best watchability first in each slot.",
};

/** A grid of cards whose members slide to their new places when the order or the set changes (see useFlip). */
function FlipGrid({ children, games, className = "game-grid", ...rest }: { children: ReactNode; games: Game[]; className?: string; "aria-label"?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, games.map((g) => g.id).join("|"));
  return <div ref={ref} className={className} {...rest}>{children}</div>;
}

function KickoffSlots({ games, hot = false, sort = "time" }: { games: Game[]; hot?: boolean; sort?: BoardSortKey }) {
  const tz = useTz();
  const map = useLiveMap();
  const busy = useBoardBusy();
  // While the reader is on a card (hovering, focused or expanded) the order they were looking at is kept; it settles when they step away.
  const held = useRef(new Map<string, number>());
  const fresh = (g: Game) => (hot ? liveHeat(g.score, map[g.espnId]) : g.score);
  const heat = (g: Game) => (busy && held.current.has(g.id) ? 1000 - held.current.get(g.id)! : fresh(g));
  const settle = (list: Game[]) => { if (!busy) list.forEach((g, i) => held.current.set(g.id, i)); };
  // Sorted by watchability: one list, best first, and ties stay in kickoff order (then by id) so the order is stable.
  if (sort === "watch") {
    const flat = [...games].sort((a, b) => heat(b) - heat(a) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    settle(flat);
    return <FlipGrid games={flat}>{flat.map((game) => <GameCard key={game.id} game={game} />)}</FlipGrid>;
  }
  const slots = new Map<string, Game[]>();
  for (const game of [...games].sort((a, b) => a.date.localeCompare(b.date))) {
    const kickoff = new Date(game.date);
    kickoff.setUTCMinutes(0, 0, 0);
    const date = kickoff.toISOString();
    const group = slots.get(date) ?? [];
    group.push(game);
    group.sort((a, b) => heat(b) - heat(a) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    slots.set(date, group);
  }
  for (const g of slots.values()) settle(g);
  return <>{[...slots].map(([date, games]) => (
    <section className="kickoff-slot" key={date} data-kickoff={date} aria-label={`Kickoff ${date}`}>
      <h4>{new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: tz })} · {timeOf(date, tz, true)}–{timeOf(new Date(new Date(date).getTime() + 3600000).toISOString(), tz, true)} {tzAbbr(tz)}</h4>
      <FlipGrid games={games}>{games.map(game => <GameCard key={game.id} game={game} />)}</FlipGrid>
    </section>
  ))}</>;
}

/** Main board: Upcoming first, then In progress, with Completed collapsed below. */
export function GameBoard({
  board,
  sort = "time",
  onSort,
  status,
  filtered,
  onReset,
}: {
  board: Board;
  sort?: BoardSortKey;
  onSort?: (k: BoardSortKey) => void;
  status: FilterState["status"];
  filtered: boolean;
  onReset: () => void;
}) {
  fault("board");
  const optional = useOptionalData();
  const liveNow = useLiveMap();
  useEffect(() => observeScores(liveNow), [liveNow]);
  usePlusRanks(); // the "highest ranked" order needs the ranks, and re-sorts when they arrive
  const [showAll, setShowAll] = useState(false);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  // Viewing only completed games opens on the highest watch score; with everything showing, on the most insane (as before).
  const [chosen, setChosen] = useState<DoneSort | null>(null);
  const doneSort: DoneSort = chosen ?? (status === "final" ? "watch" : "insanity");
  const completedExpanded = status === "final" || showCompleted;
  // A touchdown is celebrated on the card where it is (a burst, the score flash, a small TD badge for a minute and a half): nothing moves for it.
  const { justFinal, finals, upcoming, counts, closing, live } = board;
  const inLive = (status === "all" || status === "live");
  const showClosing = inLive && closing.length > 0;
  const showLive = inLive && live.length > 0;
  const showFinal = (status === "all" || status === "final") && (counts.final > 0 || board.earlier.length > 0);
  const showUpcoming = (status === "all" || status === "upcoming") && upcoming.length > 0;
  // One sort control for the time-ordered lists: in the first of In progress / Upcoming that is on screen, and only when there is something to order.
  const sortHere: "live" | "upcoming" | null = !onSort || board.live.length + upcoming.length < 2 ? null : showLive ? "live" : showUpcoming ? "upcoming" : null;

  if (!showClosing && !showLive && !showFinal && !showUpcoming) {
    // Asking for completed games while past results are missing is not "no games": say so, and offer to try again.
    if (status === "final" && optional.results.status !== "ready") {
      return optional.results.status === "failed" ? (
        <StateNotice kind="failed" title="Past results are unavailable right now." actions={<button type="button" className="primary" onClick={() => void loadResults()}>Retry</button>}>
          Current games are still shown under All, Live and Upcoming.
        </StateNotice>
      ) : (
        <StateNotice kind="loading" title="Loading past results…" />
      );
    }
    const label = { all: "games", live: "games in progress", final: "completed games", upcoming: "upcoming games" }[status];
    return (
      <div className="empty-state">
        <h3>No {label} found.</h3>
        <p>
          {filtered
            ? "Try another team, channel, day or conference."
            : status === "live"
              ? "Nothing is being played right now. Check Upcoming for what's next."
              : status === "final"
                ? "Results appear here after games finish and the board refreshes."
                : "Nothing left to play on this board. Check Completed for how each game went."}
        </p>
        {(filtered || status !== "all") && <button onClick={onReset}>Clear filters</button>}
      </div>
    );
  }

  // Completed: archived finals grouped by week, newest week first, capped under "All".
  const limit = status === "all" && !showAll ? Math.max(0, COMPLETED_PREVIEW - justFinal.length) : Infinity;
  let used = 0;
  const hidden = status === "all" && !showAll && counts.final > COMPLETED_PREVIEW ? counts.final - COMPLETED_PREVIEW : 0;

  const weeksOf = (list: Result[]) => [...new Set([...list].sort((x, y) => y.date.localeCompare(x.date)).map((r) => r.week))];
  const renderWeeks = (list: Result[], capped: boolean) => weeksOf(list).map((w) => {
            // Within a week, the most insane game first (a game with no play data goes last), the later kickoff first when tied.
            const rs = list
              .filter((r) => r.week === w)
              .sort((a, b) => compareDone(doneSort, refOf(a), refOf(b)) || b.date.localeCompare(a.date));
            const shown = rs.slice(0, Math.max(0, (capped ? limit : Infinity) - used));
            if (capped) used += shown.length;
            const best = [...rs].sort((a, b) => b.delta - a.delta)[0];
            const wild = rs
              .map((r) => ({ r, i: insanity(r.wp, { final: true, overtime: r.final.overtime }) }))
              .filter((x) => x.i)
              .sort((a, b) => b.i!.score - a.i!.score)[0];
            if (!shown.length) return null;
            return (
              <section key={w} className="week-block" aria-label={`Results, ${w}`}>
                <div className="week-head">
                  <h4>{w}</h4>
                  <p>
                    {rs.length} final{rs.length === 1 ? "" : "s"} · forecast avg {avg(rs.map((r) => r.forecast.score))} · actual avg{" "}
                    {avg(rs.map((r) => r.actual.score))}
                  </p>
                  <details className="week-more">
                    <summary>Week highlights</summary>
                    <p>
                      {rs.some((r) => r.scoreCheck) && (
                        <>
                          Winners picked {rs.filter((r) => r.scoreCheck?.winnerRight).length} of {rs.filter((r) => r.scoreCheck).length} · margin off by{" "}
                          {(
                            rs.reduce((a, r) => a + Math.abs(r.scoreCheck?.marginMiss ?? 0), 0) /
                            (rs.filter((r) => r.scoreCheck).length || 1)
                          ).toFixed(1)}{" "}
                          on average
                        </>
                      )}
                      {wild && wild.i!.score >= 58 && (
                        <>
                          {" "}
                          · wildest: {wild.r.matchup} (insanity {wild.i!.score})
                        </>
                      )}
                      {best && best.delta > 4 && (
                        <>
                          {" "}
                          · biggest overachiever: {best.matchup} (+{best.delta})
                        </>
                      )}
                    </p>
                  </details>
                </div>
                <div className="game-grid">
                  {shown.map((r) => (
                    <ResultCard key={r.espnId} result={r} />
                  ))}
                </div>
              </section>
            );
          });

  return (
    <>
      {(status === "all" || status === "live") && <WatchNow games={[...board.closing, ...board.live, ...upcoming]} />}
      {showClosing && (
        <section className="board-section live closing" aria-label="Upset brewing">
          <div className="section-head">
            <h3>
              <span className="live-dot" aria-hidden="true" /> Upset brewing
            </h3>
            <span className="count">{board.closing.length}</span>
            <span className="section-note">An upset is brewing in the 4th quarter or overtime; the game closest to final is first.</span>
          </div>
          <FlipGrid games={closing}>{closing.map((game) => <GameCard key={game.id} game={game} />)}</FlipGrid>
        </section>
      )}

      {showLive && (
        <section className="board-section live" aria-label="In progress">
          <div className="section-head">
            <h3>
              <span className="live-dot" aria-hidden="true" /> In progress
            </h3>
            <span className="count">{board.live.length}</span>
            <span className="section-note">{SECTION_HELP.live}</span>
            {sortHere === "live" && <BoardSort value={sort} onChange={onSort!} />}
          </div>
          <KickoffSlots games={live} hot sort={sort} />
        </section>
      )}

      {showUpcoming && (
        <section className="board-section upcoming" aria-label="Upcoming">
          <div className="section-head">
            <h3>Upcoming</h3>
            <span className="count">{upcoming.length}</span>
            <span className="section-note">{SECTION_HELP.upcoming}</span>
            {sortHere === "upcoming" && <BoardSort value={sort} onChange={onSort!} />}
          </div>
          <LinesBar compact />
          <KickoffSlots games={upcoming} sort={sort} />
        </section>
      )}

      {showFinal && (
        <section className="board-section final" aria-label="Completed">
          <div className="section-head">
            <h3>Completed</h3>
            <span className="count">{counts.final}</span>
            <span className="section-note">{SECTION_HELP.final}</span>
            <DoneSortControl value={doneSort} onChange={setChosen} />
            {status !== "final" && (
              <button className="completed-toggle" aria-expanded={completedExpanded} aria-controls="completed-games" onClick={() => setShowCompleted(!showCompleted)}>
                {completedExpanded ? "Hide completed games" : "Show completed games"}
              </button>
            )}
          </div>
          <div id="completed-games" hidden={!completedExpanded}>
          {justFinal.length > 0 && (
            <div className="game-grid just-final" aria-label="Just finished">
              {justFinal.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          )}
          {renderWeeks(finals, true)}
          {board.earlier.length > 0 && (
            <div className="earlier-weeks">
              <button type="button" className="show-more" aria-expanded={earlierOpen} onClick={() => setEarlierOpen(!earlierOpen)}>
                {earlierOpen ? "Hide earlier weeks" : `Earlier weeks · ${board.earlier.length} finals`}
              </button>
              {earlierOpen && renderWeeks(board.earlier, false)}
            </div>
          )}
          {hidden > 0 && (
            <button className="show-more" onClick={() => setShowAll(true)}>
              Show all {counts.final} completed games ({hidden} more)
            </button>
          )}
          </div>
        </section>
      )}


    </>
  );
}
