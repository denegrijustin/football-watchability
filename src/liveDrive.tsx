import { useEffect, useRef, useState } from "react";
import { teamColor } from "./data";

/** The slice of /api/game (see functions/api/game.js) the drive animation uses. */
type Summary = {
  status: { state: "pre" | "in" | "post" };
  teams: { id: string; abbr: string }[];
  situation: { text: string; possession: string | null; toGo: number | null; redZone: boolean; lastPlay: string } | null;
  drives: { team: string; from: number | null; to: number | null; yards: number; plays: number; result: string; score: boolean; time: string; current: boolean }[];
};

const PATHS: Record<string, string> = { NFL: "nfl", CFB: "college-football" };
const POLL_MS = 15_000;
const cache = new Map<string, { at: number; data: Summary | null }>();

async function fetchSummary(league: string, id: string): Promise<Summary | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < POLL_MS - 1000) return hit.data;
  let data: Summary | null = null;
  try {
    const r = await fetch(`/api/game?league=${PATHS[league]}&event=${id}`);
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) data = await r.json();
  } catch {
    /* offline: keep what we had */
  }
  if (data || !hit) cache.set(id, { at: Date.now(), data });
  return data ?? hit?.data ?? null;
}

/**
 * The live game summary for one card. It is fetched only while the card is on screen and the tab is visible, every
 * 15 seconds (the edge cache holds it for 15), so thirteen live cards don't mean thirteen constant requests.
 */
function useSummary(league: string, id: string, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Summary | null>(() => cache.get(id)?.data ?? null);
  const [loaded, setLoaded] = useState(() => cache.has(id));
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let onScreen = typeof IntersectionObserver === "undefined";
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      clearTimeout(timer);
      if (stop || !onScreen || document.hidden) return;
      const next = await fetchSummary(league, id);
      if (stop) return;
      if (next) setData(next);
      setLoaded(true);
      timer = setTimeout(tick, POLL_MS);
    };
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) void tick();
      else clearTimeout(timer);
    });
    io?.observe(el);
    const visible = () => !document.hidden && void tick();
    document.addEventListener("visibilitychange", visible);
    if (onScreen) void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
      io?.disconnect();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [league, id, active]);
  return { ref, data, loaded };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
/** Yards from the left goal line (away team's end zone on the left) for a spot measured from the offense's own goal line. */
const spot = (fromOwn: number, awayOffense: boolean) => (awayOffense ? clamp(fromOwn) : 100 - clamp(fromOwn));

/**
 * The live drive as a small animated field: the offense's drive path marches toward the goal, the ball slides to each new
 * spot, the first-down line and the red zone show when they apply. Static for visitors who ask for reduced motion.
 */
