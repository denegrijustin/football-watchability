import { useEffect, useRef, useState, type ReactNode } from "react";
import { filterGames, filterResults, results, type FilterState, type Result } from "../data";
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
import { useFlip } from "../motion";
import { liveHeat } from "../watchNow";
import { observeScores, useTouchdowns } from "../touchdown";

type Game = ReturnType<typeof filterGames>[number];
const refOf = (r: Result) => ({ id: r.espnId, league: r.league, teams: r.teams });
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / (xs.length || 1));
const archived = new Set(results.map((r) => r.espnId));
/** Completed games shown under "All" before a "Show all" button, so Upcoming isn't buried. */
const COMPLETED_PREVIEW = 12;

export type Board = {
  /** Kicked off and not final yet. */
  live: Game[];
  /** Live games with an upset brewing in the 4th quarter or overtime, closest to final first (they are not in `live`). */
  closing: Game[];
  /** Finished on the feed but not archived yet: "just finished". */
  justFinal: Game[];
  /** Archived finals, filtered. */
  finals: Result[];
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
  const games = filterGames(filters).filter((g) => !archived.has(g.espnId));
  const by = (s: "live" | "final" | "upcoming") =>
    games.filter((g) => gameStatus((g as { date?: string }).date ?? "", map[g.espnId], now) === s);
  const closingMap = useClosingUpsets();
  const allLive = by("live");
  const closing = allLive.filter((g) => closingMap.has(g.espnId)).sort((a, b) => closingMap.get(a.espnId)! - closingMap.get(b.espnId)!);
  const live = allLive.filter((g) => !closingMap.has(g.espnId));
  const justFinal = by("final").sort((a, b) => ((b as { date?: string }).date ?? "").localeCompare((a as { date?: string }).date ?? ""));
  const upcoming = by("upcoming");
  const finals = filterResults(filters);
  const done = justFinal.length + finals.length;
  return {
    live,
    closing,
    justFinal,
    finals,
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

function KickoffSlots({ games, hot = false }: { games: Game[]; hot?: boolean }) {
  const tz = useTz();
  const map = useLiveMap();
  const heat = (g: Game) => (hot ? liveHeat(g.score, map[g.espnId]) : g.score);
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
  status,
  filtered,
  onReset,
}: {
  board: Board;
  status: FilterState["status"];
  filtered: boolean;
  onReset: () => void;
}) {
  const liveNow = useLiveMap();
  useEffect(() => observeScores(liveNow), [liveNow]);
  const scored = useTouchdowns();
  usePlusRanks(); // the "highest ranked" order needs the ranks, and re-sorts when they arrive
  const [showAll, setShowAll] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  // Viewing only completed games opens on the highest watch score; with everything showing, on the most insane (as before).
  const [chosen, setChosen] = useState<DoneSort | null>(null);
  const doneSort: DoneSort = chosen ?? (status === "final" ? "watch" : "insanity");
  const completedExpanded = status === "final" || showCompleted;
  // A game that just scored a touchdown moves to the top of the board for a minute and a half, whichever section it was in.
  const hot = new Map(scored.map((t) => [t.id, t.at]));
  const byRecent = (a: Game, b: Game) => (hot.get(b.espnId) ?? 0) - (hot.get(a.espnId) ?? 0);
  const pinned = [...board.closing, ...board.live].filter((g) => hot.has(g.espnId)).sort(byRecent);
  const unpinned = (gs: Game[]) => gs.filter((g) => !hot.has(g.espnId));
  const { justFinal, finals, upcoming, counts } = board;
  const closing = unpinned(board.closing), live = unpinned(board.live);
  // The game that just scored is the first card of the board (top left), in whichever section the board starts with; it does not get a section of its own.
  const inLive = (status === "all" || status === "live");
  const showClosing = inLive && (closing.length > 0 || (pinned.length > 0 && board.closing.length > 0));
  const showLive = inLive && board.live.length > 0 && (live.length > 0 || (pinned.length > 0 && !showClosing));
  const leadsClosing = showClosing, leadsLive = !showClosing && showLive;
  const showFinal = (status === "all" || status === "final") && counts.final > 0;
  const showUpcoming = (status === "all" || status === "upcoming") && upcoming.length > 0;

  if (!showClosing && !showLive && !showFinal && !showUpcoming) {
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
  const weeks = [...new Set([...finals].sort((a, b) => b.date.localeCompare(a.date)).map((r) => r.week))];
  const limit = status === "all" && !showAll ? Math.max(0, COMPLETED_PREVIEW - justFinal.length) : Infinity;
  let used = 0;
  const hidden = status === "all" && !showAll && counts.final > COMPLETED_PREVIEW ? counts.final - COMPLETED_PREVIEW : 0;

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
          <FlipGrid games={leadsClosing ? [...pinned, ...closing] : closing}>{(leadsClosing ? [...pinned, ...closing] : closing).map((game) => <GameCard key={game.id} game={game} />)}</FlipGrid>
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
          </div>
          {leadsLive && pinned.length > 0 && <FlipGrid games={pinned} className="game-grid td-lead">{pinned.map((game) => <GameCard key={game.id} game={game} />)}</FlipGrid>}
          <KickoffSlots games={live} hot />
        </section>
      )}

      {showUpcoming && (
        <section className="board-section upcoming" aria-label="Upcoming">
          <div className="section-head">
            <h3>Upcoming</h3>
            <span className="count">{upcoming.length}</span>
            <span className="section-note">{SECTION_HELP.upcoming}</span>
          </div>
          <LinesBar compact />
          <KickoffSlots games={upcoming} />
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
          {weeks.map((w) => {
            // Within a week, the most insane game first (a game with no play data goes last), the later kickoff first when tied.
            const rs = finals
              .filter((r) => r.week === w)
              .sort((a, b) => compareDone(doneSort, refOf(a), refOf(b)) || b.date.localeCompare(a.date));
            const shown = rs.slice(0, Math.max(0, limit - used));
            used += shown.length;
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
          })}
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
