import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { geoPath } from "d3-geo";
import { feature, mesh, neighbors } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import {
  buildWeekCache,
  conferenceCounts,
  conquestPath,
  conferenceStatus,
  largestMass,
  standings,
  type ConfCount,
  type ImperialismData,
  type ImpLeague,
  type ImpTeam,
  type Layer,
} from "../imperialism";
import { logos } from "../data";
import { fetchData } from "../data/load";
import "../imperialism.css";

/* ------------------------------------------------------------------ geometry */

type Topo = Topology<{
  counties: GeometryCollection<{ name?: string }>;
  states: GeometryCollection<{ name?: string }>;
  nation: GeometryCollection;
}>;

interface Geo {
  /** One entry per rendered county (topology order). `li` is the index into data.counties (-1 = unknown). */
  feats: { id: string; d: string; li: number; name: string; state: string }[];
  /** Per data-county index: path centroid in viewBox coordinates. */
  centroid: ([number, number] | null)[];
  /** Per data-county index: neighbouring data-county indexes. */
  adjacency: number[][];
  stateMesh: string;
  nation: string;
}

/** Everything geometric, computed once per (topology, county list). The shapes are pre-projected: no projection. */
function buildGeo(topo: Topo, countyIds: string[]): Geo {
  const path = geoPath();
  const idxOf = new Map(countyIds.map((id, i) => [id, i]));
  const geoms = topo.objects.counties.geometries;
  const fc = feature(topo, topo.objects.counties);
  const stateFc = feature(topo, topo.objects.states);
  const stateName = new Map(stateFc.features.map((f) => [String(f.id), f.properties?.name ?? ""]));

  const centroid: ([number, number] | null)[] = countyIds.map(() => null);
  const feats = fc.features.map((f) => {
    const id = String(f.id);
    const li = idxOf.get(id) ?? -1;
    if (li >= 0) {
      const c = path.centroid(f);
      centroid[li] = Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null;
    }
    return { id, d: path(f) ?? "", li, name: f.properties?.name ?? id, state: stateName.get(id.slice(0, 2)) ?? "" };
  });

  // neighbors() works in topology geometry order; translate into data-county index space.
  const adjacency: number[][] = countyIds.map(() => []);
  neighbors(geoms).forEach((ns, g) => {
    const a = feats[g]?.li ?? -1;
    if (a < 0) return;
    for (const n of ns) {
      const b = feats[n]?.li ?? -1;
      if (b >= 0) adjacency[a].push(b);
    }
  });

  return {
    feats,
    centroid,
    adjacency,
    stateMesh: path(mesh(topo, topo.objects.states, (a, b) => a !== b)) ?? "",
    nation: path(mesh(topo, topo.objects.nation)) ?? "",
  };
}

/* ------------------------------------------------------------- memo'd county */

interface CountyProps {
  id: string;
  g: number; // feature index, read back by the delegated handlers
  d: string;
  fill: string;
  dim: boolean;
  flash: boolean;
  label: string;
}

/** Only re-renders when its own fill / dim / flash / label change, so a week change touches just the moved counties. */
const CountyPath = memo(function CountyPath({ id, g, d, fill, dim, flash, label }: CountyProps) {
  return (
    <path
      d={d}
      data-g={g}
      data-testid={`imp-county-${id}`}
      className={`imp-county${dim ? " imp-dim" : ""}${flash ? " imp-flash" : ""}`}
      style={{ fill }}
      tabIndex={0}
      role="button"
      aria-label={label}
    >
      <title>{label}</title>
    </path>
  );
});

/* ------------------------------------------------------------------- small UI */

/** The site's own copy of a team's logo when it has one (same file the cards use), else ESPN's. */
const logoSrc = (t: ImpTeam): string | null => (t.logoId && logos[t.logoId]) || t.logo || null;

