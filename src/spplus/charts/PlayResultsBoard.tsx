import { useMemo, type ReactNode } from "react";
import { ChipImg } from "../../logoTone";

export interface BoardTeam {
  id: string; name: string;
  /** How well the team plays: higher is better. */
  play: number;
  /** 1 = best play in the group. */
  playRank: number;
  /** Winning percentage, 0 to 1. */
  winPct: number;
  rec: string;
  /** The text under the logo, and the line in the tooltip. */
  rankText: string; tip: string;
  logo: ReactNode;
  /** The logo file, when there is one: it is painted on a chip that contrasts with it. */
  logoSrc?: string;
}

type Row = "well" | "even" | "out";
type Col = "win" | "mid" | "lose";
const ROWS: { key: Row; title: string }[] = [{ key: "well", title: "Playing well" }, { key: "even", title: "Even" }, { key: "out", title: "Getting outplayed" }];
const COLS: { key: Col; title: string }[] = [{ key: "win", title: "Winning" }, { key: "mid", title: "Treading water" }, { key: "lose", title: "Losing" }];
const CELLS: Record<Row, Record<Col, { name: string; tone: "good" | "warn" | "bad" | "" }>> = {
  well: { win: { name: "The real deal", tone: "good" }, mid: { name: "Due for more", tone: "" }, lose: { name: "Unlucky", tone: "warn" } },
  even: { win: { name: "Finding a way", tone: "" }, mid: { name: "Middle of the pack", tone: "" }, lose: { name: "Coin flips going wrong", tone: "" } },
  out: { win: { name: "Living dangerously", tone: "warn" }, mid: { name: "Hanging on", tone: "" }, lose: { name: "Trouble", tone: "bad" } },
};

/**
 * Every team by how it plays (rows: the top third, middle third and bottom third by `play`) against what it has to show for it (columns:
 * winning percentage). The off-diagonal corners are the teams whose results do not match their play, and tend to move toward it.
 */
export function PlayResultsBoard({ teams, winHi, winLo, playLabel, playRule, onPick, selected, showRank, markTop, markBottom }: {
  teams: BoardTeam[]; winHi: number; winLo: number; playLabel: string; playRule: string; onPick: (id: string) => void; selected?: string | null;
  showRank: boolean; markTop: number; markBottom: number;
}) {
  const grid = useMemo(() => {
    const n = teams.length, g: Record<Row, Record<Col, BoardTeam[]>> = { well: { win: [], mid: [], lose: [] }, even: { win: [], mid: [], lose: [] }, out: { win: [], mid: [], lose: [] } };
    for (const t of [...teams].sort((a, b) => a.playRank - b.playRank)) {
      const row: Row = t.playRank <= n / 3 ? "well" : t.playRank > (2 * n) / 3 ? "out" : "even";
      const col: Col = t.winPct >= winHi ? "win" : t.winPct < winLo ? "lose" : "mid";
      g[row][col].push(t);
    }
    return g;
  }, [teams, winHi, winLo]);
  if (!teams.length) return <p className="empty">No games played yet.</p>;
  const n = teams.length;
  const pct = (v: number) => (v >= 1 ? "1.000" : v.toFixed(3).replace(/^0/, ""));
  return (
    <div className={`prb${showRank ? "" : " dense"}`} role="group" aria-label="Play against results">
      <div className="prb-corner" aria-hidden="true" />
      <div className="prb-axis" aria-hidden="true">Results: are they winning? →</div>
      <div className="prb-corner" aria-hidden="true" />
      {COLS.map((c) => (
        <div key={c.key} className="prb-colh"><b>{c.title}</b><small>{c.key === "win" ? `win % ${pct(winHi)}+` : c.key === "lose" ? `under ${pct(winLo)}` : "in between"}</small></div>
      ))}
      {ROWS.map((r) => (
        <div className="prb-row" key={r.key} role="presentation">
          <div className="prb-rowh"><b>{r.title}</b><small>{r.key === "well" ? `${playLabel} top third` : r.key === "out" ? `${playLabel} bottom third` : "in between"}</small></div>
          {COLS.map((c) => {
            const cell = CELLS[r.key][c.key], list = grid[r.key][c.key];
            return (
              <section key={c.key} className={`prb-cell ${cell.tone}`} aria-label={`${cell.name}: ${list.length} teams`}>
                <h3>{cell.name}<span>{list.length || ""}</span></h3>
                <ul>
                  {list.map((t) => (
                    <li key={t.id} className={t.playRank <= markTop ? "top" : t.playRank > n - markBottom ? "bot" : ""}>
                      <button type="button" className={selected === t.id ? "sel" : ""} title={t.tip} aria-label={t.tip} onClick={() => onPick(t.id)}>
                        {t.logoSrc ? <ChipImg src={t.logoSrc} size={26} /> : t.logo}
                        {showRank && <span>{t.rankText}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ))}
      <p className="prb-foot">{playRule} Under each logo: the team's rank on that rating — <b className="g">green</b> in the top {markTop}, <b className="r">red</b> in the bottom {markBottom}. The off-diagonal corners are the ones to watch: results that don't match the play tend to move toward it.</p>
    </div>
  );
}
