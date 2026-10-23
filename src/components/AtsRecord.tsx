import { useMemo } from "react";
import { Chart } from "./ParlayRecord";
import { PickResults } from "./PickResults";
import { backtestSlips, slipBreakEven, slipRecord, slipWeeks, type GradedPick } from "../pickRecord";

const pct = (n: number | null, d = 0) => (n == null ? "–" : `${(n * 100).toFixed(d)}%`);
const rec = (w: number, l: number, p = 0) => `${w}-${l}${p ? `-${p}` : ""}`;

/**
 * The against-the-spread record in one place: the season's total, weekly bars with a season-to-date line and the break-even mark, and every
 * graded pick with the reason it covered or missed. A pick is a one-leg slip, so the same grading as the parlays applies.
 */
export function AtsRecord({ picks, label }: { picks: GradedPick[]; label: string }) {
  const singles = useMemo(() => backtestSlips(picks, 1, Infinity), [picks]);
  const weeks = useMemo(() => slipWeeks(singles), [singles]);
  const all = slipRecord(singles);
  if (!picks.length) return <p className="ol-note">No graded picks yet.</p>;
  const be = slipBreakEven(1);
  const best = weeks.filter((w) => w.rec.pct != null);
  const hi = best.reduce((a, b) => (b.rec.pct! > a.rec.pct! ? b : a), best[0]), lo = best.reduce((a, b) => (b.rec.pct! < a.rec.pct! ? b : a), best[0]);
  return (
    <section className="pr" aria-label="ATS record">
      <h3 className="lev-h">{label} against the spread</h3>
      <dl className="pr-tiles">
        <div><dt>Season</dt><dd>{rec(all.w, all.l, all.v)}</dd></div>
        <div><dt>Against the spread</dt><dd>{pct(all.pct, 1)}</dd></div>
        <div><dt>Break-even (−110)</dt><dd>{pct(be, 1)}</dd></div>
        <div><dt>Picks graded</dt><dd>{singles.length}</dd></div>
      </dl>
      <Chart weeks={weeks} size={1} />
      {hi && lo && <ul className="pr-bullets"><li>Best week: Wk {hi.week} at {pct(hi.rec.pct, 1)} ({rec(hi.rec.w, hi.rec.l, hi.rec.v)}); weakest: Wk {lo.week} at {pct(lo.rec.pct, 1)} ({rec(lo.rec.w, lo.rec.l, lo.rec.v)}).</li></ul>}
      <PickResults picks={picks} label={label} />
    </section>
  );
}
