import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { logos, results, slate, teamColor } from "../data";
import { fetchData, refetchData } from "../data/load";
import { latestFlow, useLiveMap } from "../live";
import { rankGames, mostInsaneWeek, weekSummaries, sortGames, INSANITY_SORTS, type InsanitySort, type LedgerGame } from "../seasonRank";
import { INSANITY_TIERS, insanity, insanityTier, thinWp } from "../insanity";
import { useOpenGame, type GameStub } from "./GameCenterContext";
import { Headshot } from "./Headshot";

type Scope = "week" | "season";
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

type LiveLedgerGame = LedgerGame & { live: true; clock: string };

/**
 * The games in progress, scored on the same scale as finished ones from their live win-probability line, and refreshed every 60
 * seconds while any game is on (together with the season ledger, so a game that has just ended moves to its final score).
 * Returns nothing when no game is live, and then nothing polls.
 */
function useLiveInsanity(onLedger: (games: LedgerGame[]) => void) {
  const live = useLiveMap();
  // The scores keep arriving through the shared live feed while the timer below runs, so each rescoring reads the latest ones.
  const liveRef = useRef(live);
  liveRef.current = live;
  const [scored, setScored] = useState<LiveLedgerGame[]>([]);
  const onGoing = useMemo(() => slate.games.filter((g) => g.espnId && live[g.espnId]?.state === "in"), [live]);
  const key = onGoing.map((g) => g.espnId).join(",");
  useEffect(() => {
    if (!onGoing.length) {
      setScored([]);
      return;
    }
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async (first: boolean) => {
      const rows = await Promise.all(
        onGoing.map(async (g): Promise<LiveLedgerGame | null> => {
          const l = liveRef.current[g.espnId] ?? live[g.espnId]!;
          const wp = await latestFlow(g.league as "NFL" | "CFB", g.espnId, first ? 45_000 : LIVE_REFRESH_MS - 5_000);
          const r = wp ? insanity(thinWp(wp), { final: false }) : null;
          if (!r) return null;
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
            comebackFrom: null,
            overtime: /ot/i.test(l.detail),
            witchingPeriod: r.witching.period,
            mvp: null,
            live: true as const,
            clock: l.detail,
          };
        }),
      );
      if (stop) return;
      setScored(rows.filter((x): x is LiveLedgerGame => x != null));
      if (!first) {
        // The hourly rebuild may have archived a game that just ended.
        const m = await refetchData<{ games: LedgerGame[] }>("season").catch(() => null);
        if (m && !stop) onLedger(m.games);
      }
      if (!stop) timer = setTimeout(() => run(false), LIVE_REFRESH_MS);
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
  const [sort, setSort] = useState<InsanitySort>("insanity");
  const openGame = useOpenGame();

  useEffect(() => {
    let live = true;
    fetchData<{ games: LedgerGame[] }>("season").then((m) => live && setLedger(m.games));
    return () => {
      live = false;
    };
  }, []);

  const { scored, anyLive } = useLiveInsanity((games) => setLedger(games));
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
    return [...done, ...now] as LedgerGame[];
  }, [ledger, league, scored, liveMap]);
  const weeks = useMemo(() => weekSummaries(mine), [mine]);
  const best = useMemo(() => mostInsaneWeek(weeks), [weeks]);
  const week = weeks.find((w) => w.week === pick)?.week ?? weeks[0]?.week ?? "";
  const pool = useMemo(() => (scope === "season" ? mine : mine.filter((g) => g.week === week)), [mine, scope, week]);
  // Each game keeps its insanity rank (#1 is the wildest) whatever order the list is shown in.
  const rankOf = useMemo(() => new Map(rankGames(pool).map((g, i) => [g.id, i + 1])), [pool]);
  const list = useMemo(() => sortGames(pool, sort), [pool, sort]);
  const isLiveRow = (g: LedgerGame) => !!(g as Partial<LiveLedgerGame>).live;
  const liveRows = list.filter(isLiveRow);
  const finished = list.filter((g) => !isLiveRow(g));
  const avg = list.length ? Math.round(list.reduce((a, g) => a + g.insanity, 0) / list.length) : 0;
  const wild = list.filter((g) => g.tier === "unhinged" || g.tier === "witching").length;
  const nameOf = league === "NFL" ? "NFL" : "College";

  const choose = (patch: { league?: "NFL" | "CFB"; scope?: Scope; week?: string | null }) => {
    if (patch.league) setLeague(patch.league);
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
            <button key={o.id} aria-pressed={sort === o.id} onClick={() => { setSort(o.id); setShown(PAGE); }}>
              {o.label}
            </button>
          ))}
        </div>
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
            <InsanityCard key={g.id} g={g} rank={rankOf.get(g.id) ?? i + 1} showWeek={scope === "season"} onOpen={() => (known.has(g.id) ? openGame(g.id) : openGame(g.id, stubOf(g)))} />
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
          <h3 className="micro-label">Week by week{best && weeks.length > 1 ? " · most insane week marked" : ""}</h3>
          <ul>
            {weeks.map((w) => (
              <li key={w.week} className={w === best && weeks.length > 1 ? "best" : undefined}>
                <button onClick={() => choose({ scope: "week", week: w.week })} aria-pressed={scope === "week" && w.week === week}>
                  <span className="ibw-name">
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

function InsanityCard({ g, rank, showWeek, onOpen, live }: { g: LedgerGame; rank: number; showWeek: boolean; onOpen: (() => void) | null; live?: string | null }) {
  const ca = teamColor(g.away.color ?? null) ?? "#1d2a35";
  const ch = teamColor(g.home.color ?? null) ?? "#1d2a35";
  const mvpTeam = g.mvp?.side === "away" ? g.away : g.mvp?.side === "home" ? g.home : null;
  const body = (
    <>
      <div className="ic-top">
        <span className="ic-rank">#{rank}</span>
        <span className="ic-ins" title="Insanity score">
          <strong>{g.insanity}</strong> {tierLabel(g.tier)}
        </span>
        {live != null && <span className="ic-live" title="In progress: scored from the live win-probability line">LIVE{live ? ` · ${live}` : ""}</span>}
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
              <span className="ic-abbr">{t.abbr}</span>
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
