import type { WinProbData } from "./PregameWinProb";
import type { Projection } from "./ProjectedScore";

const pct = (n: number) => `${Math.round(n)}%`;

/**
 * The strip on a collapsed card: the betting line and total, the projected score, and (before kickoff) the win probability as a split bar,
 * so a card says who is favored and by how much without being opened.
 */
export function CardLine({ line, wp, projected, away, home, showBar }: { line: string | null; wp?: WinProbData | null; projected?: Projection | null; away: string; home: string; showBar: boolean }) {
  const homeWin = wp ? (wp.market ?? wp.espn ?? wp.home) : null;
  const fav = homeWin == null ? null : homeWin >= 50 ? home : away;
  const hasBar = showBar && homeWin != null;
  if (!line && !projected && !hasBar) return null;
  return (
    <div className="cl" aria-label="Line and win probability">
      {(line || projected) && (
        <p className="cl-chips">
          {line && <span className="cl-chip" title="Betting line and over/under"><span aria-hidden="true">⚖️</span> {line.replace(/\s*•\s*/g, " · ")}</span>}
          {projected && <span className="cl-chip" title={`Projected score (${projected.source})`}><span aria-hidden="true">🎯</span> {away} {projected.away} – {projected.home} {home}</span>}
        </p>
      )}
      {hasBar && (
        <div className="cl-bar" role="img" aria-label={`Win probability: ${away} ${pct(100 - homeWin!)}, ${home} ${pct(homeWin!)}${fav ? `. ${fav} favored` : ""}`}>
          <span className={`cl-val a${fav === away ? " fav" : ""}`}>{away} {pct(100 - homeWin!)}</span>
          <span className="cl-track" style={{ "--a": `${100 - homeWin!}%` } as React.CSSProperties}><i className="a" style={{ width: `${100 - homeWin!}%` }} /><i className="h" style={{ width: `${homeWin!}%` }} /><b aria-hidden="true" /></span>
          <span className={`cl-val h${fav === home ? " fav" : ""}`}>{pct(homeWin!)} {home}</span>
        </div>
      )}
    </div>
  );
}
