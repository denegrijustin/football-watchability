import type { Advanced } from "./AdvancedStats";

type Side = { abbr: string; adv: Advanced };
type Row = { label: string; hint: string; a: number | null; h: number | null; aText: string; hText: string; aSub?: string; hSub?: string; scale: number };

const num = (n: number | null | undefined, d = 1) => (n == null ? "—" : n.toFixed(d));
const signed = (n: number | null | undefined, d = 2) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`);
const rk = (r: number | null | undefined) => (r ? `#${r}` : undefined);
const net = (a: Advanced) => (a?.epa?.off != null ? (a.epa.off ?? 0) + (a.epa.def ?? 0) + (a.epa.st ?? 0) : null);

/**
 * The matchup as head-to-head bars: each row pulls toward the better side, by how much better it is (scale = the gap that fills the bar).
 * Offense is set against the other team's defense, which is the comparison that decides a game.
 */
export function MatchupBars({ away, home }: { away: Side; home: Side }) {
  const ea = away.adv?.eff, eh = home.adv?.eff;
  const rows: Row[] = [
    { label: "Overall", hint: "ESPN FPI efficiency, 0–100", a: ea?.tot ?? null, h: eh?.tot ?? null, aText: num(ea?.tot), hText: num(eh?.tot), aSub: rk(ea?.totRank), hSub: rk(eh?.totRank), scale: 25 },
    { label: `${away.abbr} offense vs ${home.abbr} defense`, hint: "The away offense against the home defense (FPI efficiency, 0–100)", a: ea?.off ?? null, h: eh?.def ?? null, aText: num(ea?.off), hText: num(eh?.def), aSub: rk(ea?.offRank), hSub: rk(eh?.defRank), scale: 25 },
    { label: `${home.abbr} offense vs ${away.abbr} defense`, hint: "The home offense against the away defense (FPI efficiency, 0–100)", a: ea?.def ?? null, h: eh?.off ?? null, aText: num(ea?.def), hText: num(eh?.off), aSub: rk(ea?.defRank), hSub: rk(eh?.offRank), scale: 25 },
    { label: "Net EPA / game", hint: "Expected points added per game: offense + defense + special teams", a: net(away.adv), h: net(home.adv), aText: signed(net(away.adv), 1), hText: signed(net(home.adv), 1), scale: 12 },
    { label: "Quarterback (QBR)", hint: "ESPN Total QBR, 0–100", a: away.adv?.qbr?.value ?? null, h: home.adv?.qbr?.value ?? null, aText: num(away.adv?.qbr?.value), hText: num(home.adv?.qbr?.value), aSub: away.adv?.qbr?.name.split(" ").slice(-1)[0], hSub: home.adv?.qbr?.name.split(" ").slice(-1)[0], scale: 35 },
    { label: "Special teams", hint: "FPI special-teams efficiency, 0–100", a: ea?.st ?? null, h: eh?.st ?? null, aText: num(ea?.st), hText: num(eh?.st), aSub: rk(ea?.stRank), hSub: rk(eh?.stRank), scale: 25 },
  ].filter((r) => r.a != null && r.h != null);
  if (!rows.length) return null;
  return (
    <div className="mb" role="list" aria-label="Head-to-head matchup">
      <div className="mb-head" aria-hidden="true"><b className="a">{away.abbr}</b><span>edge</span><b className="h">{home.abbr}</b></div>
      {rows.map((r) => {
        const d = (r.h as number) - (r.a as number), f = Math.max(-1, Math.min(1, d / r.scale)); // + favors home
        const edge = Math.abs(f) < 0.06 ? null : f > 0 ? home.abbr : away.abbr;
        return (
          <div className="mb-row" role="listitem" key={r.label} title={r.hint}>
            <div className="mb-label">{r.label}{edge && <small>{edge} edge</small>}</div>
            <div className="mb-line">
              <span className={`mb-val a${f < -0.06 ? " win" : ""}`}>{r.aText}{r.aSub && <small>{r.aSub}</small>}</span>
              <span className="mb-track" aria-hidden="true">
                <i className="mid" />
                {f < 0 ? <i className="fill a" style={{ width: `${Math.abs(f) * 50}%` }} /> : <i className="fill h" style={{ width: `${f * 50}%` }} />}
              </span>
              <span className={`mb-val h${f > 0.06 ? " win" : ""}`}>{r.hText}{r.hSub && <small>{r.hSub}</small>}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