export function LiveDrive({ espnId, league, teams }: { espnId: string; league: string; teams: { espnId?: string | null; abbr?: string; name: string; color?: string | null }[] }) {
  const { ref, data, loaded } = useSummary(league, espnId, true);
  const [away, home] = teams;
  const ids = [away.espnId ?? "", home.espnId ?? ""];
  const colors = [teamColor(away.color) ?? "#c1403d", teamColor(home.color) ?? "#2f7de1"];
  const live = data?.status.state === "in";
  const cur = data?.drives.find((d) => d.current) ?? null;
  const sit = data?.situation ?? null;
  const possession = sit?.possession ?? cur?.team ?? null;
  const side = possession === ids[0] ? 0 : possession === ids[1] ? 1 : -1;

  // Nothing to draw before the first response, between drives (kickoffs, timeouts) or once the game ends.
  const drawable = live && side >= 0 && (sit?.toGo != null || cur?.to != null);
  if (!drawable)
    return (
      <div ref={ref} className={`drive-live${loaded ? " empty" : " loading"}`} aria-hidden={!loaded || undefined}>
        {loaded && live ? <p className="drive-cap">Waiting for the next snap…</p> : null}
      </div>
    );

  const awayOffense = side === 0;
  const ballFromOwn = sit?.toGo != null ? 100 - sit.toGo : (cur?.to ?? 0);
  const startFromOwn = cur?.from ?? ballFromOwn;
  const ball = spot(ballFromOwn, awayOffense);
  const start = spot(startFromOwn, awayOffense);
  const dir = awayOffense ? 1 : -1;
  const m = /&\s*(\d+)/.exec(sit?.text ?? "");
  const toFirst = m ? Number(m[1]) : null;
  const firstDown = toFirst != null ? clamp(ball + dir * toFirst) : null;
  const goal = awayOffense ? 100 : 0;
  const abbr = data!.teams.find((t) => t.id === possession)?.abbr ?? "";
  const label = `${abbr} ${sit?.text ? sit.text : "driving"}`;
  const stats = cur ? `${cur.plays} play${cur.plays === 1 ? "" : "s"} · ${cur.yards} yd${cur.yards === 1 ? "" : "s"}${cur.time ? ` · ${cur.time}` : ""}` : "";
  // The last few finished drives sit faintly behind it.
  const past = data!.drives.filter((d) => !d.current && d.from != null && d.to != null).slice(-3);
  const X = (yd: number) => 10 + yd; // 10-yard end zones either side

  return (
    <div ref={ref} className="drive-live" role="img" aria-label={`Live drive: ${label}. ${stats}`}>
      <svg viewBox="0 0 120 18" className="drive-svg" aria-hidden="true">
        <rect x="0" y="0" width="120" height="18" className="df-turf" />
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={10 + i * 10} y="0" width="10" height="18" className={i % 2 ? "df-stripe" : "df-stripe alt"} />
        ))}
        <rect x="0" y="0" width="10" height="18" fill={colors[0]} opacity="0.55" />
        <rect x="110" y="0" width="10" height="18" fill={colors[1]} opacity="0.55" />
        {sit?.redZone && <rect x={awayOffense ? X(80) : X(0)} y="0" width="20" height="18" className="df-red" />}
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={10 + i * 10} x2={10 + i * 10} y1="0" y2="18" className={i === 5 ? "df-line mid" : "df-line"} />
        ))}
        {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((n, i) => (
          <text key={i} x={20 + i * 10} y="16.6" className="df-num" textAnchor="middle">{n * 10}</text>
        ))}
        {past.map((d, i) => {
          const a = spot(d.from!, d.team === ids[0]);
          const b = spot(d.to!, d.team === ids[0]);
          const c = colors[d.team === ids[0] ? 0 : 1];
          return <line key={i} x1={X(a)} x2={X(b)} y1={3 + i * 1.8} y2={3 + i * 1.8} stroke={c} className={`df-past${d.score ? " score" : ""}`} />;
        })}
        {firstDown != null && <line x1={X(firstDown)} x2={X(firstDown)} y1="0" y2="18" className="df-first" />}
        <line x1={X(goal)} x2={X(goal)} y1="0" y2="18" className="df-goal" />
        <line x1={X(start)} x2={X(ball)} y1="9" y2="9" stroke={colors[side]} className="df-path" />
        <line x1={X(start)} x2={X(ball)} y1="9" y2="9" className="df-flow" />
        <line x1={X(start)} x2={X(start)} y1="6" y2="12" stroke={colors[side]} className="df-start" />
        <g className="df-ball" style={{ transform: `translateX(${X(ball)}px)` }}>
          <line x1="0" x2="0" y1="0" y2="18" className="df-los" />
          <circle cx="0" cy="9" r="2.8" className="df-pulse" stroke={colors[side]} />
          <ellipse cx="0" cy="9" rx="2" ry="1.25" className="df-pigskin" />
        </g>
      </svg>
      <p className="drive-cap">
        <span className="drive-dot" aria-hidden="true" />
        <b>{label}</b>
        {stats && <span> · {stats}</span>}
      </p>
    </div>
  );
}
