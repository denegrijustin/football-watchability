import { useState, type ReactNode } from "react";
import { useLiveMap } from "../../live";
import { STRENGTH_LABEL, coverRule, lineText, pickStanding, ratingsMargin, standingText, strengthOf } from "../../livePicks";

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
  /** The gap as a number, for the ratings margin. */
  gapNum?: number | null;
  /** Kickoff, sortable (ISO date plus time). */
  at?: string;
  cover: number | null;
  /** The board game's ESPN id, to follow its score live. */
  espnId: string | null;
}

/**
 * The picks still to be graded, as cards: the pick and its line in big type, and for a game on the field a status that follows the score. It says
 * whether the pick is covering, not covering (and by how much it is short) or exactly on the number, and turns into the final grade at the horn.
 */
export function LivePicks({ items, title, note, track }: { items: LivePickItem[]; title: string; note: string; track?: string }) {
  const live = useLiveMap();
  const [all, setAll] = useState(false);
  const [by, setBy] = useState<"strength" | "time">("strength");
  if (!items.length) return null;
  // Games on the field first; then, the strongest picks (or the earliest kickoffs).
  const order = (it: LivePickItem) => { const s = it.espnId ? live[it.espnId]?.state : undefined; return s === "in" ? 0 : s === "post" ? 1 : 2; };
  const sorted = [...items].sort((a, b) => order(a) - order(b) || (by === "strength" ? (b.cover ?? 0) - (a.cover ?? 0) : (a.at ?? "").localeCompare(b.at ?? "")));
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  return (
    <div className="panel">
      <div className="phead">
        <div><h2>{title}</h2><p className="sub">{note}</p>{track && <p className="lp-track">{track}</p>}</div>
        <div className="seg" role="group" aria-label="Order the picks">
          <button type="button" aria-pressed={by === "strength"} onClick={() => setBy("strength")}>Strongest first</button>
          <button type="button" aria-pressed={by === "time"} onClick={() => setBy("time")}>By kickoff</button>
        </div>
      </div>
      <details className="lp-how">
        <summary>How to read a pick</summary>
        <ul>
          <li><b>The pick</b> is the team the data says to take against the spread, with the line it has to beat. <b>−3</b> means it must win by more than 3; <b>+3.5</b> means it can lose by 3 or less and still cover.</li>
          <li><b>Ratings expect</b> is how the ratings see that game for the pick's side. <b>Edge</b> is how many points better that is than the line: the bigger, the more the data disagrees with the market.</li>
          <li><b>Cover chance</b> is the probability the pick covers if the ratings are right, using their usual miss. <b>Big edge</b> is 60% or more, <b>Edge</b> 55–59%, <b>Slight edge</b> under 55%. A coin flip is 50%, and 52.4% is what beats the usual −110 price.</li>
          <li>Once a game starts the card follows the score: <b>✓ Covering</b>, <b>✗ Not covering</b> (and how much it needs) or <b>= On the number</b>. It turns into the final grade at the horn.</li>
        </ul>
      </details>
      <div className="lp-picks">
        {shown.map((it) => {
          const l = it.espnId ? live[it.espnId] : undefined;
          const s = pickStanding(l, it.liveIsHome ?? it.pickIsHome, it.line);
          const str = strengthOf(it.cover), rm = it.gapNum != null ? ratingsMargin(it.line, it.gapNum) : 0;
          return (
            <article key={it.id} className={`lp-pick ${s.phase}${s.phase !== "pre" ? ` ${s.status}` : ""}${str ? ` tier-${str}` : ""}`} data-phase={s.phase} data-status={s.phase === "pre" ? "" : s.status}>
              <header><span className="lp-by">{it.by} pick</span>{str && <span className={`lp-tier ${str}`}>{STRENGTH_LABEL[str]}</span>}<span className="lp-when">{it.when}</span></header>
              <div className="lp-call">{it.pickMark}<b>{it.pickName}</b><span className="lp-line" title="The line this pick has to beat">{lineText(it.line)}</span></div>
              <p className="lp-vs">{it.pickIsHome ? `Home · vs ${it.awayName}` : `Road · at ${it.homeName}`}</p>
              {it.gapNum != null && (
                <dl className="lp-facts">
                  <div><dt>Line</dt><dd>{lineText(it.line)}</dd></div>
                  <div><dt>Ratings expect</dt><dd>{rm >= 0 ? `win by ${rm}` : `lose by ${-rm}`}</dd></div>
                  <div><dt>Edge</dt><dd>+{it.gap} pts</dd></div>
                </dl>
              )}
              {it.cover != null && (
                <div className="lp-cover" role="img" aria-label={`Cover chance ${Math.round(it.cover * 100)} percent`}>
                  <span>Cover chance</span>
                  <span className="lp-bar"><i style={{ width: `${Math.round(it.cover * 100)}%` }} /><b aria-hidden="true" /></span>
                  <strong>{Math.round(it.cover * 100)}%</strong>
                </div>
              )}
              <p className="lp-rule">{coverRule(it.pickName, it.line)}</p>
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
