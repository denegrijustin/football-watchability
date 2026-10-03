import {
  dayName,
  daysFor,
  scoreFilters,
  slate,
  results,
  type FilterState,
  type League,
  type StatusFilter,
} from "../data";

/** Games per status for the current league and filters, shown on the Status buttons. */
export type StatusCounts = Record<StatusFilter, number>;
const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "In progress" },
  { id: "final", label: "Completed" },
  { id: "upcoming", label: "Upcoming" },
];

type Props = FilterState & {
  counts: StatusCounts;
  onChange: (patch: Partial<FilterState>) => void;
};

export function Filters({
  league,
  conference,
  query,
  day,
  minScore,
  status,
  counts,
  onChange,
}: Props) {
  const days = daysFor(league);
  return (
    <div className="filter-dock">
      <div className="filter-main">
        <div className="league-switch" role="group" aria-label="League">
          {(["NFL", "CFB"] as League[]).map((l) => {
            const n = slate.games.filter((g) => g.league === l).length + results.filter((r) => r.league === l).length;
            const name = l === "NFL" ? "NFL" : "College football";
            return (
              <button
                key={l}
                aria-pressed={league === l}
                aria-label={`${name}, ${n} games`}
                onClick={() => onChange({ league: l, day: "all" })}
              >
                {l === "NFL" ? (
                  "NFL"
                ) : (
                  <>
                    College<span className="league-extra"> football</span>
                  </>
                )}
                <span className="count">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
            <circle
              cx="11"
              cy="11"
              r="6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="m16 16 4.5 4.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            aria-label="Search teams, channels or locations"
            placeholder="Search teams, TV…"
            value={query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
          {query && (
            <button
              className="search-clear"
              aria-label="Clear search"
              onClick={() => onChange({ query: "" })}
            >
              ×
            </button>
          )}
        </label>
      </div>
      <div className="status-row">
        <div className="segmented status-filter" role="group" aria-label="Status">
            {STATUSES.map((st) => (
              <button
                key={st.id}
                aria-pressed={status === st.id}
                onClick={() => onChange({ status: st.id })}
                className={st.id === "live" ? "is-live-filter" : undefined}
              >
                {st.label}
                <span className="count">{counts[st.id]}</span>
              </button>
            ))}
          </div>
      </div>
      <div className="filter-row">
        <div className="segmented" role="group" aria-label="Day">
          <button
            aria-pressed={day === "all"}
            onClick={() => onChange({ day: "all" })}
          >
            All days
          </button>
          {days.map((d) => (
            <button
              key={d}
              aria-pressed={day === d}
              aria-label={dayName(d)}
              onClick={() => onChange({ day: d })}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Watchability">
          {scoreFilters.map((s) => (
            <button
              key={s.id}
              aria-pressed={minScore === s.id}
              onClick={() => onChange({ minScore: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {league === "CFB" && (
        <div
          className="conference-filters"
          role="group"
          aria-label="Conference"
        >
          {slate.conferences.map((c) => (
            <button
              key={c.id}
              aria-pressed={conference === c.id}
              onClick={() => onChange({ conference: c.id })}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
