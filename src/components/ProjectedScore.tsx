import { SecHead } from "./Info";

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
    <div className="proj-wrap">
      <SecHead as="h4" className="micro-label" title="Projected score" info={{
        means: "The final score we expect, rounded to a score that can really happen in football. It is a single most-likely picture, not a promise: the winner is the team ahead in this score, and the gap is the expected margin.",
        how: "The betting line and total (about 65%) are blended with each team's season scoring (about 35%), then adjusted for home field and weather, and snapped to the nearest realistic score that keeps the same winner. “How it's built” lists every piece.",
      }} />
      <details className="proj">
        <summary>
          <span className="proj-board" aria-label={`${away} ${p.away}, ${home} ${p.home}`}>
            <span className="pb-side"><small>{away}</small><b>{p.away}</b></span>
            <span className="pb-dash" aria-hidden="true">–</span>
            <span className="pb-side"><b>{p.home}</b><small>{home}</small></span>
          </span>
          <span className="proj-src">How it's built <i aria-hidden="true" /></span>
        </summary>
        <PartsList p={p} away={away} home={home} />
      </details>
    </div>
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
