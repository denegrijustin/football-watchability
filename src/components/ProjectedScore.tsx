export type Projection = {
  away: number;
  home: number;
  source: string;
  blended?: { away: number; home: number };
  parts?: { id: string; label: string; away?: number; home?: number; weight?: number; note?: string }[];
};

/**
 * Projected final score, with the blend behind it: betting line, season
 * scoring, home field and weather, rounded to a standard football score.
 */
export function ProjectedScore({ p, away, home, listOnly }: { p: Projection; away: string; home: string; listOnly?: boolean }) {
  if (listOnly) return <PartsList p={p} away={away} home={home} />;
  return (
    <details className="proj">
      <summary>
        <span className="micro-label">Projected score</span>
        <strong>
          {away} {p.away}
          <span aria-hidden="true">–</span>
          <span className="sr-only"> to </span>
          {p.home} {home}
        </strong>
        <span className="proj-src">How it's built</span>
      </summary>
      <PartsList p={p} away={away} home={home} />
    </details>
  );
}

function PartsList({ p, away, home }: { p: Projection; away: string; home: string }) {
  return (
    <ul className="proj-parts">
      {(p.parts ?? []).map((x) => (
        <li key={x.id}>
          <span>
            {x.label}
            {x.weight ? <span className="proj-w"> · {x.weight}%</span> : null}
          </span>
          <span>{x.away != null ? `${away} ${x.away} – ${x.home} ${home}` : x.note}</span>
        </li>
      ))}
      {p.blended && (
        <li className="proj-total">
          <span>Blend, rounded to a real score</span>
          <span>
            {p.blended.away}–{p.blended.home} → <strong>{p.away}–{p.home}</strong>
          </span>
        </li>
      )}
    </ul>
  );
}
