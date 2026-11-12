/** How the live and upcoming games are ordered. Completed games keep their own sort (DoneSortControl) inside their section. */
export type BoardSortKey = "time" | "watch";

const OPTIONS: { id: BoardSortKey; label: string; short: string; note: string }[] = [
  { id: "time", label: "Game time", short: "Time", note: "Kickoff slots in time order, best watchability first within each slot" },
  { id: "watch", label: "Highest rated", short: "Rating", note: "One list, highest watchability first; ties keep kickoff order" },
];

export function BoardSort({ value, onChange }: { value: BoardSortKey; onChange: (k: BoardSortKey) => void }) {
  return (
    <div className="segmented board-sort" role="group" aria-label="Sort games by">
      <span className="bs-label" aria-hidden="true">Sort</span>
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} aria-label={o.label} title={o.note} onClick={() => onChange(o.id)}>
          <span className="sort-long">{o.label}</span>
          <span className="sort-short">{o.short}</span>
        </button>
      ))}
    </div>
  );
}
