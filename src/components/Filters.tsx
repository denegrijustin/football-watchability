import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NFL_CONFERENCES, inConference } from "../teamConf";
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

/** Games per status for the current league and filters, shown in the Status menu. */
export type StatusCounts = Record<StatusFilter, number>;

type Props = FilterState & {
  onChange: (patch: Partial<FilterState>) => void;
};

/** One filter as a compact pop-down menu. The menu itself is the browser's own, so it is easy to use on a phone. */
function Menu({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; text: string; title?: string }[];
}) {
  return (
    <label className="fmenu">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} title={o.title}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The conferences worth offering: "all", and each one that has at least one game or result in this league (the one chosen stays, so it can be undone). */
function conferenceOptions(league: League, chosen: string) {
  if (league === "NFL") return NFL_CONFERENCES.map((c) => ({ value: c.id, text: c.label }));
  const teamSets = [
    ...slate.games.filter((g) => g.league === league).map((g) => (g.teams as { logoId: string }[]).map((t) => t.logoId)),
    ...results.filter((r) => r.league === league).map((r) => (r.teams as { logoId: string }[]).map((t) => t.logoId)),
  ];
  return slate.conferences
    .filter((c) => c.id === "all-fbs" || c.id === chosen || teamSets.some((ids) => inConference(league, c.id, ids)))
    .map((c) => ({ value: c.id, text: c.id === "all-fbs" ? "All conferences" : c.label }));
}

/** True on a phone-sized screen, where the filter panel is a sheet over the page instead of a pop-down. */
function useNarrow() {
  const q = "(max-width: 760px)";
  const [narrow, setNarrow] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

/**
 * The persistent filter bar. Always in view: League and Search. The secondary filters (Day, Watchability, Conference) sit in one Filters panel
 * with a count of how many are set and a Reset that touches only those three. Game status has its own selector in the board heading.
 */
export function Filters({ league, conference, query, day, minScore, onChange }: Props) {
  const days = daysFor(league);
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) toggle.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !panel.current?.contains(t)) close(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    panel.current?.querySelector<HTMLElement>("select")?.focus();
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", away);
    };
  }, [open]);
  const confIsSet = conference !== "all-fbs" && conference !== "all";
  const active = [day !== "all", minScore !== 0, confIsSet].filter(Boolean).length;
  const leagueCount = (l: League) =>
    slate.games.filter((g) => g.league === l).length +
    results.filter((r) => r.league === l).length;
  const confOptions = useMemo(() => conferenceOptions(league, conference), [league, conference]);
  const panelEl = (
    <div
      className="filter-sheet"
      id="filter-sheet"
      ref={panel}
      {...(open ? { role: "dialog", "aria-label": "Filters", ...(narrow ? { "aria-modal": true } : {}) } : {})}
      data-open={open}
    >
      <div className="sheet-head">
        <span className="sheet-grabber" aria-hidden="true" />
        <strong>Filters</strong>
        <button type="button" className="sheet-done" onClick={() => close()}>
          Done
        </button>
      </div>
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
      <Menu label="Conference" value={conference} onChange={(v) => onChange({ conference: v })} options={confOptions} />
      <div className="sheet-foot">
        <span className="sheet-count" aria-live="polite">
          {active === 0 ? "No filters set" : `${active} filter${active === 1 ? "" : "s"} set`}
        </span>
        <button
          type="button"
          className="reset-adv"
          disabled={active === 0}
          onClick={() => onChange({ day: "all", minScore: 0, conference: "all-fbs" })}
        >
          Reset filters
        </button>
      </div>
    </div>
  );
  return (
    <div className="filter-dock">
      <div className="filter-bar has-conf" role="group" aria-label="Filters">
        <Menu
          label="League"
          value={league}
          onChange={(v) => onChange({ league: v as League, day: "all", conference: "all-fbs" })}
          options={[
            { value: "NFL", text: "NFL", title: `${leagueCount("NFL")} games` },
            { value: "CFB", text: "College", title: `${leagueCount("CFB")} games` },
          ]}
        />
        <div className="filter-more" ref={wrap}>
          <button
            type="button"
            ref={toggle}
            className="filter-toggle"
            aria-expanded={open}
            aria-controls="filter-sheet"
            onClick={() => (open ? close(false) : setOpen(true))}
          >
            Filters
            {active > 0 && (
              <b className="filter-n" aria-label={`${active} active`}>
                {active}
              </b>
            )}
          </button>
          {narrow && open ? null : panelEl}
        </div>
        {narrow && open
          ? createPortal(
              <>
                {panelEl}
                <div className="sheet-backdrop" onClick={() => close(false)} aria-hidden="true" />
              </>,
              document.body,
            )
          : null}
        <label className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label="Search teams, channels or locations"
            placeholder="Search teams or games"
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
