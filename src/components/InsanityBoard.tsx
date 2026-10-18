import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { logos, results, slate, teamColor } from "../data";
import { NFL_CONFERENCES, inConference } from "../teamConf";
import { fetchData, refetchData } from "../data/load";
import { latestFlow, useLiveMap } from "../live";
import { rankGames, mostInsaneWeek, weekSummaries, sortGames, INSANITY_SORTS, type InsanitySort, type LedgerGame } from "../seasonRank";
import { provisionalActual } from "../provisionalScore";
import { compareDone, forecastScoreOf, registerLedger, registerProvisional, watchScoreOf } from "../completedSort";
import { PlusRank } from "./PlusRank";
import { usePlusRanks } from "../plusRanks";
import { INSANITY_TIERS, insanity, thinWp } from "../insanity";
import { useOpenGame, type GameStub } from "./GameCenterContext";
import { Headshot } from "./Headshot";

type Scope = "week" | "season";
type WeeksView = "weeks" | "games";
type WeekSort = "recent" | "insane";
const tierLabel = (id: string) => INSANITY_TIERS.find((t) => t.id === id)?.label ?? id;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const PAGE = 12;
/** How often the board refreshes while a game is on. */
export const LIVE_REFRESH_MS = 60_000;
const known = new Set([...slate.games.map((g) => g.espnId), ...results.map((r) => r.espnId)]);

export function facts(g: LedgerGame) {
  return [
    g.overtime ? "overtime" : null,
    g.flips ? plural(g.flips, "lead change") : "no lead changes",
    g.swing >= 15 ? `biggest swing ${g.swing} pts` : null,
    g.comebackFrom != null && g.comebackFrom <= 25 ? `winner was down to ${g.comebackFrom}%` : null,
    g.witchingPeriod && g.tier !== "calm" ? `witching hour ${g.witchingPeriod > 4 ? "in OT" : `Q${g.witchingPeriod}`}` : null,
  ].filter(Boolean);
}

/** A game not yet in the ledger: in progress (live) or just ended and waiting for the hourly rebuild to archive it (live false). */
type LiveLedgerGame = LedgerGame & { live: boolean; clock: string; watchEst?: number | null };
/** The ledger names its teams only in the matchup ("Ball State @ Bowling Green"); the ranks are looked up by that name for college. */
const teamsOf = (g: LedgerGame) => {
  const [a, h] = g.matchup.split(" @ ");
  return [{ ...g.away, name: a }, { ...g.home, name: h }];
};
const refOf = (g: LedgerGame) => ({ id: g.id, league: g.league, teams: teamsOf(g) });
const archived = new Set(results.map((r) => r.espnId));

/**
 * The games in progress, scored on the same scale as finished ones from their live win-probability line, and refreshed every 60
 * seconds while any game is on (together with the season ledger, so a game that has just ended moves to its final score).
 * Returns nothing when no game is live, and then nothing polls.
 */