function TeamLogo({ t, size = 22 }: { t: ImpTeam | undefined; size?: number }) {
  if (!t) return null;
  return logoSrc(t) ? (
    <img className="imp-logo" src={logoSrc(t)!} alt="" width={size} height={size} loading="lazy" decoding="async" />
  ) : (
    <span className="imp-chip" style={{ background: t.color, width: size, height: size }} aria-hidden="true">
      {t.abbr.slice(0, 2)}
    </span>
  );
}

const GEO_URL = `${import.meta.env.BASE_URL}geo/counties-albers-10m.json`;
const STEP_MS = 700;
const FALLBACK = "#5b6b78";

type CfbMap = "national" | "conference";
type NflMap = "full" | "AFC" | "NFC";

const CAPTIONS: Record<string, string> = {
  national:
    "Every county starts with the team whose stadium is nearest. When a team loses, all of its land goes to the winner; a landless team that wins takes all of its opponent's land.",
  conference:
    "The national run, coloured by conference. Striped counties have been captured by a team from outside the conference they started in (still painted in their new owner's colors); plain ones are still held in-conference.",
  full: "All 32 teams. Every county starts with the nearest stadium's team; the loser's land goes to the winner.",
  AFC: "AFC only: counties go to the nearest AFC stadium, and only AFC-vs-AFC games move land.",
  NFC: "NFC only: counties go to the nearest NFC stadium, and only NFC-vs-NFC games move land.",
};

/* ------------------------------------------------------------------ component */

