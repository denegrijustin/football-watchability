import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { logos, results, slate, teamColor } from "../data";
import { rankGames, mostInsaneWeek, weekSummaries, type LedgerGame } from "../seasonRank";
import { INSANITY_TIERS } from "../insanity";
import { useOpenGame, type GameStub } from "./GameCenter";
import { Headshot } from "./Headshot";

type Scope = "week" | "season";
const tierLabel = (id: string) => INSANITY_TIERS.find((t) => t.id === id)?.label ?? id;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const PAGE = 12;
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
  const openGame = useOpenGame();

  useEffect(() => {
    let live = true;
    import("../data/season.json").then((m) => live && setLedger((m.default as { games: LedgerGame[] }).games));
    return () => {
      live = false;
    };
  }, []);

  const mine = useMemo(() => (ledger ?? []).filter((g) => g.league === league), [ledger, league]);
  const weeks = useMemo(() => weekSummaries(mine), [mine]);
  const best = useMemo(() => mostInsaneWeek(weeks), [weeks]);
  const week = weeks.find((w) => w.week === pick)?.week ?? weeks[0]?.week ?? "";
  const list = useMemo(() => rankGames(scope === "season" ? mine : mine.filter((g) => g.week === week)), [mine, scope, week]);
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
            : `${plural(list.length, "game")} · average ${avg} · ${wild} unhinged or worse`}
        </span>
        <span className="sort-label">Most insane first</span>
      </div>

      {ledger != null && list.length === 0 ? (
        <div className="empty-state">
          <h3>No finished {nameOf} games tracked yet.</h3>
          <p>Games are ranked once they finish and the board refreshes.</p>
        </div>
      ) : (
        <ol className="ib-cards">
          {list.slice(0, shown).map((g, i) => (
            <InsanityCard key={g.id} g={g} rank={i + 1} showWeek={scope === "season"} onOpen={() => (known.has(g.id) ? openGame(g.id) : openGame(g.id, stubOf(g)))} />
          ))}
        </ol>
      )}
      {list.length > shown && (
        <button className="ib-more" onClick={() => setShown((n) => n + 25)}>
          Show more ({list.length - shown} left)
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

function InsanityCard({ g, rank, showWeek, onOpen }: { g: LedgerGame; rank: number; showWeek: boolean; onOpen: (() => void) | null }) {
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
              {logos[t.logoId] ? <img src={logos[t.logoId]} alt="" width="40" height="40" loading="lazy" /> : <i className="ic-nologo" />}
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
    <li className={`ic ${g.tier}`} style={style}>
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
