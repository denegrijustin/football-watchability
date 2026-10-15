/**
 * A full-width strip at the very top of a game card when the team ranked lower by SP+ (college) or NFL+ (NFL) is ahead (alert) or won (final). It sits in
 * the same place on every card, whatever width the header below it wraps to.
 */
export function UpsetBanner({ kind, winner, loser }: { kind: "alert" | "final"; winner: { abbr: string; rank: number }; loser: { abbr: string; rank: number } }) {
  return (
    <div className="upset-banner" role="status">
      <b>{kind === "alert" ? "Upset alert" : "Upset final"}</b>
      <span>
        {winner.abbr} <i>#{winner.rank}</i> {kind === "alert" ? "leads" : "beat"} {loser.abbr} <i>#{loser.rank}</i>
      </span>
    </div>
  );
}
