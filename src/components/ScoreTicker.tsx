import { useMemo, useState } from "react";
import { logos, results, slate } from "../data";
import { useLiveMap } from "../live";
import { useOpenGame } from "./GameCenterContext";

type Item = {
  espnId: string;
  league: string;
  when: number;
  detail: string;
  teams: { abbr: string; name: string; logoId: string; score: number; fpi: number | null; of: number | null }[];
};

const MAX_ITEMS = 40;

/** ESPN's FPI rank (the overall rank on every card) and how many teams it ranks. */
const fpiOf = (t: unknown) => {
  const r = (t as { ranks?: { overall?: number | null; overallOf?: number | null } }).ranks;
  return { fpi: r?.overall ?? null, of: r?.overallOf ?? null };
};

/**
 * Completed games: the archived finals plus any game the live feed has already marked final but the hourly rebuild hasn't
 * archived yet, newest first.
 */
function useFinals(): Item[] {
  const live = useLiveMap();
  return useMemo(() => {
    const archived = new Set(results.map((r) => r.espnId));
    const fromResults: Item[] = results.map((r) => ({
      espnId: r.espnId,
      league: r.league,
      when: Date.parse(r.date),
      detail: r.final.overtime ? "Final/OT" : "Final",
      teams: r.teams.map((t) => ({ abbr: t.abbr, name: t.name, logoId: t.logoId, score: t.score, ...fpiOf(t) })),
    }));
    const fromLive: Item[] = slate.games
      .filter((g) => g.espnId && !archived.has(g.espnId) && live[g.espnId]?.state === "post")
      .map((g) => {
        const l = live[g.espnId]!;
        return {
          espnId: g.espnId,
          league: g.league,
          when: Date.parse((g as { date?: string }).date ?? ""),
          detail: /ot/i.test(l.detail) ? "Final/OT" : "Final",
          teams: g.teams.map((t, i) => ({ abbr: (t as { abbr?: string }).abbr ?? t.name, name: t.name, logoId: t.logoId, score: i === 0 ? l.away : l.home, ...fpiOf(t) })),
        };
      });
    return [...fromLive, ...fromResults]
      .filter((i) => i.teams.length === 2)
      .sort((a, b) => (b.when || 0) - (a.when || 0))
      .slice(0, MAX_ITEMS);
  }, [live]);
}

const ranksSpoken = (item: Item) =>
  item.teams.every((t) => t.fpi != null)
    ? ` FPI rank: ${item.teams.map((t) => `${t.name} ${t.fpi}`).join(", ")}${item.league === "NFL" ? "; the power rank is the same" : ""}.`
    : "";

/** One score: both teams, the final, and a button that opens the Game Center postgame summary. */
function Score({ item, hidden }: { item: Item; hidden?: boolean }) {
  const openGame = useOpenGame();
  const [away, home] = item.teams;
  const winner = away.score === home.score ? -1 : away.score > home.score ? 0 : 1;
  return (
    <li aria-hidden={hidden || undefined} className={hidden ? "ticker-dup" : undefined}>
      <button
        type="button"
        className="ticker-item"
        tabIndex={hidden ? -1 : undefined}
        onClick={() => openGame(item.espnId)}
        aria-label={`${away.name} ${away.score}, ${home.name} ${home.score}, ${item.detail.toLowerCase()}.${ranksSpoken(item)} Open the postgame summary.`}
      >
        <span className="ticker-league">{item.league}</span>
        {item.teams.map((t, i) => (
          <span key={i} className={`ticker-team${winner === i ? " won" : winner === -1 ? "" : " lost"}`}>
            <img src={logos[t.logoId]} alt="" width="16" height="16" loading="eager" decoding="async" />
            {t.abbr} <b>{t.score}</b>
            {t.fpi != null && (
              <small className="ticker-rank" title={`ESPN FPI rank ${t.fpi}${t.of ? ` of ${t.of}` : ""}`}>
                FPI {t.fpi}
              </small>
            )}
            {item.league === "NFL" && t.fpi != null && (
              <small className="ticker-rank pr" title={`NFL power rank ${t.fpi} (the NFL power rank here is ESPN's FPI rank)`}>
                PR {t.fpi}
              </small>
            )}
          </span>
        ))}
        <span className="ticker-final">{item.detail}</span>
      </button>
    </li>
  );
}

/**
 * A persistent strip across the top of every screen that scrolls through the completed games. Each score opens its
 * Game Center postgame summary. It stops while pointed at or focused (and on request), and doesn't move at all for
 * visitors who ask for reduced motion, who can scroll it by hand instead.
 */
export function ScoreTicker() {
  const items = useFinals();
  const [paused, setPaused] = useState(false);
  if (!items.length) return null;
  return (
    <section className={`ticker${paused ? " paused" : ""}`} aria-label="Final scores">
      <span className="ticker-title">FINALS</span>
      <div className="ticker-viewport">
        <ul className="ticker-track" style={{ ["--ticker-dur" as string]: `${items.length * 5}s` }}>
          {items.map((i) => (
            <Score key={i.espnId} item={i} />
          ))}
          {/* A second copy makes the loop seamless; it is hidden from assistive tech and the tab order. */}
          {items.map((i) => (
            <Score key={`dup-${i.espnId}`} item={i} hidden />
          ))}
        </ul>
      </div>
      <button type="button" className="ticker-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
        {paused ? "Play" : "Pause"}
      </button>
    </section>
  );
}
