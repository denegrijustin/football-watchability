import { Suspense, lazy, type ReactNode } from "react";
import { NFL_VIEWS, useNflRoute, type NflView } from "./store";
import { useNfl } from "./useNfl";
import { ratingsAt } from "./model";
import { PerfProvider } from "../perf/data";
import { useNflAdapter } from "../perf/adapters";
import { PERF_VIEWS, isPerfKey } from "../perf/tabs";
import { PerfMenu } from "../perf/PerfMenu";
import { ViewMenu } from "../perf/ViewMenu";

const views: Record<Exclude<NflView, `p-${string}`>, React.LazyExoticComponent<() => ReactNode>> = {
  rankings: lazy(() => import("./views/Ratings")),
  simulator: lazy(() => import("./views/Simulator")),
  ats: lazy(() => import("./views/Ats")),
  matchups: lazy(() => import("./views/Matchups")),
  movement: lazy(() => import("./views/Movement")),
  standings: lazy(() => import("./views/Standings")),
  playresults: lazy(() => import("./views/PlayResults")),
  team: lazy(() => import("./views/TeamPage")),
};

const BASE_VIEWS = NFL_VIEWS.filter((v) => !isPerfKey(v.key));

export function NflApp() {
  const { data, error, retry } = useNfl();
  const [route, nav] = useNflRoute();
  const perf = isPerfKey(route.view);
  const View = perf ? PERF_VIEWS[route.view as keyof typeof PERF_VIEWS] : views[route.view as Exclude<NflView, `p-${string}`>];
  const week = route.week ?? data?.ratingsThroughWeek ?? 1;
  const groups = data ? ["", "AFC", "NFC", ...[...new Set(Object.values(data.teams).map((t) => t.div))].sort()] : [];
  const filters = route.view === "rankings" || route.view === "movement" || route.view === "playresults";
  void ratingsAt;
  return (
    <div className="app spp">
      <header className="bar">
        <div className="bar-in">
          <div className="bar-top"><span className="brand">NFL+ <small>EPA-based team ratings, simulator and against-the-spread tracker</small></span><span className="grow" /></div>
          <div className="tabrow">
          <ViewMenu views={BASE_VIEWS} view={route.view} onPick={(key) => nav({ view: key as NflView })} />
          <nav className="tabs" role="tablist" aria-label="NFL views" onKeyDown={(e) => {
            const i = BASE_VIEWS.findIndex((v) => v.key === route.view);
            const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!d || i < 0) return;
            const next = BASE_VIEWS[(i + d + BASE_VIEWS.length) % BASE_VIEWS.length];
            nav({ view: next.key });
            requestAnimationFrame(() => (e.currentTarget.querySelector(`#nfl-tab-${next.key}`) as HTMLElement | null)?.focus());
          }}>
            {BASE_VIEWS.map((v, i) => (
              <button key={v.key} id={`nfl-tab-${v.key}`} role="tab" type="button" className="tab" aria-selected={route.view === v.key} tabIndex={route.view === v.key || (isPerfKey(route.view) && i === 0) ? 0 : -1} onClick={() => nav({ view: v.key })}>{v.label}</button>
            ))}
          </nav>
          <PerfMenu view={route.view} onPick={(key) => nav({ view: key })} />
          </div>
        </div>
      </header>

      {data && (filters || route.view === "matchups") && (
        <div className="filters" role="group" aria-label="Filters">
          <label className="field"><span>Week</span>
            <select className="ctl" value={week} onChange={(e) => nav({ week: Number(e.target.value) === data.ratingsThroughWeek ? null : Number(e.target.value) })}>
              {Array.from({ length: route.view === "matchups" ? 18 : data.ratingsThroughWeek }, (_, i) => i + 1).map((w) => <option key={w} value={w}>Week {w}{w === data.ratingsThroughWeek ? " (latest)" : ""}</option>)}
            </select>
          </label>
          {filters && (
            <label className="field"><span>Group</span>
              <select className="ctl" value={route.group} onChange={(e) => nav({ group: e.target.value })}>
                {groups.map((g) => <option key={g} value={g}>{g || "All 32 teams"}</option>)}
              </select>
            </label>
          )}
          {route.view === "rankings" && (
            <label className="field"><span>Search teams</span>
              <input className="ctl" type="search" value={route.q} placeholder="Team name" onChange={(e) => nav({ q: e.target.value })} />
            </label>
          )}
        </div>
      )}

      <main className="main" role="tabpanel" aria-labelledby={`nfl-tab-${route.view}`}>
        {error && !data && <div className="note-box" role="alert">Could not load the NFL data: {error} <button type="button" className="btn small" onClick={retry}>Try again</button></div>}
        {!data && !error && <div className="empty" role="status">Loading…</div>}
        {data && <Suspense fallback={<div className="empty" role="status">Loading view…</div>}>{perf ? <PerfProvider league="nfl" useAdapter={useNflAdapter}><View /></PerfProvider> : <View />}</Suspense>}
      </main>

      <footer className="foot">
        {data ? <>Source: <b>nflverse</b> ({data.source.license}) · Season {data.season} · Ratings through week {data.ratingsThroughWeek} · {data.games.filter((g) => g.type === "REG" && g.aS != null).length} games played · Data updated {new Date(data.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</> : "Source: nflverse"}
      </footer>
    </div>
  );
}
