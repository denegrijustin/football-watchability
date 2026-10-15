import { fpiRank, fpiTitle, type Ranks } from "../rankLine";

/** ESPN's FPI national rank, to the left of a team's name on every game card. Nothing when the team has no FPI rank. */
export function FpiRank({ ranks }: { ranks: Ranks | undefined | unknown }) {
  const r = ranks as Ranks | undefined;
  const n = fpiRank(r);
  if (n == null) return null;
  return (
    <span className="fpi-rank" title={fpiTitle(r)}>
      <span className="sr-only">ESPN FPI rank {n}, </span>
      <span aria-hidden="true">{n}</span>
    </span>
  );
}
