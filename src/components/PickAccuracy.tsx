import { BREAK_EVEN, PROOF_LABEL, overall, recordOf, type History } from "../calibration";
import { normCdf } from "../spplus/sim/rng";

const pct = (n: number | null, d = 1) => (n == null ? "–" : `${(n * 100).toFixed(d)}%`);
const TIER = { proven: "strong", promising: "lean", unproven: "slight" } as const;

/**
 * What the picks have really done, by size of edge: the record, the range that record could plausibly hide, and what the model's own bell curve said it
 * would be. This is the page's answer to "can I trust a Big edge?".
 */
export function PickAccuracy({ hist, sigma, label }: { hist: History; sigma: number; label: string }) {
  const all = overall(hist);
  const verdict = all.n === 0 ? "No graded picks yet."
    : all.proof === "proven" ? `The record clears break-even (${pct(BREAK_EVEN)}) with room to spare, so the picks have shown a real edge.`
    : all.proof === "promising" ? `Above break-even (${pct(BREAK_EVEN)}), but ${all.n} games is not enough to rule out luck: the plausible range is ${pct(all.lo95, 0)} to ${pct(all.hi95, 0)}.`
    : `Below the ${pct(BREAK_EVEN)} needed to break even at −110. With a plausible range of ${pct(all.lo95, 0)} to ${pct(all.hi95, 0)}, the picks have not shown an edge over the line.`;
  return (
    <details className="pa" open>
      <summary>How accurate are these picks?</summary>
      <p className="pa-head"><b>{label}</b> picks against the spread: <b>{all.w}-{all.l}{all.p ? `-${all.p}` : ""}</b> ({pct(all.pct)}) from {hist.source}.</p>
      <p className="ol-note">{verdict}</p>
      <div className="pa-wrap">
        <table className="pa-table">
          <thead><tr><th>Edge (pts)</th><th>Record</th><th className="r">Hit rate</th><th className="r">Plausible range</th><th className="r" title="What the model's bell curve says a pick with an edge in the middle of this range should hit">Model said</th><th>Verdict</th></tr></thead>
          <tbody>
            {hist.buckets.map((b) => {
              const r = recordOf(b), mid = b.hi === Infinity ? b.lo + 2 : (b.lo + b.hi) / 2;
              return (
                <tr key={b.label}>
                  <th scope="row">{b.label}</th>
                  <td>{r.w}-{r.l}{r.p ? `-${r.p}` : ""}</td>
                  <td className="r">{pct(r.pct)}</td>
                  <td className="r">{r.n ? `${pct(r.lo95, 0)}–${pct(r.hi95, 0)}` : "–"}</td>
                  <td className="r">{pct(normCdf(mid / sigma), 0)}</td>
                  <td><span className={`lp-tier ${TIER[r.proof]}`}>{PROOF_LABEL[r.proof]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ol-note">If bigger edges were more reliable, the hit rate would climb down the table. The model's own column does climb; the real one is what to go by. Over/under picks have no track record here yet, so they are treated as a coin flip.</p>
    </details>
  );
}
