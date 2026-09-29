import type { Part } from "../data";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Where a score comes from: a base plus components, each with its points out of
 * a maximum and the fact behind it. Rows are bars so the big contributors stand
 * out; the total row matches the score shown on the card.
 */
export function ScoreBreakdown({
  base,
  parts,
  total,
  caption,
}: {
  base: number;
  parts: Part[];
  total: number;
  caption: string;
}) {
  return (
    <table className="breakdown">
      <caption className="micro-label">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Component</th>
          <th scope="col">Points</th>
        </tr>
      </thead>
      <tbody>
        <tr className="bd-base">
          <th scope="row">Starting point</th>
          <td>{base}</td>
        </tr>
        {parts.map((p) => (
          <tr key={p.id} className={p.pts < 0 ? "bd-neg" : undefined}>
            <th scope="row">
              <span className="bd-label">{p.label}</span>
              <span className="bd-note">{p.note}</span>
              {p.max > 0 && (
                <span className="bd-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(0, Math.min(1, p.pts / p.max)) * 100}%` }} />
                </span>
              )}
            </th>
            <td>
              {p.pts < 0 ? "−" : "+"}
              {fmt(Math.abs(p.pts))}
              {p.max > 0 && <span className="bd-max">/{p.max}</span>}
            </td>
          </tr>
        ))}
        <tr className="bd-total">
          <th scope="row">Score</th>
          <td>{total}</td>
        </tr>
      </tbody>
    </table>
  );
}
