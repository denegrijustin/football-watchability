import { useState } from "react";
import { filterGames, filterResults, results, type FilterState, type Result } from "../data";
import { gameStatus, useLiveMap, useNow } from "../live";
import { timeOf, tzAbbr, useTz } from "../tz";
import { insanity } from "../insanity";
import type { StatusCounts } from "./Filters";
import { GameCard } from "./GameCard";
import { ResultCard } from "./ResultCard";

type Game = ReturnType<typeof filterGames>[number];
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / (xs.length || 1));
const archived = new Set(results.map((r) => r.espnId));
/** Completed games shown under "All" before a "Show all" button, so Upcoming isn't buried. */
const COMPLETED_PREVIEW = 12;

export type Board = {
  /** Kicked off and not final yet. */
  live: Game[];
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
  const live = by("live");
  const justFinal = by("final").sort((a, b) => ((b as { date?: string }).date ?? "").localeCompare((a as { date?: string }).date ?? ""));
  const upcoming = by("upcoming");
  const finals = filterResults(filters);
  const done = justFinal.length + finals.length;
  return {
    live,
    justFinal,
    finals,
    upcoming,
    counts: { all: live.length + done + upcoming.length, live: live.length, final: done, upcoming: upcoming.length },
  };
}

const SECTION_HELP = {
  live: "Kicked off and not final yet, kickoff slots in time order, best watchability first in each slot.",
  final: "Finished games with forecast vs actual, newest week first.",
  upcoming: "Still to play, kickoff slots in time order, best watchability first in each slot.",
};

function KickoffSlots({ games }: { games: Game[] }) {
  const tz = useTz();
  const slots = new Map<string, Game[]>();
  for (const game of [...games].sort((a, b) => a.date.localeCompare(b.date))) {
    const kickoff = new Date(game.date);
    kickoff.setUTCMinutes(0, 0, 0);
    const date = kickoff.toISOString();
    const group = slots.get(date) ?? [];
    group.push(game);
    group.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    slots.set(date, group);
  }
  return <>{[...slots].map(([date, games]) => (
    <section className="kickoff-slot" key={date} data-kickoff={date} aria-label={`Kickoff ${date}`}>
      <h4>{new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: tz })} · {timeOf(date, tz, true)}–{timeOf(new Date(new Date(date).getTime() + 3600000).toISOString(), tz, true)} {tzAbbr(tz)}</h4>
      <div className="game-grid">{games.map(game => <GameCard key={game.id} game={game} />)}</div>
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
  const [showAll, setShowAll] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const completedExpanded = status === "final" || showCompleted;
  const { live, justFinal, finals, upcoming, counts } = board;
  const showLive = (status === "all" || status === "live") && live.length > 0;
  const showFinal = (status === "all" || status === "final") && counts.final > 0;
  const showUpcoming = (status === "all" || status === "upcoming") && upcoming.length > 0;

  if (!showLive && !showFinal && !showUpcoming) {
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
      {showUpcoming && (
        <section className="board-section upcoming" aria-label="Upcoming">
          <div className="section-head">
            <h3>Upcoming</h3>
            <span className="count">{upcoming.length}</span>
            <span className="section-note">{SECTION_HELP.upcoming}</span>
          </div>
          <KickoffSlots games={upcoming} />
        </section>
      )}

      {showLive && (
        <section className="board-section live" aria-label="In progress">
          <div className="section-head">
            <h3>
              <span className="live-dot" aria-hidden="true" /> In progress
            </h3>
            <span className="count">{live.length}</span>
            <span className="section-note">{SECTION_HELP.live}</span>
          </div>
          <KickoffSlots games={live} />
        </section>
      )}

      {showFinal && (
        <section className="board-section final" aria-label="Completed">
          <div className="section-head">
            <h3>Completed</h3>
            <span className="count">{counts.final}</span>
            <span className="section-note">{SECTION_HELP.final}</span>
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
            const rs = finals.filter((r) => r.week === w);
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
