import { useEffect, useMemo, useState } from "react";
import { logos } from "../data";
import { useLiveMap } from "../live";
import { upsetBy } from "../upset";
import { useOpenGame } from "./GameCenterContext";
import type { Board } from "./GameBoard";
import "../finalScores.css";

type Tile = { id: string; league: string; when: number; ot: boolean; /** The team with the worse FPI rank beat one at least MIN_UPSET_GAP places better: the index of the winner and the gap. */ upset: { winner: number; gap: number } | null; teams: { abbr: string; name: string; logoId: string; score: number; /** ESPN FPI rank among its league's teams. */ fpi: number | null }[] };

const KEY = "fw-final-scores-open";
const read = () => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } }; // open unless a visitor closed it

export type { Tile as FinalTile };

const withUpset = (t: Omit<Tile, "upset">): Tile => ({ ...t, upset: t.teams.length === 2 ? upsetBy(t.teams.map((x) => x.fpi), [t.teams[0].score, t.teams[1].score]) : null });

/** The latest week's finals plus games the live feed has just marked final, after the board's filters, newest first. */
export function useFinalTiles(board: Board): Tile[] {
  const live = useLiveMap();
  return useMemo<Tile[]>(() => {
    const latest = board.finals.reduce((w, r) => (r.date > w.date ? r : w), board.finals[0])?.week;
    const done: Tile[] = board.finals.filter((r) => r.week === latest).map((r) => withUpset({ id: r.espnId, league: r.league, when: Date.parse(r.date), ot: r.final.overtime, teams: r.teams.map((t) => ({ abbr: t.abbr, name: t.name, logoId: t.logoId, score: t.score, fpi: t.ranks?.overall ?? null })) }));
    const fresh: Tile[] = board.justFinal.map((g) => {
      const l = live[g.espnId];
      return withUpset({ id: g.espnId, league: g.league, when: Date.parse((g as { date?: string }).date ?? ""), ot: /ot/i.test(l?.detail ?? ""), teams: g.teams.map((t, i) => ({ abbr: (t as { abbr?: string }).abbr ?? t.name, name: t.name, logoId: t.logoId, score: i === 0 ? l?.away ?? 0 : l?.home ?? 0, fpi: (t as { ranks?: { overall?: number } }).ranks?.overall ?? null })) });
    });
    // Upsets first, so they are in view in the small box; then the newest.
    return [...fresh, ...done].filter((t) => t.teams.length === 2).sort((a, b) => Number(!!b.upset) - Number(!!a.upset) || b.when - a.when);
  }, [board.finals, board.justFinal, live]);
}

/** Open or closed, remembered between visits. */
export function useFinalScoresOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(read);
  useEffect(() => { try { localStorage.setItem(KEY, open ? "1" : "0"); } catch { /* private window */ } }, [open]);
  return [open, setOpen];
}

/** The button that sits with the status chips in the board heading: it costs no height when the scores are closed. */
export function FinalScoresToggle({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  if (!count) return null;
  return (
    <button type="button" className={`status-chip fs-toggle${open ? " on" : ""}`} aria-expanded={open} aria-controls="fs-grid" onClick={onToggle}>
      Scores <b>{count}</b>
    </button>
  );
}

/** The completed games as a small scoreboard under the heading: a grid that scrolls inside its own box. A score opens its Game Center. Nothing is rendered while closed. */
export function FinalScores({ tiles, open }: { tiles: Tile[]; open: boolean }) {
  const openGame = useOpenGame();
  if (!open || !tiles.length) return null;
  return (
    <section className="fs" aria-label="Final scores">
      <ul id="fs-grid" className="fs-grid">
        {tiles.map((t) => {
          const [a, h] = t.teams, w = a.score === h.score ? -1 : a.score > h.score ? 0 : 1;
          const up = t.upset ? `Upset: ${t.teams[t.upset.winner].name}, FPI #${t.teams[t.upset.winner].fpi}, beat ${t.teams[1 - t.upset.winner].name}, FPI #${t.teams[1 - t.upset.winner].fpi}.` : "";
          return (
            <li key={t.id}>
              <button type="button" className={`fs-tile${t.upset ? " upset" : ""}`} data-event-id={t.id} data-upset={t.upset ? "true" : undefined} title={up || undefined} onClick={() => openGame(t.id)} aria-label={`${a.name} ${a.score}, ${h.name} ${h.score}, final${t.ot ? " in overtime" : ""}. ${a.fpi && h.fpi ? `FPI rank ${a.name} ${a.fpi}, ${h.name} ${h.fpi}. ` : ""}${up} Open the game.`}>
                {t.teams.map((tm, i) => (
                  <span key={i} className={`fs-row${w === i ? " won" : w === -1 ? "" : " lost"}`}>
                    <img src={logos[tm.logoId]} alt="" width="16" height="16" loading="lazy" decoding="async" />
                    {tm.fpi != null && <small className="fs-fpi" title={`ESPN FPI rank ${tm.fpi}`}>{tm.fpi}</small>}
                    <span className="fs-abbr">{tm.abbr}</span>
                    <b>{tm.score}</b>
                  </span>
                ))}
                <small className="fs-tag">{t.upset ? <><em>Upset</em><span>+{t.upset.gap}</span></> : t.ot ? "F/OT" : "F"}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
