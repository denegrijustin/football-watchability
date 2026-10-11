/**
 * A full-width strip at the very top of a game card when the team ranked lower by FPI is ahead (alert) or won (final). It sits in
 * the same place on every card, whatever width the header below it wraps to.
 */
export function UpsetBanner({ kind, winner, loser }: { kind: "alert" | "final"; winner: { abbr: string; fpi: number }; loser: { abbr: string; fpi: number } }) {
  return (
    <div className="upset-banner" role="status">
      <b>{kind === "alert" ? "Upset alert" : "Upset final"}</b>
      <span>
        {winner.abbr} <i>#{winner.fpi}</i> {kind === "alert" ? "leads" : "beat"} {loser.abbr} <i>#{loser.fpi}</i>
      </span>
    </div>
  );
}
