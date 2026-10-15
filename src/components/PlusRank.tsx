import { plusRankFor, plusRankTitle, usePlusRanks, type TeamRef } from "../plusRanks";

/**
 * The team's national SP+ rank (college) or NFL+ rank (NFL) to the left of its name on every game card, the same rankings as the
 * CFB SP+ and NFL+ tabs. Nothing when the team has none.
 */
export function PlusRank({ league, team }: { league: string; team: TeamRef | unknown }) {
  const r = plusRankFor(usePlusRanks(), league, team as TeamRef);
  if (!r) return null;
  return (
    <span className="fpi-rank plus-rank" title={plusRankTitle(r)}>
      <span className="sr-only">{r.kind} rank {r.n}, </span>
      <span aria-hidden="true">{r.n}</span>
    </span>
  );
}
