import { DONE_SORTS, type DoneSort } from "../completedSort";

/** "Sort completed games by" buttons, shared by every tab that lists finished games. */
export function DoneSortControl({ value, onChange, extra }: { value: DoneSort | string; onChange: (s: DoneSort) => void; extra?: { id: string; label: string }[] }) {
  return (
    <div className="segmented done-sort" role="group" aria-label="Sort completed games by">
      {(extra ?? []).map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id as DoneSort)}>
          {o.label}
        </button>
      ))}
      {DONE_SORTS.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} title={o.note} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
