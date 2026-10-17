import { useState, type ReactNode } from "react";
import { useLiveMap } from "../../live";
import { lineText, pickStanding, standingText } from "../../livePicks";

/** Cards shown before the "show more" button: the games on the field and the next kickoffs. */
const SHOWN = 8;

export interface LivePickItem {
  id: string;
  /** "SP+" or "Ratings": who made the pick. */
  by: string;
  pickName: string;
  pickMark: ReactNode;
  /** Margin the pick has to win by (negative for an underdog getting points). */
  line: number;
  pickIsHome: boolean;
  /** Whether the pick is the board's home team (differs from `pickIsHome` only when the sheet lists a neutral-site game the other way round). */
  liveIsHome?: boolean;
  awayName: string;
  homeName: string;
  when: string;
  gap: string | null;
  cover: number | null;
  /** The board game's ESPN id, to follow its score live. */
  espnId: string | null;
}

/**
 * The picks still to be graded, as cards: the pick and its line in big type, and for a game on the field a status that follows the score. It says
 * whether the pick is covering, not covering (and by how much it is short) or exactly on the number, and turns into the final grade at the horn.
 */
export function LivePicks({ items, title, note }: { items: LivePickItem[]; title: string; note: string }) {
  const live = useLiveMap();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  // Games on the field first, then the ones about to start, then the rest.
  const order = (it: LivePickItem) => { const s = it.espnId ? live[it.espnId]?.state : undefined; return s === "in" ? 0 : s === "post" ? 1 : 2; };
  const sorted = [...items].sort((a, b) => order(a) - order(b));
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p className="sub">{note}</p>
      <div className="lp-picks">
        {shown.map((it) => {
          const l = it.espnId ? live[it.espnId] : undefined;
          const s = pickStanding(l, it.liveIsHome ?? it.pickIsHome, it.line);
          return (
            <article key={it.id} className={`lp-pick ${s.phase}${s.phase !== "pre" ? ` ${s.status}` : ""}`} data-phase={s.phase} data-status={s.phase === "pre" ? "" : s.status}>
              <header><span className="lp-by">{it.by} pick</span><span className="lp-when">{it.when}</span></header>
              <div className="lp-call">{it.pickMark}<b>{it.pickName}</b><span className="lp-line">{lineText(it.line)}</span></div>
              <p className="lp-vs">{it.pickIsHome ? `vs ${it.awayName}` : `at ${it.homeName}`}{it.gap ? ` · gap to the line ${it.gap}` : ""}{it.cover != null && s.phase === "pre" ? ` · cover chance ${Math.round(it.cover * 100)}%` : ""}</p>
              {l && s.phase !== "pre" ? (
                <div className="lp-live">
                  <span className="lp-score">{it.awayName} <b>{l.away}</b> – <b>{l.home}</b> {it.homeName}</span>
                  <span className="lp-clock">{s.phase === "post" ? "Final" : <><i aria-hidden="true" />{l.detail}</>}</span>
                  <span className={`lp-chip ${s.status}`}>{s.status === "covering" ? "✓" : s.status === "missing" ? "✗" : "="} {standingText(s)}</span>
                </div>
              ) : (
                <div className="lp-live"><span className="lp-clock">Not started</span></div>
              )}
            </article>
          );
        })}
      </div>
      {sorted.length > SHOWN && (
        <button type="button" className="btn small" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show ${sorted.length - SHOWN} more picks`}</button>
      )}
    </div>
  );
}
