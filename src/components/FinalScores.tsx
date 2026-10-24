import { useEffect, useMemo, useState } from "react";
import { logos } from "../data";
import { useLiveMap } from "../live";
import { useOpenGame } from "./GameCenterContext";
import type { Board } from "./GameBoard";
import "../finalScores.css";

type Tile = { id: string; league: string; when: number; ot: boolean; teams: { abbr: string; name: string; logoId: string; score: number }[] };

const KEY = "fw-final-scores-open";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

export type { Tile as FinalTile };

/** The latest week's finals plus games the live feed has just marked final, after the board's filters, newest first. */
export function useFinalTiles(board: Board): Tile[] {
  const live = useLiveMap();
  return useMemo<Tile[]>(() => {
    const latest = board.finals.reduce((w, r) => (r.date > w.date ? r : w), board.finals[0])?.week;
    const done: Tile[] = board.finals.filter((r) => r.week === latest).map((r) => ({ id: r.espnId, league: r.league, when: Date.parse(r.date), ot: r.final.overtime, teams: r.teams.map((t) => ({ abbr: t.abbr, name: t.name, logoId: t.logoId, score: t.score })) }));
    const fresh: Tile[] = board.justFinal.map((g) => {
      const l = live[g.espnId];
      return { id: g.espnId, league: g.league, when: Date.parse((g as { date?: string }).date ?? ""), ot: /ot/i.test(l?.detail ?? ""), teams: g.teams.map((t, i) => ({ abbr: (t as { abbr?: string }).abbr ?? t.name, name: t.name, logoId: t.logoId, score: i === 0 ? l?.away ?? 0 : l?.home ?? 0 })) };
    });
    return [...fresh, ...done].filter((t) => t.teams.length === 2).sort((a, b) => b.when - a.when);
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
          return (
            <li key={t.id}>
              <button type="button" className="fs-tile" data-event-id={t.id} onClick={() => openGame(t.id)} aria-label={`${a.name} ${a.score}, ${h.name} ${h.score}, final${t.ot ? " in overtime" : ""}. Open the game.`}>
                {t.teams.map((tm, i) => (
                  <span key={i} className={`fs-row${w === i ? " won" : w === -1 ? "" : " lost"}`}>
                    <img src={logos[tm.logoId]} alt="" width="16" height="16" loading="lazy" decoding="async" />
                    <span className="fs-abbr">{tm.abbr}</span>
                    <b>{tm.score}</b>
                  </span>
                ))}
                <small className="fs-tag">{t.ot ? "F/OT" : "F"}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
