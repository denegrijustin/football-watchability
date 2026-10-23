import { useState, type ReactNode } from "react";
import { useLiveMap } from "../../live";
import { PROOF_LABEL, type Proof } from "../../calibration";
import { STRENGTH_LABEL, chanceVerdict, coverRule, lineText, pickStanding, ratingsMargin, standingText, strengthOf } from "../../livePicks";

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
  /** The model's own bell-curve chance, and what picks with this edge have really done (see calibration.ts). When `hist` is given, `cover` is the history-based chance. */
  raw?: number | null;
  hist?: { pct: number | null; n: number; bucket: string; proof: Proof };
  /** The board game's ESPN id, to follow its score live. */
  espnId: string | null;
}

/**
 * The picks still to be graded, as cards: the pick and its line in big type, and for a game on the field a status that follows the score. It says
 * whether the pick is covering, not covering (and by how much it is short) or exactly on the number, and turns into the final grade at the horn.
 */
export function LivePicks({ items, title, note, track, extra }: { items: LivePickItem[]; title: string; note: string; track?: string; extra?: ReactNode }) {
  const live = useLiveMap();
  const [all, setAll] = useState(false);
  const [by, setBy] = useState<"strength" | "time">("strength");
  if (!items.length) return null;
  // Games on the field first; then, the strongest picks (or the earliest kickoffs).
  const order = (it: LivePickItem) => { const s = it.espnId ? live[it.espnId]?.state : undefined; return s === "in" ? 0 : s === "post" ? 1 : 2; };
  const sorted = [...items].sort((a, b) => order(a) - order(b) || (by === "strength" ? (b.cover ?? 0) - (a.cover ?? 0) || (b.raw ?? 0) - (a.raw ?? 0) : (a.at ?? "").localeCompare(b.at ?? "")));
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  return (
    <div className="panel">
      <div className="phead">
        <div><h2>{title}</h2><p className="sub">{note}</p>{track && <p className="lp-track">{track}</p>}{extra}</div>
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
          <li><b>Chance it covers</b> is what picks with this size of edge have really done, pulled toward a coin flip until there is a lot of history; the model's own, more confident number is shown under it. <b>Proven</b> means the record clears the 52.4% that beats the usual −110 price with room to spare, <b>Promising</b> means it is above break-even but could be luck, and <b>Unproven</b> means it is not.</li>
          <li>Once a game starts the card follows the score: <b>✓ Covering</b>, <b>✗ Not covering</b> (and how much it needs) or <b>= On the number</b>. It turns into the final grade at the horn.</li>
        </ul>
      </details>
      <div className="lp-picks">
        {shown.map((it) => {
          const l = it.espnId ? live[it.espnId] : undefined;
          const s = pickStanding(l, it.liveIsHome ?? it.pickIsHome, it.line);
          const str = it.hist ? ({ proven: "strong", promising: "lean", unproven: "slight" } as const)[it.hist.proof] : strengthOf(it.cover), tierLabel = it.hist ? PROOF_LABEL[it.hist.proof] : str ? STRENGTH_LABEL[str] : "", rm = it.gapNum != null ? ratingsMargin(it.line, it.gapNum) : 0;
          return (
            <article key={it.id} className={`lp-pick ${s.phase}${s.phase !== "pre" ? ` ${s.status}` : ""}${str ? ` tier-${str}` : ""}`} data-phase={s.phase} data-status={s.phase === "pre" ? "" : s.status}>
              <header><span className="lp-by">{it.by} pick</span>{str && <span className={`lp-tier ${str}`} title={it.hist ? "Whether picks with this size of edge have beaten the break-even rate in the past" : undefined}>{tierLabel}</span>}<span className="lp-when">{it.when}</span></header>
              <div className="lp-call">{it.pickMark}<b>{it.pickName}</b><span className="lp-line" title="The line this pick has to beat">{lineText(it.line)}</span></div>
              <p className="lp-vs">{it.pickIsHome ? `Home · vs ${it.awayName}` : `Road · at ${it.homeName}`}</p>
              {it.gapNum != null && (
                <dl className="lp-facts">
                  <div><dt>Line</dt><dd>{lineText(it.line)}</dd></div>
                  <div><dt>Ratings expect</dt><dd>{rm >= 0 ? `win by ${rm}` : `lose by ${-rm}`}</dd></div>
                  <div><dt>Edge</dt><dd>+{it.gap} pts</dd></div>
                </dl>
              )}
              {it.cover != null && (() => {
                const v = chanceVerdict(it.cover), at = (x: number) => `${Math.max(0, Math.min(100, ((x - 0.4) / 0.3) * 100))}%`;
                return (
                  <div className="lp-cover" role="img" aria-label={`${it.hist ? "Chance (history)" : "Cover chance"} ${Math.round(it.cover * 100)} percent: ${v.label}`}>
                    <div className="lp-chance"><span>{it.hist ? "Chance it covers (history)" : "Chance it covers"}</span><strong>{Math.round(it.cover * 100)}%</strong><em>{v.label}</em></div>
                    <div className="lp-scale" aria-hidden="true">
                      <i className="t flip" style={{ left: at(0.5) }}><u>50% flip</u></i>
                      <i className="t even" style={{ left: at(0.524) }}><u>52.4% even</u></i>
                      <i className="dot" style={{ left: at(it.cover) }} />
                    </div>
                    <p className="lp-explain">{v.text}</p>
                  </div>
                );
              })()}
              {it.hist && (
                <p className="lp-hist">The model alone says <b>{it.raw != null ? `${Math.round(it.raw * 100)}%` : "–"}</b>, but that is overconfident: picks with a {it.hist.bucket}-point edge have really covered <b>{it.hist.pct == null ? "–" : `${Math.round(it.hist.pct * 100)}%`}</b> over {it.hist.n} games. That is too few games to trust fully, so the chance above is pulled toward 50%.</p>
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
