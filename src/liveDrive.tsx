import { useEffect, useRef, useState } from "react";
import { logos, teamColor } from "./data";
import { FootballIcon } from "./live";

/** The slice of /api/game (see functions/api/game.js) the drive animation uses. */
type Summary = {
  status: { state: "pre" | "in" | "post" };
  teams: { id: string; abbr: string }[];
  situation: { text: string; possession: string | null; toGo: number | null; redZone: boolean; lastPlay: string } | null;
  drives: { team: string; period?: number | null; clock?: string; from: number | null; to: number | null; yards: number; plays: number; result: string; score: boolean; time: string; current: boolean }[];
  /** Every snap of the drive in progress (older cached responses may not have it). */
  curPlays?: { down: string; text: string; yards: number; period: number | null; clock: string; kind: string; score: boolean; turnover: boolean }[];
};
export type FieldTeam = { espnId?: string | null; abbr?: string; name: string; color?: string | null; logoId?: string };

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
/** "ATL 34" / "50" / "SEA 35": a spot measured from the offense's own goal line, named the way the broadcast does. */
const spotName = (fromOwn: number, own: string, opp: string) => (fromOwn === 50 ? "50" : fromOwn < 50 ? `${own} ${Math.round(fromOwn)}` : `${opp} ${Math.round(100 - fromOwn)}`);
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * The live field: who has the ball and where it is, where the drive started and how far it has come, the line to gain, and
 * the plays of the drive in progress. Shown on live cards (compact, plays folded away) and in the Game Center.
 * Static for visitors who ask for reduced motion.
 */
