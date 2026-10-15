import { useMemo, useState } from "react";
import { logos, results, slate } from "../data";
import { useLiveMap } from "../live";
import { useOpenGame } from "./GameCenterContext";
import { useTz, ZONES } from "../tz";
import { upsetBy } from "../upset";
import { plusRankFor, plusRankTitle, usePlusRanks } from "../plusRanks";

type Item = {
  espnId: string;
  league: string;
  when: number;
  detail: string;
  state: "pre" | "in" | "post";
  teams: { abbr: string; name: string; logoId: string; espnId?: string | null; score: number; rank?: number | null; of?: number | null; kind?: string }[];
};




/**
 * Completed games: the archived finals plus any game the live feed has already marked final but the hourly rebuild hasn't
 * archived yet, newest first.
 */
function useFinals(): Item[] {
  const live = useLiveMap();
  const tz = useTz();
  const plus = usePlusRanks();
  return useMemo(() => {
    const fromResults: Item[] = results.filter(r => r.week === slate.period).map((r) => ({
      espnId: r.espnId,
      league: r.league,
      when: Date.parse(r.date),
      detail: r.final.overtime ? "Final/OT" : "Final",
      state: "post",
      teams: r.teams.map((t) => ({ abbr: t.abbr, name: t.name, logoId: t.logoId, score: t.score })),
    }));
    const fromLive: Item[] = slate.games
      .filter((g) => g.espnId && !results.some(r => r.espnId === g.espnId && r.week === slate.period))
      .map((g) => {
        const l = live[g.espnId];
        return {
          espnId: g.espnId,
          league: g.league,
          when: Date.parse((g as { date?: string }).date ?? ""),
          state: l?.state ?? "pre",
          detail: l?.state === "post" ? (/ot/i.test(l.detail) ? "Final/OT" : "Final") : l?.state === "in" ? `LIVE ${l.detail}` : `${new Date(g.date).toLocaleString("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" })} ${ZONES.find(z=>z.id===tz)?.abbr ?? ""}`,
          teams: g.teams.map((t, i) => ({ abbr: (t as { abbr?: string }).abbr ?? t.name, name: t.name, logoId: t.logoId, score: i === 0 ? l?.away ?? 0 : l?.home ?? 0 })),
        };
      });
    // Each team's national SP+ (college) or NFL+ (NFL) rank, the same rankings as the two ratings tabs.
    const ranked = (i: Item): Item => ({ ...i, teams: i.teams.map((t) => { const r = plusRankFor(plus, i.league, t); return r ? { ...t, rank: r.n, of: r.of, kind: r.kind } : t; }) });
    return [...fromLive, ...fromResults].map(ranked)
      .filter((i) => i.teams.length === 2)
      .sort((a, b) => ({in:0, pre:1, post:2}[a.state] - {in:0, pre:1, post:2}[b.state]) || (a.when || 0) - (b.when || 0));
  }, [live, tz, plus]);
}

const ranksSpoken = (item: Item) =>
  item.teams.every((t) => t.rank != null)
    ? ` National ratings rank: ${item.teams.map((t) => `${t.name} ${t.rank}`).join(", ")}.`
    : "";

/** One score: both teams, the final, and a button that opens the Game Center postgame summary. */
/** An upset final: the team ranked lower by SP+ (college) or NFL+ (NFL), a bigger number, beat the higher-ranked one. */
export function upsetOf(item: Pick<Item, "teams">) {
  return upsetBy(item.teams.map((t) => t.rank), [item.teams[0].score, item.teams[1].score]);
}

function Score({ item, hidden }: { item: Item; hidden?: boolean }) {
  const openGame = useOpenGame();
  const [away, home] = item.teams;
  const winner = item.state === "pre" || away.score === home.score ? -1 : away.score > home.score ? 0 : 1;
  const upset = item.state === "post" ? upsetOf(item) : null;
  return (
    <li aria-hidden={hidden || undefined} className={hidden ? "ticker-dup" : undefined}>
      <button
        type="button"
        data-event-id={item.espnId}
        className={`ticker-item${upset ? " upset" : ""}`}
        tabIndex={hidden ? -1 : undefined}
        onClick={() => openGame(item.espnId)}
        aria-label={`${away.name}${item.state === "pre" ? "" : ` ${away.score}`}, ${home.name}${item.state === "pre" ? "" : ` ${home.score}`}, ${item.detail.toLowerCase()}.${ranksSpoken(item)}${upset ? ` Upset: ${item.teams[upset.winner].name}, ranked ${upset.gap} places lower, beat ${item.teams[1 - upset.winner].name}.` : ""} Open Game Center.`}
      >
        <span className="ticker-league">{item.league}</span>
        {item.teams.map((t, i) => (
          <span key={i} className={`ticker-team${winner === i ? " won" : winner === -1 ? "" : " lost"}`}>
            {t.rank != null && (
              <small className="ticker-rank" title={plusRankTitle({ n: t.rank, of: t.of ?? 0, kind: t.kind as "SP+" | "NFL+" })}>
                #{t.rank}
              </small>
            )}
            <img src={logos[t.logoId]} alt="" width="18" height="18" loading="eager" decoding="async" />
            <b>{item.state === "pre" ? t.abbr : t.score}</b>
          </span>
        ))}
        <span className="ticker-final">{upset ? `Upset ${item.detail.toLowerCase()}` : item.detail}</span>
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
    <section className={`ticker${paused ? " paused" : ""}`} aria-label="Current week games">
      <span className="ticker-title">THIS WEEK</span>
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
