import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { usePerf } from "./data";
import { ConfLogo } from "../ConfMark";
import { indexOf, leagueSummaries, summarize } from "./engine";
import type { PerfSelection } from "./types";

// ---------------------------------------------------------------------------------------------------------------------
// Color: team colors, made readable on the tool's background, and told apart when two teams share one.
// ---------------------------------------------------------------------------------------------------------------------
const lum = (r: number, g: number, b: number) => { const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const parse = (hex: string | null | undefined): [number, number, number] | null => { const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? ""); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number] : null; };
const hexOf = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Whether the page is in light appearance (the tool's own palette follows it). */
export const useLight = () => {
  const [light, setLight] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches);
  useEffect(() => { const mq = matchMedia("(prefers-color-scheme: light)"); const f = () => setLight(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  return light;
};

/** A team color adjusted until it has 3:1 contrast against the background (lightened on dark, darkened on light). */
export function readableColor(color: string | null | undefined, light: boolean, fallback: string): string {
  const c = parse(color);
  if (!c) return fallback;
  const bg = light ? lum(255, 255, 255) : lum(26, 26, 25);
  let cur = c.slice();
  for (let i = 0; i < 20 && contrast(lum(cur[0], cur[1], cur[2]), bg) < 3; i++) cur = cur.map((v) => (light ? v * 0.85 : v + (255 - v) * 0.18));
  return hexOf(cur);
}
const dist = (a: string, b: string) => { const x = parse(a), y = parse(b); return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : 999; };

/** Colors for the selected team and the comparison team: each readable, and clearly different from each other. */
export function useTeamColors(): { a: string; b: string } {
  const { sel, adapter } = usePerf();
  const light = useLight();
  return useMemo(() => {
    const a = readableColor(sel.team ? adapter.color(sel.team) : null, light, light ? "#1f6fd0" : "#6da7ec");
    let b = readableColor(sel.opp ? adapter.color(sel.opp) : null, light, light ? "#c0481a" : "#e8895a");
    if (dist(a, b) < 90) b = light ? "#b45309" : "#f0b04a";
    return { a, b };
  }, [sel.team, sel.opp, adapter, light]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------------------------------------------------
/** A "?" that opens a short explanation. Works with touch, pointer and keyboard (Enter/Space, Escape closes). */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <span className="ptip" ref={ref}>
      <button type="button" className="ptip-btn" aria-expanded={open} aria-controls={id} aria-label={`What is ${label}?`} onClick={() => setOpen((o) => !o)}>?</button>
      {open && <span className="ptip-pop" role="note" id={id}>{children}</span>}
    </span>
  );
}

export function Takeaway({ children, small }: { children: ReactNode; small?: string }) {
  if (!children) return null;
  return (
    <div className="ptake" role="status">
      <p>{children}</p>
      {small && <p className="sub">{small}</p>}
    </div>
  );
}

/** Loading, error, empty and partial-data states, designed rather than blank. */
export function PerfState({ children }: { children: ReactNode }) {
  const { data, error, retry, sel } = usePerf();
  if (error && !data) return <div className="note-box" role="alert">Could not load the team statistics: {error} <button type="button" className="btn small" onClick={retry}>Try again</button></div>;
  if (!data) return <div className="empty pload" role="status"><span className="spin" aria-hidden="true" /> Loading team statistics…</div>;
  if (!data.rows.length) return <div className="empty">No games with play-by-play data yet this season. They appear here after each game's data is published.</div>;
  if (!sel.team || !data.teams[sel.team]) return <div className="empty" role="status">Choose a team to begin.</div>;
  return <>{children}</>;
}

/** Plain note for a metric the source does not have: what is missing, why, and what the screen shows instead. */
export const Unavailable = ({ what, instead }: { what: string; instead: string }) => (
  <p className="note-box" role="note"><b>{what} is not available.</b> {instead}</p>
);

export const fmt = {
  pct: (v: number | null | undefined, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`),
  n: (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d)),
  signed: (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}`),
  ord: (n: number) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`,
  when: (iso: string | undefined | null) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"),
};

// ---------------------------------------------------------------------------------------------------------------------
// Controls and the freshness bar
// ---------------------------------------------------------------------------------------------------------------------
export interface ControlSet { opp?: boolean; bench?: boolean; side?: boolean; window?: boolean; garbage?: boolean }

export function TeamSelect({ label, value, onChange, none, exclude }: { label: string; value: string | null; onChange: (id: string | null) => void; none?: string; exclude?: string | null }) {
  const { adapter, data } = usePerf();
  const ids = useMemo(() => adapter.teamIds.filter((t) => data?.teams[t] && t !== exclude).sort((a, b) => adapter.name(a).localeCompare(adapter.name(b))), [adapter, data, exclude]);
  return (
    <label className="field">
      <span>{label}</span>
      <span className={`tsel${value ? " has" : ""}`}>
        {value && <span className="tsel-logo" aria-hidden="true">{adapter.mark(value, 24)}</span>}
        <select className="ctl" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          {none && <option value="">{none}</option>}
          {ids.map((t) => <option key={t} value={t}>{adapter.name(t)}</option>)}
        </select>
      </span>
    </label>
  );
}

/** Who the page is about: the team's logo, name, conference and record, and the comparison team when the tab uses one. */
export function TeamBanner({ showOpp }: { showOpp?: boolean }) {
  const { data, sel, adapter } = usePerf();
  const colors = useTeamColors();
  if (!data || !sel.team || !data.teams[sel.team]) return null;
  const record = (id: string) => {
    let w = 0, l = 0, t = 0;
    for (const r of indexOf(data).byTeam.get(id) ?? []) { if (r.pf > r.pa) w++; else if (r.pf < r.pa) l++; else t++; }
    return `${w}-${l}${t ? `-${t}` : ""}`;
  };
  const one = (id: string, color: string, role: string) => (
    <div className="pbn" style={{ ["--bn" as string]: color }}>
      <span className="pbn-logo">{adapter.mark(id, 44)}</span>
      <span className="pbn-text"><b>{adapter.name(id)}</b><small className="pbn-sub">{adapter.conf(id) && <><ConfLogo conf={adapter.conf(id)} size={16} />{adapter.conf(id)} · </>}{record(id)} in games counted</small></span>
      <span className="sr-only">{role}</span>
    </div>
  );
  return (
    <div className={`pbanner${showOpp && sel.opp ? " two" : ""}`} role="group" aria-label={showOpp && sel.opp ? "Teams shown" : "Team shown"}>
      {one(sel.team, colors.a, "Selected team")}
      {showOpp && sel.opp && <><span className="pbn-vs" aria-hidden="true">vs</span>{one(sel.opp, colors.b, "Comparison team")}</>}
    </div>
  );
}

export function Controls({ show }: { show: ControlSet }) {
  const { sel, set, adapter, data, seasons } = usePerf();
  if (!data) return null;
  const next = sel.team ? adapter.next(sel.team) : null;
  const seg = <T extends string>(name: string, value: T, opts: [T, string][], on: (v: T) => void) => (
    <div className="field">
      <span id={`pc-${name}`}>{name}</span>
      <div className="seg" role="group" aria-labelledby={`pc-${name}`}>
        {opts.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => on(v)}>{l}</button>)}
      </div>
    </div>
  );
  return (
    <div className="pcontrols" role="group" aria-label="Team and filters">
      <TeamSelect label="Team" value={sel.team} onChange={(t) => set({ team: t })} exclude={sel.opp} />
      {show.opp && (
        <div className="field">
          <TeamSelect label="Compare with" value={sel.opp} onChange={(t) => set({ opp: t, bench: t ? "opp" : sel.bench === "opp" ? "league" : sel.bench })} none="No one (league average)" exclude={sel.team} />
          {next && sel.opp !== next.opp && <button type="button" className="btn small ghost plink" onClick={() => set({ opp: next.opp, bench: "opp" })}>Next opponent: {adapter.short(next.opp)}</button>}
        </div>
      )}
      {show.side && seg("Side", sel.side, [["off", "Offense"], ["def", "Defense"]], (side) => set({ side }))}
      {show.window && seg("Games", sel.window, [["season", "Full season"], ["recent", `Last ${sel.recentN}`]], (window) => set({ window }))}
      {show.bench && seg("Benchmark", sel.bench, [["league", "League average"], ...(sel.opp ? ([["opp", adapter.short(sel.opp)]] as [PerfSelection["bench"], string][]) : []), ["none", "None"]], (bench) => set({ bench }))}
      {show.garbage && (
        <div className="field">
          <span>Garbage time <InfoTip label="garbage time">{data.definitions.garbage}</InfoTip></span>
          <button type="button" className={`btn${sel.garbage === "skip" ? " on" : ""}`} aria-pressed={sel.garbage === "skip"} onClick={() => set({ garbage: sel.garbage === "skip" ? "all" : "skip" })}>{sel.garbage === "skip" ? "Skipped" : "Included"}</button>
        </div>
      )}
      {data.league === "cfb" && (
        <div className="field">
          <span>FCS opponents <InfoTip label="FCS opponents">College teams are compared with other FBS teams only. Games against FCS opponents are left out unless you include them, because those games are usually lopsided.</InfoTip></span>
          <button type="button" className={`btn${sel.includeFcs ? " on" : ""}`} aria-pressed={sel.includeFcs} onClick={() => set({ includeFcs: !sel.includeFcs })}>{sel.includeFcs ? "Counted" : "Left out"}</button>
        </div>
      )}
      {seasons.length > 1 && (
        <label className="field"><span>Season</span>
          <select className="ctl" value={sel.season ?? seasons[0]} onChange={(e) => set({ season: Number(e.target.value) === seasons[0] ? null : Number(e.target.value), team: sel.team })}>
            {seasons.map((s) => <option key={s} value={s}>{s}{s === seasons[0] ? " (current)" : ""}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/** What is included, how fresh it is, and how much data is behind the numbers. */
export function Freshness() {
  const { data, status, sel, adapter } = usePerf();
  if (!data) return null;
  const s = sel.team ? summarize(data, sel.team, sel) : null;
  const league = data.coverage;
  const stale = status && !status.ok;
  return (
    <div className="pfresh" role="group" aria-label="Data freshness and sample size">
      <p>
        <b>{adapter.label} {data.season}</b> · final games through <b>Week {data.latestWeek}</b> · {league.gamesWithPlays} games, {league.plays.toLocaleString()} plays
        {s && <> · <b>{adapter.short(sel.team!)}</b>: {s.games.length} game{s.games.length === 1 ? "" : "s"}, {s.playsOff} offensive and {s.playsDef} defensive plays</>}
      </p>
      <p className="sub">
        Data updated {fmtWhen(data.dataUpdatedAt)} · last checked {fmtWhen(status?.checkedAt)}{stale ? " (the latest check failed, so this is the last good copy)" : ""} · Source: {data.source.name} ({data.source.license}).
        {" "}Final games only: a game that has just ended appears here after the next refresh.
        {league.missing.length > 0 && <> {league.missing.length} game{league.missing.length === 1 ? " is" : "s are"} missing play-by-play and not counted.</>}
        {sel.garbage === "skip" && " Garbage-time plays are skipped."}
        {sel.window === "recent" && ` Only the last ${sel.recentN} games are used.`}
      </p>
    </div>
  );
}
const fmtWhen = (iso: string | undefined | null) => fmt.when(iso);

// ---------------------------------------------------------------------------------------------------------------------
// Frame every tab sits in
// ---------------------------------------------------------------------------------------------------------------------
export function PerfFrame({ title, question, show, takeaway, takeSmall, children, defs }: { title: string; question: string; show: ControlSet; takeaway?: ReactNode; takeSmall?: string; children: ReactNode; defs?: string[] }) {
  const { data } = usePerf();
  return (
    <div className="pframe">
      <header className="phd">
        <h1>{title}</h1>
        <p className="pq">{question}</p>
      </header>
      <TeamBanner showOpp={show.opp} />
      <Controls show={show} />
      <PerfState>
        <Takeaway small={takeSmall}>{takeaway}</Takeaway>
        {children}
        {defs && data && (
          <details className="pdefs">
            <summary>Definitions</summary>
            <dl>{defs.map((k) => data.definitions[k] && <div key={k}><dt>{DEF_TITLE[k] ?? k}</dt><dd>{data.definitions[k]}</dd></div>)}</dl>
          </details>
        )}
      </PerfState>
      <Freshness />
    </div>
  );
}
const DEF_TITLE: Record<string, string> = { success: "Success rate", explosive: "Explosive plays", garbage: "Garbage time", efficiency: "Efficiency (EPA)", pass: "Passing", rush: "Rushing", drive: "Drives", redzone: "Red zone", opportunity: "Scoring chances", afterTurnover: "Points after turnovers" };

// ---------------------------------------------------------------------------------------------------------------------
// Percentile bars: always "higher is better", defenses included.
// ---------------------------------------------------------------------------------------------------------------------
export interface BarRow { id: string; label: string; plain?: string; a: number | null; b?: number | null; aText?: string; bText?: string; flag?: string; onSelect?: () => void; selected?: boolean; detailId?: string; detail?: ReactNode }

export function PercentBars({ rows, aName, bName, aColor, bColor, aMark, bMark }: { rows: BarRow[]; aName: string; bName?: string; aColor: string; bColor: string; aMark?: ReactNode; bMark?: ReactNode }) {
  return (
    <div className="pbars" role="list">
      <div className="pbars-scale" aria-hidden="true"><span>Worse than most</span><span>League median</span><span>Better than most</span></div>
      {rows.map((r) => (
        <div role="listitem" key={r.id} className={`pbar${r.selected ? " sel" : ""}`}>
          <button type="button" className="pbar-btn" aria-expanded={r.selected} aria-controls={r.detailId} onClick={r.onSelect}>
            <span className="pbar-lab"><b>{r.label}</b>{r.plain && <small>{r.plain}</small>}</span>
            <span className="pbar-track">
              <i className="mid" />
              {r.a != null ? <i className="fill a" style={{ width: `${r.a}%`, background: aColor }} /> : <em className="na">Not enough data</em>}
              {r.b != null && <i className="fill b" style={{ width: `${r.b}%`, borderColor: bColor }} />}
            </span>
            <span className="pbar-val">
              <b>{r.a == null ? "—" : fmt.ord(r.a)}</b>{r.aText && <small>{r.aText}</small>}
              {r.b != null && <b className="vb">{fmt.ord(r.b)}</b>}
              {r.flag && <small className="small-flag">{r.flag}</small>}
            </span>
          </button>
          {r.selected && r.detail}
        </div>
      ))}
      <div className="legend plegend" aria-label="Legend">
        <span><i style={{ background: aColor }} />{aMark}{aName}</span>
        {bName && <span><i style={{ border: `2px solid ${bColor}`, background: "transparent" }} />{bMark}{bName} (outline)</span>}
        <span>A longer bar is always better, including for defenses.</span>
      </div>
    </div>
  );
}

export function useLeagueReady() {
  const { data, sel } = usePerf();
  return useMemo(() => (data ? leagueSummaries(data, sel).size : 0), [data, sel]);
}
