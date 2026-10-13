import type { ReactNode } from "react";
import { useData } from "../data/useData";
import { gameIndex, projectionMiss } from "../data/games";
import { dateLabel, fmt, fmtPct, fmtSigned, timeLabel } from "../data/derive";
import type { GameResult, Projection } from "../data/types";
import { Derived, TeamLink, useTeamLookup } from "./common";
import { useRoute } from "../store";

const KV = ({ k, children }: { k: ReactNode; children: ReactNode }) => <div><dt>{k}</dt><dd>{children}</dd></div>;

/** Everything the sheet holds about one game: the result row(s) and the pre-game projection row. */
export function GameDetail({ result, proj }: { result?: GameResult; proj?: Projection }) {
  const { model } = useData();
  const team = useTeamLookup();
  const [, nav] = useRoute();
  if (!model) return null;
  const idx = gameIndex(model);
  const p = proj ?? (result ? idx.projFor(result) : undefined);
  const res = result ?? (p ? idx.resultFor(p)?.winner : undefined);
  const other = res ? idx.byTeam.get(res.opp)?.find((r) => r.opp === res.team && Math.abs(Date.parse(r.date) - Date.parse(res.date)) <= 86_400_000) : undefined;
  const miss = p ? projectionMiss(p, idx.resultFor(p)?.winner) : null;
  const ratingWeek = p?.week;
  const rt = (name: string) => (ratingWeek != null ? team(name)?.weeks[ratingWeek] : undefined);
  return (
    <div className="stack" style={{ gap: 10 }}>
      {res && (
        <section>
          <h3>Result <span className="tag">postgame sheet row {res.row}</span></h3>
          <dl className="kv">
            <KV k="Date">{res.date}</KV>
            <KV k="Team"><TeamLink team={team(res.team)} size={16} /></KV>
            <KV k="Opponent"><TeamLink team={team(res.opp)} size={16} /></KV>
            <KV k="Win">{res.win == null ? "—" : res.win}</KV>
            <KV k="Points / opp. points">{res.pts ?? "—"} / {res.oppPts ?? "—"}</KV>
            <KV k="Margin">{res.margin == null ? "—" : fmtSigned(res.margin, 0)}</KV>
            <KV k="Postgame win expectancy">{res.pgwe == null ? "—" : `${res.pgwe} (${fmtPct(res.pgwe)})`}</KV>
            <KV k="Adjusted margin">{res.adjMgn == null ? "—" : fmtSigned(res.adjMgn)}</KV>
            {other && <KV k={`${res.opp}'s row`}>win {other.win}, PGWE {other.pgwe}, adj. margin {other.adjMgn == null ? "—" : fmtSigned(other.adjMgn)} <span className="muted">(row {other.row})</span></KV>}
          </dl>
        </section>
      )}
      {p && (
        <section>
          <h3>Projection <span className="tag">{`FBS Week ${p.week}, row ${p.row}`}</span>
            {" "}<button type="button" className="btn small" onClick={() => nav({ view: "simulator", week: p.week === model.latest ? null : p.week, p: { a: `FBS:${p.away}`, b: `FBS:${p.home}`, v: p.neutral ? "n" : "b" } })}>Simulate this game</button>
          </h3>
          <dl className="kv">
            <KV k="Game">{p.game}</KV>
            <KV k="Date / time">{dateLabel(p.date)} {timeLabel(p.time)}</KV>
            <KV k="Projected winner">{p.projWinner ?? "—"}</KV>
            <KV k="Projected margin">{p.projMargin == null ? "—" : fmt(p.projMargin)}</KV>
            <KV k="Win probability">{p.winProb == null ? "—" : fmtPct(p.winProb)}</KV>
            <KV k="Projected score">{p.projScore ?? "—"}</KV>
            <KV k="Spread">{p.spread ?? "—"}</KV>
            <KV k="ATS pick">{p.atsPick ?? "—"}</KV>
            <KV k="Spread diff">{p.spreadDiff == null ? "—" : fmt(p.spreadDiff)}</KV>
            <KV k="O/U">{p.ou == null ? "—" : p.ou}</KV>
            <KV k="O/U pick">{p.ouPick ?? "—"}</KV>
            <KV k="O/U diff">{p.ouDiff == null ? "—" : fmtSigned(p.ouDiff)}</KV>
            {miss != null && <KV k={<>Final vs projection <Derived why="Winner's final margin minus the projected margin" /></>}>{fmtSigned(miss)} pts for {p.projWinner}</KV>}
          </dl>
          <div className="tbl-wrap"><table className="tbl" style={{ marginTop: 6 }}>
            <thead><tr><th>Week {p.week} rating</th><th className="r">SP+</th><th className="r">Off</th><th className="r">Def</th><th className="r">ST</th></tr></thead>
            <tbody>
              {[p.away, p.home].filter(Boolean).map((n) => { const tw = rt(n); return (
                <tr key={n}><td><TeamLink team={team(n)} size={16} /></td><td className="r num">{fmt(tw?.sp)} <span className="muted">#{tw?.spRk ?? "—"}</span></td><td className="r num">{fmt(tw?.off)} <span className="muted">#{tw?.offRk ?? "—"}</span></td><td className="r num">{fmt(tw?.def)} <span className="muted">#{tw?.defRk ?? "—"}</span></td><td className="r num">{tw?.st == null ? "—" : `${fmt(tw.st)} #${tw.stRk}`}</td></tr>
              ); })}
            </tbody>
          </table></div>
          <p className="sub" style={{ margin: "4px 0 0" }}>Ratings are the same week's table; the sheet projects each game from them. Home/away read from “{p.game}”{p.neutral ? " (neutral site)" : ""} <Derived why="Split from the game text" /></p>
        </section>
      )}
      {!res && !p && <p className="empty">No game selected.</p>}
    </div>
  );
}
