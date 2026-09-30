import { useEffect, useMemo, useState } from "react";
import { logos, results, slate } from "../data";
import { rankGames, mostInsaneWeek, weekSummaries, type LedgerGame } from "../seasonRank";
import { INSANITY_TIERS } from "../insanity";
import { useOpenGame } from "./GameCenter";

type Scope = "week" | "season";
const tierLabel = (id: string) => INSANITY_TIERS.find((t) => t.id === id)?.label ?? id;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const PAGE = 10;
const known = new Set([...slate.games.map((g) => g.espnId), ...results.map((r) => r.espnId)]);

function facts(g: LedgerGame) {
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
        <ol className="ib-list">
          {list.slice(0, shown).map((g, i) => (
            <li key={g.id} className={`ib-row ${g.tier}`}>
              <span className="ib-rank" aria-label={`Rank ${i + 1}`}>
                {i + 1}
              </span>
              <div className="ib-score" title={`${tierLabel(g.tier)}`}>
                <strong>{g.insanity}</strong>
                <span>{tierLabel(g.tier)}</span>
              </div>
              <div className="ib-game">
                <div className="ib-teams">
                  {[g.away, g.home].map((t, k) => (
                    <span key={k} className={`ib-team${(k === 0 ? g.away.score > g.home.score : g.home.score > g.away.score) ? " won" : ""}`}>
                      {logos[t.logoId] && <img src={logos[t.logoId]} alt="" width="22" height="22" loading="lazy" />}
                      {t.abbr} <b>{t.score}</b>
                    </span>
                  ))}
                  {g.overtime && <span className="ib-ot">OT</span>}
                </div>
                <p className="ib-facts">
                  {facts(g).join(" · ")}
                  {scope === "season" && <span className="ib-week"> · {g.week}</span>}
                </p>
              </div>
              {known.has(g.id) && (
                <button className="ib-open" onClick={() => openGame(g.id)} aria-label={`Open Game Center: ${g.matchup}`}>
                  Game Center
                </button>
              )}
            </li>
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