export function FieldView({ data, teams, variant, rootRef }: { data: Summary | null; teams: FieldTeam[]; variant: "card" | "center"; rootRef?: React.Ref<HTMLDivElement> }) {
  const [away, home] = teams;
  const ids = [away.espnId ?? "", home.espnId ?? ""];
  const colors = [teamColor(away.color) ?? "#c1403d", teamColor(home.color) ?? "#2f7de1"];
  const live = data?.status.state === "in";
  const cur = data?.drives.find((d) => d.current) ?? null;
  const sit = data?.situation ?? null;
  const possession = sit?.possession ?? cur?.team ?? null;
  const side = possession === ids[0] ? 0 : possession === ids[1] ? 1 : -1;
  const drawable = !!data && live && side >= 0 && (sit?.toGo != null || cur?.to != null);
  if (!drawable) return null;

  const awayOffense = side === 0;
  const own = teams[side].abbr ?? teams[side].name;
  const opp = teams[1 - side].abbr ?? teams[1 - side].name;
  const ballFromOwn = sit?.toGo != null ? 100 - sit.toGo : (cur?.to ?? 0);
  const startFromOwn = cur?.from ?? ballFromOwn;
  const ball = spot(ballFromOwn, awayOffense);
  const start = spot(startFromOwn, awayOffense);
  const dir = awayOffense ? 1 : -1;
  const m = /&\s*(\d+)/.exec(sit?.text ?? "");
  const toFirst = m ? Number(m[1]) : null;
  const firstDown = toFirst != null ? clamp(ball + dir * toFirst) : null;
  const goal = awayOffense ? 100 : 0;
  const abbr = data.teams.find((t) => t.id === possession)?.abbr ?? own;
  const label = `${abbr} ${sit?.text ? sit.text : "driving"}`;
  const stats = cur ? `${cur.plays} play${cur.plays === 1 ? "" : "s"} · ${cur.yards} yd${cur.yards === 1 ? "" : "s"}${cur.time ? ` · ${cur.time}` : ""}` : "";
  const startedAt = `${spotName(startFromOwn, own, opp)}${cur?.period ? ` · Q${cur.period}${cur.clock ? ` ${cur.clock}` : ""}` : ""}`;
  // The last few finished drives sit faintly behind it.
  const past = data.drives.filter((d) => !d.current && d.from != null && d.to != null).slice(-3);
  const X = (yd: number) => 10 + yd; // 10-yard end zones either side
  const plays = data.curPlays ?? [];
  const logo = teams[side].logoId ? logos[teams[side].logoId!] : undefined;
  // The ball's tag sits on the side with room.
  const tagLeft = ball > 70;

  const list = plays.length > 0 && (
    <ol className="lf-plays" aria-label="Plays in this drive">
      {plays.map((p, i) => (
        <li key={i} className={`${i === plays.length - 1 ? "latest" : ""}${p.score ? " score" : ""}${p.turnover ? " turnover" : ""}`}>
          <span className="lf-down">{p.down || p.kind}</span>
          <span className="lf-text">{p.text}</span>
          <span className={`lf-yds${p.yards < 0 ? " neg" : ""}`}>{p.yards ? `${signed(p.yards)} yd${Math.abs(p.yards) === 1 ? "" : "s"}` : ""}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div ref={rootRef} className={`lf lf-${variant}`} role="img" aria-label={`Live field: ${label}. ${stats}. Drive started at ${startedAt}.`}>
      <p className="lf-ball-team">
        {logo && <img src={logos[teams[side].logoId!]} alt="" width="22" height="22" />}
        <FootballIcon title="Has the ball" />
        <b>{teams[side].name}</b>
        <span> have the ball</span>
      </p>
      <svg viewBox="0 0 120 34" className="drive-svg" aria-hidden="true">
        <rect x="0" y="0" width="120" height="34" className="df-turf" />
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={10 + i * 10} y="0" width="10" height="34" className={i % 2 ? "df-stripe" : "df-stripe alt"} />
        ))}
        <rect x="0" y="0" width="10" height="34" fill={colors[0]} opacity="0.6" />
        <rect x="110" y="0" width="10" height="34" fill={colors[1]} opacity="0.6" />
        {[[away, 5, -90] as const, [home, 115, 90] as const].map(([t, x, rot], k) => (
          <text key={k} x={x} y="17" className="lf-ez" transform={`rotate(${rot} ${x} 17)`} textAnchor="middle" dominantBaseline="central">{(t.abbr ?? t.name).toUpperCase()}</text>
        ))}
        {sit?.redZone && <rect x={awayOffense ? X(80) : X(0)} y="0" width="20" height="34" className="df-red" />}
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={10 + i * 10} x2={10 + i * 10} y1="0" y2="34" className={i === 5 ? "df-line mid" : "df-line"} />
        ))}
        {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((n, i) => (
          <text key={i} x={20 + i * 10} y="32" className="df-num" textAnchor="middle">{n * 10}</text>
        ))}
        {past.map((d, i) => {
          const a = spot(d.from!, d.team === ids[0]);
          const b = spot(d.to!, d.team === ids[0]);
          const c = colors[d.team === ids[0] ? 0 : 1];
          return <line key={i} x1={X(a)} x2={X(b)} y1={4 + i * 2} y2={4 + i * 2} stroke={c} className={`df-past${d.score ? " score" : ""}`} />;
        })}
        {firstDown != null && <line x1={X(firstDown)} x2={X(firstDown)} y1="0" y2="34" className="df-first" />}
        <line x1={X(goal)} x2={X(goal)} y1="0" y2="34" className="df-goal" />
        {/* the drive: a band from where it started to the ball, arrowed toward the goal being attacked */}
        <line x1={X(start)} x2={X(ball)} y1="17" y2="17" stroke={colors[side]} className="df-path" />
        <line x1={X(start)} x2={X(ball)} y1="17" y2="17" className="df-flow" />
        <path d={`M${X(ball) + dir * 1.2} 17 l${-dir * 2.2} -1.6 v3.2z`} fill="#fff" opacity="0.9" />
        <g className="lf-start">
          <line x1={X(start)} x2={X(start)} y1="9" y2="25" stroke={colors[side]} className="df-start" />
          <path d={`M${X(start)} 9 h${dir * 5} l${-dir * 1.2} 1.6 l${dir * 1.2} 1.6 h${-dir * 5}z`} fill="#fff" opacity="0.92" />
          <text x={X(start) + dir * 6} y="11.6" className="lf-tagtext" textAnchor={dir > 0 ? "start" : "end"}>START</text>
        </g>
        <g className="df-ball" style={{ transform: `translateX(${X(ball)}px)` }}>
          <line x1="0" x2="0" y1="0" y2="34" className="df-los" />
          <circle cx="0" cy="17" r="3.4" className="df-pulse" stroke={colors[side]} />
          <ellipse cx="0" cy="17" rx="2.4" ry="1.5" className="df-pigskin" />
          <text x={tagLeft ? -4.5 : 4.5} y="9" className="lf-tagtext ball" textAnchor={tagLeft ? "end" : "start"}>{abbr} · {spotName(ballFromOwn, own, opp)}</text>
        </g>
      </svg>
      <p className="drive-cap">
        <span className="drive-dot" aria-hidden="true" />
        <b>{label}</b>
        {stats && <span> · {stats}</span>}
        <span className="lf-started"> · drive started {startedAt}</span>
      </p>
      {list &&
        (variant === "center" ? (
          <div className="lf-drive">
            <h4 className="gc-sub">Plays in this drive</h4>
            {list}
          </div>
        ) : (
          <details className="lf-drive">
            <summary>Plays in this drive ({plays.length})</summary>
            {list}
          </details>
        ))}
    </div>
  );
}

/** The live field on a card: fetches the game summary while the card is on screen and draws it. */
export function LiveDrive({ espnId, league, teams }: { espnId: string; league: string; teams: FieldTeam[] }) {
  // The wrapper (and its ref, which the on-screen check watches) stays put as the field appears and disappears.
  const { ref, data, loaded } = useSummary(league, espnId, true);
  const live = data?.status.state === "in";
  const field = FieldView({ data, teams, variant: "card" });
  if (!field)
    return (
      <div ref={ref} className={`drive-live${loaded ? " empty" : " loading"}`} aria-hidden={!loaded || undefined}>
        {loaded && live ? <p className="drive-cap">Waiting for the next snap…</p> : null}
      </div>
    );
  return (
    <div ref={ref} className="drive-live">
      {field}
    </div>
  );
}
