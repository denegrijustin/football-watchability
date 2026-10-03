import { dayName, daysFor, scoreFilters, slate, results, type FilterState, type League, type StatusFilter } from "../data";

/** Games per status for the current league and filters, shown in the Status menu. */
export type StatusCounts = Record<StatusFilter, number>;
const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All status" },
  { id: "live", label: "In progress" },
  { id: "final", label: "Completed" },
  { id: "upcoming", label: "Upcoming" },
];

type Props = FilterState & {
  counts: StatusCounts;
  onChange: (patch: Partial<FilterState>) => void;
};

/** One filter as a compact pop-down menu. The menu itself is the browser's own, so it is easy to use on a phone. */
function Menu({
  label,
  value,
  onChange,
  options,
  dot,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; text: string; title?: string }[];
  dot?: boolean;
}) {
  return (
    <label className={`fmenu${dot ? " live" : ""}`}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value} title={o.title}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The persistent filter bar: every filter is a pop-down menu in one slim row
 * (two short rows on a phone), so it takes little of the screen as you scroll.
 */
export function Filters({ league, conference, query, day, minScore, status, counts, onChange }: Props) {
  const days = daysFor(league);
  const leagueCount = (l: League) =>
    slate.games.filter((g) => g.league === l).length + results.filter((r) => r.league === l).length;
  const cfb = league === "CFB";
  return (
    <div className="filter-dock">
      <div className={`filter-bar${cfb ? " has-conf" : ""}`} role="group" aria-label="Filters">
        <Menu
          label="League"
          value={league}
          onChange={(v) => onChange({ league: v as League, day: "all" })}
          options={[
            { value: "NFL", text: "NFL", title: `${leagueCount("NFL")} games` },
            { value: "CFB", text: "College", title: `${leagueCount("CFB")} games` },
          ]}
        />
        <Menu
          label="Status"
          value={status}
          onChange={(v) => onChange({ status: v as StatusFilter })}
          dot={status === "live"}
          options={STATUSES.map((s) => ({ value: s.id, text: s.label, title: `${counts[s.id]} games` }))}
        />
        <Menu
          label="Day"
          value={day}
          onChange={(v) => onChange({ day: v })}
          options={[{ value: "all", text: "All days" }, ...days.map((d) => ({ value: d, text: dayName(d) }))]}
        />
        <Menu
          label="Watchability"
          value={String(minScore)}
          onChange={(v) => onChange({ minScore: Number(v) })}
          options={scoreFilters.map((s) => ({ value: String(s.id), text: s.id === 0 ? "Any rating" : s.label }))}
        />
        {cfb && (
          <Menu
            label="Conference"
            value={conference}
            onChange={(v) => onChange({ conference: v })}
            options={slate.conferences.map((c) => ({ value: c.id, text: c.id === "all-fbs" ? "All conferences" : c.label }))}
          />
        )}
        <label className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label="Search teams, channels or locations"
            placeholder="Search"
            value={query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
          {query && (
            <button className="search-clear" aria-label="Clear search" onClick={() => onChange({ query: "" })}>
              ×
            </button>
          )}
        </label>
      </div>
    </div>
  );
}