function useLiveInsanity(onLedger: (games: LedgerGame[]) => void, have: Set<string> | null) {
  const live = useLiveMap();
  // The scores keep arriving through the shared live feed while the timer below runs, so each rescoring reads the latest ones.
  const liveRef = useRef(live);
  liveRef.current = live;
  const [scored, setScored] = useState<LiveLedgerGame[]>([]);
  const onGoing = useMemo(() => slate.games.filter((g) => g.espnId && live[g.espnId]?.state === "in"), [live]);
  // Games that ended since the last rebuild are not in the ledger yet: they are scored from their final win-probability line.
  const justEnded = useMemo(
    () => (have ? slate.games.filter((g) => g.espnId && live[g.espnId]?.state === "post" && !have.has(g.espnId) && !archived.has(g.espnId)) : []),
    [live, have],
  );
  const tracked = useMemo(() => [...onGoing, ...justEnded], [onGoing, justEnded]);
  const key = tracked.map((g) => `${g.espnId}:${live[g.espnId]?.state}`).join(",");
  useEffect(() => {
    if (!tracked.length) {
      setScored([]);
      return;
    }
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async (first: boolean) => {
      const rows = await Promise.all(
        tracked.map(async (g): Promise<LiveLedgerGame | null> => {
          const l = liveRef.current[g.espnId] ?? live[g.espnId]!;
          const inPlay = l.state === "in";
          const wp = await latestFlow(g.league as "NFL" | "CFB", g.espnId, first || !inPlay ? 45_000 : LIVE_REFRESH_MS - 5_000);
          const over = /ot/i.test(l.detail);
          const r = wp ? insanity(thinWp(wp), { final: !inPlay, overtime: over }) : null;
          if (!r) return null;
          // A game that has ended gets the watch score the refresh will give it, estimated from the same line until it is archived.
          const est = !inPlay ? provisionalActual(g.espnId, { away: l.away, home: l.home }, wp, over) : null;
          if (est) registerProvisional(g.espnId, est.score);
          const [a, h] = g.teams as unknown as { abbr?: string; name: string; logoId: string; color?: string | null }[];
          return {
            id: g.espnId,
            league: g.league as "NFL" | "CFB",
            week: slate.period,
            date: (g as { date?: string }).date ?? "",
            matchup: g.matchup,
            away: { abbr: a.abbr ?? a.name, logoId: a.logoId, score: l.away, color: a.color },
            home: { abbr: h.abbr ?? h.name, logoId: h.logoId, score: l.home, color: h.color },
            insanity: r.score,
            tier: r.tier.id as LedgerGame["tier"],
            flips: r.flips,
            swing: r.biggestSwing,
            comebackFrom: r.comebackFrom,
            overtime: over,
            witchingPeriod: r.witching.period,
            mvp: null,
            live: inPlay,
            clock: l.detail,
            watchEst: est?.score ?? null,
          };
        }),
      );
      if (stop) return;
      setScored(rows.filter((x): x is LiveLedgerGame => x != null));
      if (!first || !onGoing.length) {
        // The hourly rebuild may have archived a game that just ended.
        const m = await refetchData<{ games: LedgerGame[] }>("season").catch(() => null);
        if (m && !stop) onLedger(m.games);
      }
      if (!stop && onGoing.length) timer = setTimeout(() => run(false), LIVE_REFRESH_MS);
    };
    void run(true);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { scored, anyLive: onGoing.length > 0 };
}

/**
 * Insanity rankings from the season ledger (src/data/season.json): the wildest
 * games of a week or of the whole season, and which week was the most insane.
 * NFL and college are ranked separately.
 */
export function InsanityBoard({ defaultLeague }: { defaultLeague: "NFL" | "CFB" }) {
  const [ledger, setLedger] = useState<LedgerGame[] | null>(null);
  const [league, setLeague] = useState(defaultLeague);
  const [scope, setScope] = useState<Scope>("week");
  const [pick, setPick] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const plus = usePlusRanks(); // the ranked order needs the ranks, and re-sorts when they arrive
  const [sort, setSort] = useState<InsanitySort>("insanity");
  const [conf, setConf] = useState("all-fbs");
  const [weeksView, setWeeksView] = useState<WeeksView>("weeks");
  const [weekSort, setWeekSort] = useState<WeekSort>("recent");
  const [shownAll, setShownAll] = useState(25);
  const openGame = useOpenGame();

  useEffect(() => {
    let live = true;
    fetchData<{ games: LedgerGame[] }>("season").then((m) => live && setLedger(m.games));
    return () => {
      live = false;
    };
  }, []);

  const haveIds = useMemo(() => (ledger ? new Set(ledger.map((g) => g.id)) : null), [ledger]);
  const { scored, anyLive } = useLiveInsanity((games) => setLedger(games), haveIds);
  const liveMap = useLiveMap();
  // Games in progress join their week's list (and the season's) on the same scale, until they are archived as finals.
  const mine = useMemo(() => {
    const done = (ledger ?? []).filter((g) => g.league === league);
    const have = new Set(done.map((g) => g.id));
    // The score and clock follow the live feed as it updates; the insanity itself is rescored every 60 seconds.
    const now = scored
      .filter((g) => g.league === league && !have.has(g.id))
      .map((g) => {
        const l = liveMap[g.id];
        return l ? { ...g, away: { ...g.away, score: l.away }, home: { ...g.home, score: l.home }, clock: l.detail } : g;
      });
    return [...done, ...now].filter((g) => inConference(league, conf, [g.away.logoId, g.home.logoId])) as LedgerGame[];
  }, [ledger, league, scored, liveMap, conf]);
  const weeks = useMemo(() => weekSummaries(mine), [mine]);
  // The weeks as listed under the ranking: newest first, or the most insane week (highest average) first.
  const weekRows = useMemo(() => (weekSort === "insane" ? [...weeks].sort((a, b) => b.avg - a.avg || b.wild - a.wild || b.start.localeCompare(a.start)) : weeks), [weeks, weekSort]);
  // Every game of the season, wildest first, for the all-games view.
  const seasonAll = useMemo(() => rankGames(mine), [mine]);
  const best = useMemo(() => mostInsaneWeek(weeks), [weeks]);
  const week = weeks.find((w) => w.week === pick)?.week ?? weeks[0]?.week ?? "";
  const pool = useMemo(() => (scope === "season" ? mine : mine.filter((g) => g.week === week)), [mine, scope, week]);
  // Each game keeps its insanity rank (#1 is the wildest) whatever order the list is shown in.
  const rankOf = useMemo(() => new Map(rankGames(pool).map((g, i) => [g.id, i + 1])), [pool]);
  const list = useMemo(() => (registerLedger(pool), sort === "watch" || sort === "rank" ? rankGames(pool).sort((a, b) => compareDone(sort, refOf(a), refOf(b))) : sortGames(pool, sort)), [pool, sort, plus]);
  const isLiveRow = (g: LedgerGame) => (g as Partial<LiveLedgerGame>).live === true;
  const liveRows = list.filter(isLiveRow);
  const isFreshRow = (g: LedgerGame) => (g as Partial<LiveLedgerGame>).live === false;
  // Games that just ended and wait for the hourly rebuild stay in the list, in the chosen order, marked FINAL.
  const finished = list.filter((g) => !isLiveRow(g));
  const avg = list.length ? Math.round(list.reduce((a, g) => a + g.insanity, 0) / list.length) : 0;
  const wild = list.filter((g) => g.tier === "unhinged" || g.tier === "witching").length;
  const nameOf = league === "NFL" ? "NFL" : "College";

  const choose = (patch: { league?: "NFL" | "CFB"; scope?: Scope; week?: string | null }) => {
    if (patch.league) {
      setLeague(patch.league);
      setConf("all-fbs");
    }
    if (patch.scope) setScope(patch.scope);
    if (patch.week !== undefined) setPick(patch.week);
    setShown(PAGE);
  };

  return (
    <section className="ib" aria-label="Insanity rankings">
      <div className="tv-toolbar">
        <div className="segmented" role="group" aria-label="League">
          {(["NFL", "CFB"] as const).map((l) => (
            <button key={l} aria-pressed={league === l} onClick={() => choose({ league: l, week: null })}>
              {l === "NFL" ? "NFL" : "College"}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Ranking">
          <button aria-pressed={scope === "week"} onClick={() => choose({ scope: "week" })}>
            Week
          </button>
          <button aria-pressed={scope === "season"} onClick={() => choose({ scope: "season" })}>
            Season
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Sort games by">
          {INSANITY_SORTS.map((o) => (
            <button key={o.id} aria-pressed={sort === o.id} aria-label={o.label} onClick={() => { setSort(o.id); setShown(PAGE); }}>
              <span className="sort-long">{o.label}</span>
              <span className="sort-short">{o.short ?? o.label}</span>
            </button>
          ))}
        </div>
        <label className="tv-conf">
          <span className="sr-only">Conference</span>
          <select value={conf} onChange={(e) => { setConf(e.target.value); setPick(null); setShown(PAGE); setShownAll(25); }} aria-label="Conference">
            {(league === "NFL" ? NFL_CONFERENCES : slate.conferences).map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === "all-fbs" ? (league === "NFL" ? "Both conferences" : "All conferences") : c.label}
              </option>
            ))}
          </select>
        </label>
        {scope === "week" && weeks.length > 0 && (
          <label className="tv-conf">
            <span className="sr-only">Week</span>
            <select value={week} onChange={(e) => choose({ week: e.target.value })} aria-label="Week">
              {weeks.map((w) => (
                <option key={w.week} value={w.week}>
                  {w.week}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="board-heading tv-heading">
        <h2>
          {nameOf} · {scope === "season" ? "season ranking" : week || "week"}
        </h2>
        <span role="status">
          {ledger == null
            ? "Loading…"
            : `${plural(list.length, "game")} · average ${avg} · ${wild} unhinged or worse${anyLive ? " · live games refresh every 60 seconds" : ""}`}
        </span>
        <span className="sort-label">{INSANITY_SORTS.find((o) => o.id === sort)?.note}</span>
      </div>

      {ledger != null && list.length === 0 ? (
        <div className="empty-state">
          <h3>No finished {nameOf} games tracked yet.</h3>
          <p>Games are ranked once they finish and the board refreshes.</p>
        </div>
      ) : (
        <>
        {liveRows.length > 0 && (
          <>
            <h3 className="micro-label ib-live-head">Live now · rescored every 60 seconds</h3>
            <ol className="ib-cards ib-live-cards">
              {liveRows.map((g) => (
                <InsanityCard key={g.id} g={g} rank={rankOf.get(g.id) ?? 0} live={(g as LiveLedgerGame).clock} showWeek={scope === "season"} onOpen={() => (known.has(g.id) ? openGame(g.id) : openGame(g.id, stubOf(g)))} />
              ))}
            </ol>
          </>
        )}
        <ol className="ib-cards">
          {finished.slice(0, shown).map((g, i) => (
            <InsanityCard key={g.id} g={g} rank={rankOf.get(g.id) ?? i + 1} fresh={isFreshRow(g)} showWeek={scope === "season"} onOpen={() => (known.has(g.id) ? openGame(g.id) : openGame(g.id, stubOf(g)))} />
          ))}
        </ol>
        </>
      )}
      {finished.length > shown && (
        <button className="ib-more" onClick={() => setShown((n) => n + 25)}>
          Show more ({finished.length - shown} left)
        </button>
      )}

      {weeks.length > 0 && (
        <section className="ib-weeks" aria-label="Week by week">
          <div className="ibw-head">
            <h3 className="micro-label">
              {weeksView === "games"
                ? `Every game this season · ${plural(seasonAll.length, "game")}, highest to lowest`
                : `Week by week${best && weeks.length > 1 ? " · most insane week marked" : ""}`}
            </h3>
            <div className="segmented" role="group" aria-label="Season view">
              <button aria-pressed={weeksView === "weeks"} onClick={() => setWeeksView("weeks")}>By week</button>
              <button aria-pressed={weeksView === "games"} onClick={() => setWeeksView("games")}>All games</button>
            </div>
            {weeksView === "weeks" && (
              <div className="segmented" role="group" aria-label="Order weeks by">
                <button aria-pressed={weekSort === "recent"} onClick={() => setWeekSort("recent")}>Newest</button>
                <button aria-pressed={weekSort === "insane"} onClick={() => setWeekSort("insane")}>Most insane</button>
              </div>
            )}
          </div>
          {weeksView === "games" ? (
            <>
              <ol className="ibs-list" aria-label="All games this season, highest insanity first">
                {seasonAll.slice(0, shownAll).map((g, i) => (
                  <SeasonRow key={g.id} g={g} rank={i + 1} onOpen={() => (known.has(g.id) ? openGame(g.id) : openGame(g.id, stubOf(g)))} />
                ))}
              </ol>
              {seasonAll.length > shownAll && (
                <button className="ib-more" onClick={() => setShownAll((n) => n + 50)}>
                  Show more ({seasonAll.length - shownAll} left)
                </button>
              )}
            </>
          ) : (
            <ul>
              {weekRows.map((w, i) => (
                <li key={w.week} className={w === best && weeks.length > 1 ? "best" : undefined}>
                  <button onClick={() => choose({ scope: "week", week: w.week })} aria-pressed={scope === "week" && w.week === week}>
                    <span className="ibw-name">
                      {weekSort === "insane" && <b className="ibw-rank">#{i + 1}</b>}
                      {w.week}
                      {w === best && weeks.length > 1 && <em>Most insane week</em>}
                    </span>
                    <span className="ibw-bar" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, w.avg)}%` }} />
                    </span>
                    <span className="ibw-avg">avg {w.avg}</span>
                    <span className="ibw-top">
                      wildest: {w.top.matchup} ({w.top.insanity}) · {plural(w.games, "game")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}

/** Enough about an older game for the Game Center to open it (it loads the rest live). */
function stubOf(g: LedgerGame): GameStub {
  const [an, hn] = g.matchup.split(" @ ");
  return {
    league: g.league,
    date: g.date,
    matchup: g.matchup,
    teams: [
      { name: an ?? g.away.abbr, abbr: g.away.abbr, logoId: g.away.logoId, color: g.away.color, score: g.away.score },
      { name: hn ?? g.home.abbr, abbr: g.home.abbr, logoId: g.home.logoId, color: g.home.color, score: g.home.score },
    ],
  };
}

/** One game in the season-long list: its place, week, the teams and score, and the insanity. */
function SeasonRow({ g, rank, onOpen }: { g: LedgerGame; rank: number; onOpen: () => void }) {
  return (
    <li className={`ibs ${g.tier}`} data-insanity={g.insanity}>
      <button type="button" onClick={onOpen} aria-label={`Number ${rank}: ${g.matchup}, insanity ${g.insanity}. Open Game Center`}>
        <b className="ibs-rank">#{rank}</b>
        <span className="ibs-teams">
          {[g.away, g.home].map((t, k) => (
            <span key={k} className={`ibs-team${(k === 0 ? g.away.score > g.home.score : g.home.score > g.away.score) ? " won" : ""}`}>
              {logos[t.logoId] ? <img src={logos[t.logoId]} alt="" width="20" height="20" loading="lazy" decoding="async" /> : <i className="ic-nologo" />}
              {t.abbr} <em>{t.score}</em>
            </span>
          ))}
          {g.overtime && <span className="ibs-ot">OT</span>}
        </span>
        <span className="ibs-week">{g.week}</span>
        <span className="ibs-ins" title={`Insanity ${g.insanity}, ${tierLabel(g.tier)}`}>
          <i style={{ width: `${Math.min(100, g.insanity)}%` }} />
          <strong>{g.insanity}</strong> <small>{tierLabel(g.tier)}</small>
        </span>
      </button>
    </li>
  );
}

const qName = (p: number | null) => (p == null ? "" : p > 4 ? "overtime" : `the ${["", "1st", "2nd", "3rd", "4th"][p]} quarter`);

/** One or two plain sentences on why the game was (or wasn't) insane. */
export function insanityStory(g: LedgerGame) {
  const aw = g.away.score > g.home.score;
  const tie = g.away.score === g.home.score;
  const winner = tie ? null : aw ? g.away.abbr : g.home.abbr;
  const loser = tie ? null : aw ? g.home.abbr : g.away.abbr;
  const margin = Math.abs(g.away.score - g.home.score);
  const flips = g.flips ? plural(g.flips, "lead change") : "no lead changes";
  const came = g.comebackFrom != null && g.comebackFrom <= 25 ? ` after falling to a ${g.comebackFrom}% chance` : "";
  const when = g.witchingPeriod ? `, and the craziest stretch came in ${qName(g.witchingPeriod)}` : "";
  switch (g.tier) {
    case "witching":
    case "unhinged":
      return `${g.tier === "witching" ? "Pure chaos" : "Wild to the end"}: ${flips} and a ${g.swing}-point swing in win probability${when}. ${
        winner ? `${winner} won by ${margin}${came}${g.overtime ? " in overtime" : ""}.` : "It ended level."
      }`;
    case "wild":
      return `Plenty of life: ${flips} and a ${g.swing}-point win-probability swing${when}. ${
        winner ? `${winner} ${margin <= 8 ? "held on" : "pulled away"} to win by ${margin}${came}.` : ""
      }`.trim();
    case "restless":
      return `Some tension, never true chaos: ${flips}, biggest swing ${g.swing} points. ${
        winner ? `${winner} won by ${margin}${margin >= 14 ? ` and ${loser} never really threatened late` : ""}.` : ""
      }`.trim();
    default:
      return `Why it was flat: ${g.flips ? flips : `${winner ?? "one side"} never trailed`}, and win probability barely moved (biggest swing ${g.swing} points). ${
        winner ? `${winner} won by ${margin}.` : ""
      }`.trim();
  }
}

function InsanityCard({ g, rank, showWeek, onOpen, live, fresh }: { g: LedgerGame; rank: number; showWeek: boolean; onOpen: (() => void) | null; live?: string | null; fresh?: boolean }) {
  const ca = teamColor(g.away.color ?? null) ?? "#1d2a35";
  const ch = teamColor(g.home.color ?? null) ?? "#1d2a35";
  const mvpTeam = g.mvp?.side === "away" ? g.away : g.mvp?.side === "home" ? g.home : null;
  const body = (
    <>
      <div className="ic-top">
        <span className="ic-rank">#{rank}</span>
        <span className="ic-ins" title="Insanity score: how wild the game was, from its win-probability line">
          <small className="ic-ins-label">Insanity</small> <strong>{g.insanity}</strong> {tierLabel(g.tier)}
        </span>
        <span className="ic-watch margin" title="Final score margin">Margin <strong>{Math.abs(g.away.score - g.home.score)}</strong></span>
        {forecastScoreOf(g.id) != null && <span className="ic-watch" title="Watch score forecast before kickoff (team quality, competitiveness, stakes)">Forecast <strong>{forecastScoreOf(g.id)}</strong></span>}
        {watchScoreOf(g.id) == null && (g as Partial<LiveLedgerGame>).watchEst != null && (
          <span className="ic-watch real est" title="Estimated watch score: calculated here from the final score and win-probability line until the refresh archives the game and replaces it with the official one">
            Watch <strong>~{(g as LiveLedgerGame).watchEst}</strong> <small>est.</small>
          </span>
        )}
        {watchScoreOf(g.id) != null && <span className="ic-watch real" title="Watch score realized: re-scored from how the game was actually played">Watch <strong>{watchScoreOf(g.id)}</strong></span>}
        {live != null && <span className="ic-live" title="In progress: scored from the live win-probability line">LIVE{live ? ` · ${live}` : ""}</span>}
        {fresh && <span className="ic-fresh" title="Just ended: scored from the game's win-probability line until the hourly rebuild archives it">FINAL</span>}
        {showWeek && <span className="ic-week">{g.week}</span>}
      </div>
      <div className="ic-teams">
        {[g.away, null, g.home].map((t, k) => {
          if (!t)
            return (
              <span key="sep" className="ic-sep" aria-hidden="true">
                {g.overtime ? "OT" : "–"}
              </span>
            );
          k = k ? 1 : 0;
          const won = k === 0 ? g.away.score > g.home.score : g.home.score > g.away.score;
          return (
            <span key={k} className={`ic-team ${k ? "home" : "away"}${won ? " won" : ""}`}>
              {logos[t.logoId] ? <img src={logos[t.logoId]} alt="" width="40" height="40" loading="lazy" decoding="async" /> : <i className="ic-nologo" />}
              <span className="ic-abbr"><PlusRank league={g.league} team={teamsOf(g)[k]} />{t.abbr}</span>
              <b>{t.score}</b>
            </span>
          );
        })}
      </div>
      <p className="ic-story">{insanityStory(g)}</p>
      {g.mvp && (
        <div className="ic-mvp">
          <Headshot src={g.mvp.headshot} name={g.mvp.name} size={34} className="ic-head" />
          <span>
            <span className="ic-mvp-label">MVP</span>
            <strong>{g.mvp.short}</strong>
            {g.mvp.pos && <span className="ic-pos">{g.mvp.pos}</span>}
            {mvpTeam && logos[mvpTeam.logoId] && <img className="ic-mvp-logo" src={logos[mvpTeam.logoId]} alt={mvpTeam.abbr} width="16" height="16" />}
            <small>{g.mvp.line}</small>
          </span>
        </div>
      )}
      {onOpen && (
        <span className="ic-more" aria-hidden="true">
          Game Center ↗
        </span>
      )}
    </>
  );
  const style = { "--away": ca, "--home": ch } as CSSProperties;
  return (
    <li className={`ic ${g.tier}${live != null ? " is-live" : ""}`} style={style} data-insanity={g.insanity} data-date={g.date} data-margin={Math.abs(g.away.score - g.home.score)}>
      {onOpen ? (
        <button type="button" className="ic-inner" onClick={onOpen} aria-label={`${g.matchup}, insanity ${g.insanity}. Open Game Center`}>
          {body}
        </button>
      ) : (
        <div className="ic-inner">{body}</div>
      )}
    </li>
  );
}
