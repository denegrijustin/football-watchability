import { Suspense, lazy, useMemo, type ReactNode } from "react";
import { useData } from "./data/useData";
import { DIVISIONS, type DivKey } from "./data/types";
import { VIEWS, useRoute, type ViewKey } from "./store";
import { Mark } from "./components/common";
import { dateLabel } from "./data/derive";

const views: Record<ViewKey, React.LazyExoticComponent<() => ReactNode>> = {
  rankings: lazy(() => import("./views/Rankings")),
  simulator: lazy(() => import("./views/Simulator")),
  ats: lazy(() => import("./views/Ats")),
  movement: lazy(() => import("./views/Movement")),
  team: lazy(() => import("./views/TeamView")),
  matchups: lazy(() => import("./views/Matchups")),
  compare: lazy(() => import("./views/Compare")),
  outliers: lazy(() => import("./views/Outliers")),
  conferences: lazy(() => import("./views/Conferences")),
  results: lazy(() => import("./views/Results")),
  accuracy: lazy(() => import("./views/Accuracy")),
  explorer: lazy(() => import("./views/Explorer")),
};

/** Which shared filters each view uses. */
const FILTERS: Record<ViewKey, { div?: boolean; all?: boolean; week?: boolean; conf?: boolean; q?: boolean }> = {
  rankings: { div: true, all: true, week: true, conf: true, q: true },
  simulator: { week: true },
  ats: {},
  movement: { div: true, week: false, conf: true, q: true },
  team: {},
  matchups: { div: true, week: true, conf: true, q: true },
  compare: { week: true },
  outliers: { div: true, week: true, conf: true, q: true },
  conferences: { div: true, week: true },
  results: { conf: true, q: true },
  accuracy: {},
  explorer: {},
};

export function SpPlusApp() {
  const { model, snapshot, loadError, retry } = useData();
  const [route, nav] = useRoute();
  const f = FILTERS[route.view];

  const confs = useMemo(() => {
    if (!model) return [];
    if (route.view === "matchups") return model.conferences.FBS;
    if (route.view === "results") return model.conferences.FBS;
    return route.div === "ALL" ? [] : model.conferences[route.div];
  }, [model, route.div, route.view]);


  const View = views[route.view];
  const week = route.week ?? model?.latest ?? 0;
  const compareTeams = model ? route.compare.map((id) => model.byId.get(id)).filter(Boolean) : [];

  return (
    <div className="app spp">
      <header className="bar">
        <div className="bar-in">
          <div className="bar-top">
            <span className="brand">CFB SP+ <small>SP+ ratings, simulator and against-the-spread tracker</small></span>
            <span className="grow" />
          </div>
          <nav className="tabs" role="tablist" aria-label="Views" onKeyDown={(e) => {
            const i = VIEWS.findIndex((v) => v.key === route.view);
            const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!d) return;
            const next = VIEWS[(i + d + VIEWS.length) % VIEWS.length];
            nav({ view: next.key });
            requestAnimationFrame(() => document.getElementById(`tab-${next.key}`)?.focus());
          }}>
            {VIEWS.map((v) => (
              <button key={v.key} id={`tab-${v.key}`} role="tab" type="button" className="tab" aria-selected={route.view === v.key} tabIndex={route.view === v.key ? 0 : -1} onClick={() => nav({ view: v.key })}>{v.label}</button>
            ))}
          </nav>
        </div>
      </header>

      {model && (f.div || f.week || f.conf || f.q) && (
        <div className="filters" role="group" aria-label="Filters">
          {f.div && (
            <div className="field">
              <span id="lbl-div">Division</span>
              <div className="seg" role="radiogroup" aria-labelledby="lbl-div">
                {[...(f.all ? (["ALL"] as const) : []), ...DIVISIONS].map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={route.div === d} onClick={() => nav({ div: d as DivKey | "ALL", conf: "" })}>{d === "ALL" ? "All 772" : d}</button>
                ))}
              </div>
            </div>
          )}
          {f.week && (
            <label className="field">
              <span>Week</span>
              <select className="ctl" value={week} onChange={(e) => nav({ week: Number(e.target.value) === model.latest ? null : Number(e.target.value) })}>
                {model.weeks.map((w) => <option key={w} value={w}>Week {w}{w === model.latest ? " (latest)" : ""}</option>)}
              </select>
            </label>
          )}
          {f.conf && confs.length > 0 && (
            <label className="field">
              <span>Conference</span>
              <select className="ctl" value={route.conf} onChange={(e) => nav({ conf: e.target.value })}>
                <option value="">All conferences</option>
                {confs.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          {f.q && (
            <label className="field">
              <span>Search teams</span>
              <input className="ctl" type="search" value={route.q} placeholder="Team name" onChange={(e) => nav({ q: e.target.value }, { replace: true })} />
            </label>
          )}
          {(route.conf || route.q) && <button type="button" className="btn ghost" style={{ alignSelf: "end" }} onClick={() => nav({ conf: "", q: "" })}>Clear</button>}
        </div>
      )}

      {compareTeams.length > 0 && (
        <div className="tray" aria-label="Teams selected for comparison">
          <span className="muted">Compare:</span>
          {compareTeams.map((t) => (
            <span className="chip" key={t!.id}>
              <Mark team={t} size={16} /> {t!.name}
              <button type="button" aria-label={`Remove ${t!.name} from comparison`} onClick={() => nav({ compare: route.compare.filter((x) => x !== t!.id) }, { replace: true })}>×</button>
            </span>
          ))}
          <button type="button" className="btn small" onClick={() => nav({ view: "compare" })}>Open comparison</button>
        </div>
      )}

      <main className="main" id="spp-main" role="tabpanel" aria-labelledby={`tab-${route.view}`}>
        {loadError && !model && <div className="note-box" role="alert">Could not load the SP+ data: {loadError} <button type="button" className="btn small" onClick={retry}>Try again</button></div>}
        {!model && !loadError && <div className="empty" role="status">Loading…</div>}
        {model && (
          <Suspense fallback={<div className="empty" role="status">Loading view…</div>}>
            <View />
          </Suspense>
        )}
      </main>

      <footer className="foot">
        {snapshot && model ? (
          <>
            Source: <b>{snapshot.source.title}</b> Google Sheet · Season 2026 · Weeks {model.weeks[0]}–{model.latest} · SP+ data updated {new Date(snapshot.fetchedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            {" · "}Games through {dateLabel(model.results.reduce((m, r) => (r.date > m ? r.date : m), ""))}
          </>
        ) : "Source: 2026 SP+ Google Sheet"}
      </footer>
    </div>
  );
}