export function ImperialismMap({ defaultLeague }: { defaultLeague: "NFL" | "CFB" }) {
  const [data, setData] = useState<ImperialismData | null>(null);
  const [topo, setTopo] = useState<Topo | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [league, setLeague] = useState<ImpLeague>(defaultLeague);
  const [cfbMap, setCfbMap] = useState<CfbMap>("national");
  const [nflMap, setNflMap] = useState<NflMap>("full");
  const [pick, setPick] = useState<Record<string, number>>({}); // week index per layer; unset = latest
  const [playing, setPlaying] = useState(false);
  const [showLogos, setShowLogos] = useState(false);
  const [texture, setTexture] = useState(true); // a faint copy of the owner's logo tiled across its counties
  const [confSel, setConfSel] = useState("all");
  const [selected, setSelected] = useState<number | null>(null); // feature index
  const [showAll, setShowAll] = useState(false);

  const cardRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  /* ---- load data + topology (retry bumps `attempt`) ---- */
  useEffect(() => {
    let live = true;
    setFailed(false);
    Promise.all([
      fetchData<ImperialismData>("imperialism"),
      fetch(GEO_URL).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Topo>;
      }),
    ])
      .then(([m, t]) => {
        if (!live) return;
        setData(m);
        setTopo(t);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  const geo = useMemo(() => (data && topo ? buildGeo(topo, data.counties) : null), [data, topo]);

  /* ---- active layer ---- */
  const mapKey = league === "CFB" ? cfbMap : nflMap;
  const key = `${league}:${mapKey}`;
  const teamList = data?.teams[league];
  const teamById = useMemo(() => new Map((teamList ?? []).map((t) => [t.id, t])), [teamList]);

  // `view` = what is coloured; `ledgerLayer` = the layer whose ledger/home drives ownership.
  const view = useMemo(() => {
    if (!data) return null;
    if (league === "CFB") {
      const { national, conference } = data.maps.CFB;
      return cfbMap === "conference" ? { ledgerLayer: national, conf: conference, weeks: conference.weeks } : { ledgerLayer: national, conf: null, weeks: national.weeks };
    }
    const layer: Layer = data.maps.NFL[nflMap];
    return { ledgerLayer: layer, conf: null, weeks: layer.weeks };
  }, [data, league, cfbMap, nflMap]);

  const cache = useMemo(() => (view ? buildWeekCache(view.ledgerLayer) : null), [view]);

  const weeks = view && view.weeks.length ? view.weeks : [{ n: 0, label: "Start" }];
  const last = weeks.length - 1;
  const empty = !!view && view.ledgerLayer.ledger.length === 0;
  const wi = empty ? 0 : Math.min(pick[key] ?? last, last);
  const week = weeks[wi].n;
  const setWi = useCallback((v: number) => setPick((p) => ({ ...p, [key]: v })), [key]);

  // Auto-advance: one step per STEP_MS, stop at the end.
  useEffect(() => {
    if (!playing) return;
    if (wi >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setWi(wi + 1), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, wi, last, setWi]);
  useEffect(() => setPlaying(false), [key]);
  useEffect(() => setSelected(null), [key]);

  const owners = useMemo(() => (cache ? cache.at(week) : []), [cache, week]);

  /* ---- counties changed in this week (flash) ---- */
  const changed = useMemo(() => {
    const s = new Set<number>();
    if (!view || wi === 0) return s;
    for (const t of view.ledgerLayer.ledger) if (t.week === week) for (const c of t.transferred) s.add(c);
    return s;
  }, [view, wi, week]);

  const native = view?.conf?.native ?? null;
  const confOf = useCallback((id: string) => teamById.get(id)?.conf ?? null, [teamById]);

  /* ---- per-county display state ---- */
  const labels = useMemo(() => {
    if (!geo) return [];
    return geo.feats.map((f) => {
      const o = f.li >= 0 ? teamById.get(owners[f.li]) : undefined;
      let s = `${f.name}${f.state ? `, ${f.state}` : ""}: ruled by ${o?.name ?? "nobody"}`;
      if (native && f.li >= 0 && o && conferenceStatus(native[f.li], o.conf) === "captured") s += ` (captured from ${native[f.li]})`;
      return s;
    });
  }, [geo, owners, teamById, native]);

  const fills = useMemo(() => {
    if (!geo) return [];
    return geo.feats.map((f) => {
      if (f.li < 0) return FALLBACK;
      const o = teamById.get(owners[f.li]);
      if (!o) return FALLBACK;
      // Every county is painted in its current owner's color; land held by a team from another conference than its
      // home team's is also striped, so it still reads as owned by that team.
      const captured = !!native && conferenceStatus(native[f.li], o.conf) === "captured";
      if (!o.color) return FALLBACK;
      if (texture && logoSrc(o)) return `url(#${captured ? "imp-c-" : "imp-t-"}${o.id})`;
      return captured ? `url(#imp-s-${o.id})` : o.color;
    });
  }, [geo, owners, teamById, native, texture]);

  /* ---- fill patterns for the teams that hold land this week ---- */
  const patternTeams = useMemo(() => [...new Set(owners)].map((id) => teamById.get(id)).filter((t): t is ImpTeam => !!t && !!t.color), [owners, teamById]);

  /* ---- standings ---- */
  const stand = useMemo(() => (view ? standings(view.ledgerLayer, owners) : null), [view, owners]);

  /* ---- conference table ---- */
  const confRows = useMemo(() => {
    if (!view?.conf) return [] as [string, ConfCount][];
    const w = view.conf.weeks.find((x) => x.n === week);
    const by = w?.byConf ?? conferenceCounts(view.conf.native, owners, confOf);
    return Object.entries(by).sort((a, b) => b[1].native - a[1].native);
  }, [view, week, owners, confOf]);

  /* ---- logo overlay: largest contiguous mass per team, memoised per week ---- */
  const logoMarks = useMemo(() => {
    if (!showLogos || !geo || !stand) return [];
    const out: { t: ImpTeam; x: number; y: number; size: number }[] = [];
    for (const row of stand.ranked) {
      const t = teamById.get(row.team);
      if (!t || !logoSrc(t) || row.count < 3) continue; // tiny holdings: hidden
      const mass = largestMass(owners, geo.adjacency, row.team);
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const c of mass) {
        const p = geo.centroid[c];
        if (p) {
          sx += p[0];
          sy += p[1];
          n++;
        }
      }
      if (!n) continue;
      const size = Math.max(14, Math.min(60, 7 * Math.sqrt(row.count)));
      out.push({ t, x: sx / n, y: sy / n, size });
    }
    return out;
  }, [showLogos, geo, stand, owners, teamById]);

  /* ---- card open / close ---- */
  const open = useCallback((g: number) => {
    returnFocus.current = g;
    setSelected(g);
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    const g = returnFocus.current;
    if (g != null) requestAnimationFrame(() => svgRef.current?.querySelector<SVGElement>(`[data-g="${g}"]`)?.focus());
  }, []);

  useEffect(() => {
    if (selected == null) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  // Delegated handlers keep 3,142 paths free of per-element closures.
  const gOf = (e: { target: EventTarget }) => {
    const v = (e.target as Element).getAttribute?.("data-g");
    return v == null ? null : Number(v);
  };
  const onClick = (e: MouseEvent) => {
    const g = gOf(e);
    if (g != null) open(g);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const g = gOf(e);
    if (g == null) return;
    e.preventDefault();
    open(g);
  };

  /* ------------------------------------------------------------------ render */

  const sel = selected != null && geo ? geo.feats[selected] : null;
  const selTitle = labels[selected ?? -1];

  const body = (() => {
    if (failed)
      return (
        <div className="imp-status" role="alert">
          <p>Could not load the map data.</p>
          <button type="button" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </button>
        </div>
      );
    if (!data || !topo || !geo || !view || !stand) return <div className="imp-status" role="status">Loading map...</div>;

    const shown = showAll ? stand.ranked : stand.ranked.slice(0, 10);
    return (
      <div className="imp-body">
        <div className="imp-mapcol">
          <svg
            ref={svgRef}
            className="imp-svg"
            data-testid="imp-map"
            viewBox="0 0 975 610"
            role="group"
            aria-label={`Imperialism map, ${weeks[wi].label}`}
            onClick={onClick}
            onKeyDown={onKeyDown}
          >
            <defs>
              {patternTeams.map((t) => {
                const src = logoSrc(t);
                // A 34-unit tile: the team color, the logo at low opacity, and (captured land) diagonal stripes on top.
                const tile = (id: string, stripes: boolean) => (
                  <pattern key={id} id={id} width="34" height="34" patternUnits="userSpaceOnUse">
                    <rect width="34" height="34" fill={t.color} />
                    {src && <image href={src} x="6" y="6" width="22" height="22" opacity="0.2" preserveAspectRatio="xMidYMid meet" />}
                    {stripes && <rect width="34" height="34" fill="url(#imp-stripes)" />}
                  </pattern>
                );
                return (
                  <g key={t.id}>
                    {tile(`imp-t-${t.id}`, false)}
                    {tile(`imp-c-${t.id}`, true)}
                    <pattern id={`imp-s-${t.id}`} width="4" height="4" patternUnits="userSpaceOnUse">
                      <rect width="4" height="4" fill={t.color} />
                      <rect width="4" height="4" fill="url(#imp-stripes)" />
                    </pattern>
                  </g>
                );
              })}
              <pattern id="imp-stripes" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" strokeOpacity="0.38" strokeWidth="1.5" />
              </pattern>
            </defs>
            <g>
              {geo.feats.map((f, g) => (
                <CountyPath
                  key={f.id}
                  id={f.id}
                  g={g}
                  d={f.d}
                  fill={fills[g]}
                  dim={!!native && confSel !== "all" && f.li >= 0 && native[f.li] !== confSel}
                  flash={f.li >= 0 && changed.has(f.li)}
                  label={labels[g]}
                />
              ))}
            </g>
            <path className="imp-states" d={geo.stateMesh} />
            <path className="imp-nation" d={geo.nation} />
            {sel && <path className="imp-ring" d={sel.d} />}
            {showLogos && (
              <g className="imp-logos" pointerEvents="none">
                {logoMarks.map((m) => (
                  <g key={m.t.id}>
                    <circle cx={m.x} cy={m.y} r={m.size / 2 + 1.5} className="imp-logo-bg" />
                    <image href={logoSrc(m.t) ?? undefined} x={m.x - m.size / 2} y={m.y - m.size / 2} width={m.size} height={m.size} />
                  </g>
                ))}
              </g>
            )}
          </svg>
          {native && <p className="imp-legend"><span className="imp-swatch" /> Striped: held by a team from a different conference than its home team</p>}
          <p className="imp-caption">{CAPTIONS[mapKey]}</p>
        </div>

        <div className="imp-side">
          {sel && selected != null && (
            <CountyCard
              refEl={cardRef}
              title={selTitle}
              name={sel.name}
              state={sel.state}
              li={sel.li}
              layer={view.ledgerLayer}
              week={week}
              owners={owners}
              teamById={teamById}
              onClose={close}
            />
          )}

          {view.conf && confRows.length > 0 && (
            <section className="imp-panel">
              <h3>Conferences</h3>
              <div className="imp-tablewrap">
                <table className="imp-table">
                  <thead>
                    <tr>
                      <th scope="col">Conference</th>
                      <th scope="col">Native</th>
                      <th scope="col">Held</th>
                      <th scope="col">Captured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confRows.map(([name, c]) => (
                      <tr key={name} className={confSel === name ? "imp-row-sel" : undefined}>
                        <th scope="row">{name}</th>
                        <td>{c.native}</td>
                        <td>{c.held}</td>
                        <td>{c.captured}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="imp-panel" data-testid="imp-standings">
            <h3>Top empires{empty ? "" : `, ${weeks[wi].label}`}</h3>
            <ol className="imp-rank">
              {shown.map((r, i) => {
                const t = teamById.get(r.team);
                return (
                  <li key={r.team}>
                    <span className="imp-pos">{i + 1}</span>
                    <TeamLogo t={t} />
                    <span className="imp-tname">{t?.name ?? r.team}</span>
                    <span className="imp-num">
                      {r.count} <small>{r.pct.toFixed(1)}%</small>
                    </span>
                  </li>
                );
              })}
            </ol>
            {stand.ranked.length > 10 && (
              <button type="button" className="imp-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show top 10" : `Show all ${stand.ranked.length}`}
              </button>
            )}
            {stand.landless.length > 0 && (
              <details className="imp-landless">
                <summary>Landless teams ({stand.landless.length})</summary>
                <ul>
                  {stand.landless.map((id) => {
                    const t = teamById.get(id);
                    return (
                      <li key={id}>
                        <TeamLogo t={t} size={18} />
                        {t?.name ?? id}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </section>
        </div>
      </div>
    );
  })();

  const ready = !!(data && topo && view);
  const confChoices = view?.conf ? [...new Set(view.conf.native)].sort() : [];

  return (
    <section className="imp" aria-label="Imperialism map">
      <div className="imp-controls">
        <div className="segmented" role="group" aria-label="League">
          <button type="button" aria-pressed={league === "CFB"} onClick={() => setLeague("CFB")}>
            College
          </button>
          <button type="button" aria-pressed={league === "NFL"} onClick={() => setLeague("NFL")}>
            NFL
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Map">
          {league === "CFB" ? (
            <>
              <button type="button" aria-pressed={cfbMap === "national"} onClick={() => setCfbMap("national")}>
                National
              </button>
              <button type="button" aria-pressed={cfbMap === "conference"} onClick={() => setCfbMap("conference")}>
                Conference
              </button>
            </>
          ) : (
            (["full", "AFC", "NFC"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={nflMap === m} onClick={() => setNflMap(m)}>
                {m === "full" ? "Full NFL" : m}
              </button>
            ))
          )}
        </div>
        <label className="imp-check">
          <input type="checkbox" checked={showLogos} onChange={(e) => setShowLogos(e.target.checked)} />
          Team logos
        </label>
        <label className="imp-check">
          <input type="checkbox" checked={texture} onChange={(e) => setTexture(e.target.checked)} />
          Logo texture
        </label>
        {ready && view?.conf && (
          <label className="imp-select">
            <span className="sr-only">Conference</span>
            <select value={confSel} onChange={(e) => setConfSel(e.target.value)} aria-label="Highlight conference">
              <option value="all">All conferences</option>
              {confChoices.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {ready && (
        <div className="imp-time">
          {empty ? (
            <p className="imp-note">
              <b>Start</b> · Results appear here as games are played.
            </p>
          ) : (
            <>
              <div className="imp-transport">
                <button type="button" aria-label="Previous week" disabled={wi === 0} onClick={() => setWi(wi - 1)}>
                  ◀
                </button>
                <button
                  type="button"
                  className="imp-play"
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={() => {
                    if (playing) setPlaying(false);
                    else {
                      if (wi >= last) setWi(0);
                      setPlaying(true);
                    }
                  }}
                >
                  {playing ? "❚❚ Pause" : "▶ Play"}
                </button>
                <button type="button" aria-label="Next week" disabled={wi >= last} onClick={() => setWi(wi + 1)}>
                  ▶
                </button>
                <output className="imp-weeklabel" aria-live="polite">
                  {weeks[wi].label}
                  {wi > 0 && <small> · {changed.size} counties changed hands</small>}
                </output>
              </div>
              <input
                className="imp-slider"
                data-testid="imp-slider"
                type="range"
                min={0}
                max={last}
                step={1}
                value={wi}
                aria-label="Week"
                aria-valuetext={weeks[wi].label}
                onChange={(e) => {
                  setPlaying(false);
                  setWi(Number(e.target.value));
                }}
              />
              <div className="imp-ends" aria-hidden="true">
                <span>{weeks[0].label}</span>
                <span>{weeks[last].label}</span>
              </div>
            </>
          )}
        </div>
      )}

      {body}
    </section>
  );
}

/* ---------------------------------------------------------------- county card */

function CountyCard(props: {
  refEl: React.RefObject<HTMLElement | null>;
  title: string;
  name: string;
  state: string;
  li: number;
  layer: Layer;
  week: number;
  owners: string[];
  teamById: Map<string, ImpTeam>;
  onClose: () => void;
}) {
  const { li, layer, week, owners, teamById } = props;
  const nm = (id: string | undefined) => (id ? teamById.get(id) : undefined);
  const steps = useMemo(() => (li >= 0 ? conquestPath(layer, li, week) : []), [li, layer, week]);
  const home = nm(li >= 0 ? layer.home[li] : undefined);
  const ruler = nm(li >= 0 ? owners[li] : undefined);
  const ab = (id: string | undefined) => nm(id)?.abbr ?? id ?? "?";

  return (
    <aside className="imp-card" data-testid="imp-card" ref={props.refEl} role="dialog" aria-label={`${props.name} county details`}>
      <header>
        <div>
          <h3>{props.name}</h3>
          <p className="imp-sub">{props.state}</p>
        </div>
        <button type="button" className="imp-close" onClick={props.onClose} aria-label="Close county card" autoFocus>
          ✕
        </button>
      </header>
      <dl className="imp-facts">
        <dt>Original home team</dt>
        <dd>
          <TeamLogo t={home} size={20} /> {home?.name ?? "Unknown"}
        </dd>
        <dt>Current ruler</dt>
        <dd>
          <TeamLogo t={ruler} size={20} /> {ruler?.name ?? "Unknown"}
        </dd>
      </dl>
      <h4>Conquest path</h4>
      <ol className="imp-path">
        {steps.map((s, i) => (
          <li key={i}>
            {s.kind === "home" ? (
              <>Week 0: {ab(s.owner)} (home)</>
            ) : (
              <>
                Week {s.week}: {ab(s.winner)} beat {ab(s.loser)} → {ab(s.owner)}
                {s.score && <small> ({s.score})</small>}
              </>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}

export default ImperialismMap;
