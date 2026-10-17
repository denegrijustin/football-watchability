import { useEffect, useRef, useState } from "react";
import { logos, teamColor } from "./data";
import { rename } from "./data/load";
import { FootballIcon, liveFromSummary, useReportLive } from "./live";
import { LogoMark } from "./logoTone";
import { helmetFor } from "./helmets";
import { WeatherLayer, weatherCaption } from "./WeatherFx";
import { ConfMark } from "./ConfMark";
import { EndZones, EZ_H, EZ_W } from "./sim/EndZones";
import { endzoneFor } from "./sim/endzone";
import { MIDFIELD_ART } from "./sim/midfield";
import type { WeatherLike } from "./weatherFx";
import type { GameBadge } from "./gameLogo";
import { driveSegments, playKind, type Seg } from "./driveKinds";

/** The slice of /api/game (see functions/api/game.js) the drive animation uses. */
type Summary = {
  status: { state: "pre" | "in" | "post"; period?: number };
  teams: { id: string; abbr: string; name?: string }[];
  situation: { text: string; possession: string | null; toGo: number | null; redZone: boolean; lastPlay: string; spotText?: string; yardLine?: number | null } | null;
  drives: { team: string; period?: number | null; clock?: string; from: number | null; to: number | null; yards: number; plays: number; result: string; score: boolean; time: string; current: boolean }[];
  /** Every snap of the drive in progress (older cached responses may not have it). */
  /** Where the latest snap of the current drive left the ball, from the play data: the team it is measured for and yards from that team's goal line. */
  ball?: { team: string | null; own: number } | null;
  curPlays?: { down: string; text: string; yards: number; period: number | null; clock: string; kind: string; score: boolean; turnover: boolean }[];
};
export type FieldTeam = { espnId?: string | null; abbr?: string; name: string; color?: string | null; logoId?: string; conf?: string | null };

// The /api/game function takes nfl or cfb (not the ESPN path), the same values the Game Center sends.
const PATHS: Record<string, string> = { NFL: "nfl", CFB: "cfb" };
const POLL_MS = 15_000;
const cache = new Map<string, { at: number; data: Summary | null }>();

async function fetchSummary(league: string, id: string): Promise<Summary | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < POLL_MS - 1000) return hit.data;
  let data: Summary | null = null;
  try {
    const r = await fetch(`/api/game?league=${PATHS[league]}&event=${id}`, { cache: "no-store" });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) data = rename(await r.json());
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
  const report = useReportLive();
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
      if (next) {
        setData(next);
        const l = liveFromSummary(next as never, id);
        if (l) report(l);
      }
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
/**
 * Where the ball is, in yards from the offense's own goal line. ESPN's yards-to-end-zone figure is used when it is there; the live
 * summary often gives only text such as "2nd & 7 at SEA 35" or a spot of "SEA 35", so that is read when it is not.
 */
export function ballFromOwn(sit: NonNullable<Summary["situation"]> | null, own: { abbr: string; name?: string }, opp: { abbr: string; name?: string }): number | null {
  if (!sit) return null;
  if (sit.toGo != null) return 100 - sit.toGo;
  const name = (t: { abbr: string; name?: string }, tag: string) => {
    const a = tag.toUpperCase();
    return a === t.abbr.toUpperCase() || (!!t.name && (t.name.toUpperCase().startsWith(a) || a.startsWith(t.abbr.toUpperCase())));
  };
  for (const text of [sit.spotText ?? "", sit.text ?? ""]) {
    if (/\b(?:at|on)\s+50\b/i.test(text) || /^50$/.test(text.trim())) return 50;
    const m = /(?:\b(?:at|on)\s+)?\b([A-Za-z][A-Za-z&.]{0,9})\s+(\d{1,2})\s*$/.exec(text.trim());
    if (!m) continue;
    const n = Number(m[2]);
    if (name(own, m[1])) return n;
    if (name(opp, m[1])) return 100 - n;
  }
  return null;
}
/** Why a field could not be drawn, for the Game Center's note. */
export function fieldWhy(data: Summary | null, ids: string[]) {
  if (!data) return "no game data yet";
  const cur = data.drives.find((d) => d.current) ?? null;
  const sit = data.situation;
  return [
    `possession ${sit?.possession ?? cur?.team ?? data.ball?.team ?? "none"} (teams ${ids.join("/")})`,
    `situation ${sit ? JSON.stringify({ text: sit.text, toGo: sit.toGo, spot: sit.spotText }) : "none"}`,
    `drive ${cur ? `${cur.from}→${cur.to}` : "none"}`,
    `ball ${data.ball ? `${data.ball.team}@${data.ball.own}` : "none"}`,
  ].join(" · ");
}
/** Whether a field can be drawn from this summary: a live game, a team with the ball and a spot for it. */
export function fieldSpot(data: Summary | null, ids: string[], abbrs: { abbr: string; name?: string }[]) {
  if (!data || data.status.state !== "in") return null;
  const cur = data.drives.find((d) => d.current) ?? null;
  const sit = data.situation;
  const possession = sit?.possession ?? cur?.team ?? data.ball?.team ?? null;
  const side = possession === ids[0] ? 0 : possession === ids[1] ? 1 : -1;
  if (side < 0) return null;
  // The ball from the play data counts for whichever team it was measured for.
  const fromPlays = data.ball?.team && data.ball.team === ids[side] ? data.ball.own : data.ball?.team ? 100 - data.ball.own : null;
  const at = ballFromOwn(sit, abbrs[side], abbrs[1 - side]) ?? fromPlays ?? cur?.to ?? null;
  return at == null ? null : { side, at, cur, sit };
}
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
/** How many of the drive's last plays get a line of their own on the field. */
const MAX_ROWS = 12;
/** What is written beside a play's line: the yards gained or lost, or the kick. */
export function playLabel(g: Seg) {
  if (g.kind === "punt") return `Punt ${g.yards}`;
  if (g.kind === "fg") return `FG ${g.yards} ${g.good ? "✓" : "✗"}`;
  const yds = g.incomplete ? "inc" : g.yards > 0 ? `+${g.yards}` : g.yards < 0 ? `−${-g.yards}` : "0";
  return `${yds}${g.score ? " TD" : ""}${g.turnover ? " ✕" : ""}`;
}

/**
 * The live field: who has the ball and where it is, where the drive started and how far it has come, the line to gain, and
 * the plays of the drive in progress. Shown on live cards (compact, plays folded away) and in the Game Center.
 * Static for visitors who ask for reduced motion.
 */
export function FieldView({ data, teams, variant, rootRef, badge, weather }: { data: Summary | null; teams: FieldTeam[]; variant: "card" | "center"; rootRef?: React.Ref<HTMLDivElement>; badge?: GameBadge | null; weather?: WeatherLike | null }) {
  const [away, home] = teams;
  const ids = [away.espnId ?? "", home.espnId ?? ""];
  const colors = [teamColor(away.color) ?? "#c1403d", teamColor(home.color) ?? "#2f7de1"];
  const abbrs = teams.map((t) => ({ abbr: t.abbr ?? t.name, name: t.name }));
  const found = fieldSpot(data, ids, abbrs);
  if (!data || !found) return null;
  const { side, cur, sit } = found;
  const possession = ids[side];

  const awayOffense = side === 0;
  const own = teams[side].abbr ?? teams[side].name;
  const opp = teams[1 - side].abbr ?? teams[1 - side].name;
  const ballOwn = found.at;
  const startFromOwn = cur?.from ?? ballOwn;
  const ball = spot(ballOwn, awayOffense);
  const start = spot(startFromOwn, awayOffense);
  const dir = awayOffense ? 1 : -1;
  const m = /&\s*(\d+)/.exec(sit?.text ?? "");
  const toFirst = m ? Number(m[1]) : null;
  const firstDown = toFirst != null ? clamp(ball + dir * toFirst) : null;
  const goal = awayOffense ? 100 : 0;
  const toGoal = Math.abs(goal - ball);
  // ESPN's red-zone flag, or the plain fact of being inside the opponent's 20.
  const redZone = !!sit?.redZone || toGoal <= 20;
  const abbr = data.teams.find((t) => t.id === possession)?.abbr ?? own;
  const downText = sit?.text ?? "";
  const label = `${abbr} ${downText ? downText : "driving"}`;
  const stats = cur ? `${cur.plays} play${cur.plays === 1 ? "" : "s"} · ${cur.yards} yd${cur.yards === 1 ? "" : "s"}${cur.time ? ` · ${cur.time}` : ""}` : "";
  const startedAt = `${spotName(startFromOwn, own, opp)}${cur?.period ? ` · Q${cur.period}${cur.clock ? ` ${cur.clock}` : ""}` : ""}`;
  const X = (yd: number) => 10 + yd; // 10-yard end zones either side
  const plays = data.curPlays ?? [];
  const wxText = weatherCaption(weather, data.status.period);
  const logo = teams[side].logoId ? logos[teams[side].logoId!] : undefined;
  const helmet = helmetFor(teams[side].logoId, colors[side]);
  // The ball's tag sits on the side with room.
  const tagLeft = ball > 70;

  // The drive's last dozen plays, a line each from the top down, with the ball on a line of its own below them.
  const segsAll = driveSegments(plays, { ball, start }, awayOffense);
  const shown = segsAll.slice(-MAX_ROWS);
  const earlier = segsAll.length - shown.length;
  const TOP = 10, ROW = 4.3, BOTTOM = 7;
  const rowY = (i: number) => TOP + i * ROW;
  // The field wears the home team's end zones and its conference (the NFL's shield for NFL games).
  const nflGame = home.conf === "AFC" || home.conf === "NFC";
  const homeShort = nflGame ? home.name.split(" ").pop() ?? home.name : home.name;
  const ezArt = endzoneFor({ short: homeShort, color: home.color ?? colors[1], alt: undefined });
  const fieldConf = nflGame ? "NFL" : home.conf && home.conf !== "Independent" ? home.conf : null;
  const H = Math.max(variant === "card" ? 26 : 30, TOP + (shown.length + 1) * ROW + BOTTOM);
  const ballY = rowY(shown.length);

  const list = plays.length > 0 && (
    <ol className="lf-plays" aria-label="Plays in this drive">
      {plays.map((p, i) => (
        <li key={i} className={`${i === plays.length - 1 ? "latest" : ""}${p.score ? " score" : ""}${p.turnover ? " turnover" : ""} ${playKind(p.kind, p.text) ?? ""}`}>
          <span className="lf-down">{p.down || p.kind}</span>
          <span className="lf-text">{p.text}</span>
          <span className={`lf-yds${p.yards < 0 ? " neg" : ""}`}>{p.yards ? `${signed(p.yards)} yd${Math.abs(p.yards) === 1 ? "" : "s"}` : ""}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div ref={rootRef} className={`lf lf-${variant}${redZone ? " lf-red" : ""}`} role="img" aria-label={`Live field: ${label}. ${stats}. Drive started at ${startedAt}.`}>
      <p className="lf-ball-team">
        {logo && <img src={logos[teams[side].logoId!]} alt="" width={variant === "card" ? 16 : 22} height={variant === "card" ? 16 : 22} />}
        <FootballIcon title="Has the ball" />
        <b>{variant === "card" ? (teams[side].abbr ?? teams[side].name) : teams[side].name}</b>
        <span> have the ball</span>
        <span className="lf-heading" aria-label={`driving toward the ${opp} end zone`}>driving {dir > 0 ? "→" : "←"}</span>
        {redZone && <span className="lf-rz">RED ZONE</span>}
      </p>
      <svg viewBox={`0 0 120 ${H}`} style={{ aspectRatio: `120 / ${H}` }} className="drive-svg" aria-hidden="true">
        <rect x="0" y="0" width="120" height={H} className="df-turf" />
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={10 + i * 10} y="0" width="10" height={H} className={i % 2 ? "df-stripe" : "df-stripe alt"} />
        ))}
        {/* the home team's real end zone design at both ends, as in its stadium (the same art as the game simulator) */}
        <svg x="0" y="0" width="120" height={H} viewBox={`0 0 ${EZ_W} ${EZ_H}`} preserveAspectRatio="none" className="lf-ezart">
          <EndZones ez={ezArt} name={homeShort} />
        </svg>
        {redZone && <rect x={awayOffense ? X(80) : X(0)} y="0" width="20" height={H} className="df-red" />}
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={10 + i * 10} x2={10 + i * 10} y1="0" y2={H} className={i === 5 ? "df-line mid" : "df-line"} />
        ))}
        {Array.from({ length: 99 }, (_, i) => i + 1).filter((yd) => yd % 5).map((yd) => (
          <path key={`hash-${yd}`} d={`M${X(yd)} 0.6v0.9M${X(yd)} ${H - 1.5}v0.9M${X(yd)} ${H * 0.43}v0.65M${X(yd)} ${H * 0.57}v0.65`} className="lf-field-hash" />
        ))}
        <rect x="0.25" y="0.25" width="119.5" height={H - 0.5} className="lf-field-boundary" />
        {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((n, i) => (
          <text key={`top-${i}`} x={20 + i * 10} y="3.8" transform={`rotate(180 ${20 + i * 10} 2.8)`} className="df-num" textAnchor="middle">{n * 10}</text>
        ))}
        {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((n, i) => (
          <text key={i} x={20 + i * 10} y={H - 1.6} className="df-num" textAnchor="middle">{n * 10}</text>
        ))}
        {fieldConf && (
          <>
            <ConfMark conf={fieldConf} cx={35} cy={7.5} size={5.5} />
            <g transform={`rotate(180 85 ${H - 7.5})`}><ConfMark conf={fieldConf} cx={85} cy={H - 7.5} size={5.5} /></g>
          </>
        )}
        <WeatherLayer weather={weather} period={data.status.period} h={H} y0={0} seed={Number(ids[0]) || 1} compact={variant === "card"} />
        {firstDown != null && <line x1={X(firstDown)} x2={X(firstDown)} y1="0" y2={H} className="df-first" />}
        <line x1={X(goal)} x2={X(goal)} y1="0" y2={H} className="df-goal" />
        {!badge?.src && home.logoId && MIDFIELD_ART[home.logoId] && (
          <image href={MIDFIELD_ART[home.logoId].src} data-midfield="art" x={60 - MIDFIELD_ART[home.logoId].card / 2} y={H / 2 - MIDFIELD_ART[home.logoId].card / MIDFIELD_ART[home.logoId].ratio / 2} width={MIDFIELD_ART[home.logoId].card} height={MIDFIELD_ART[home.logoId].card / MIDFIELD_ART[home.logoId].ratio} opacity="0.95" />
        )}
        {!(!badge?.src && home.logoId && MIDFIELD_ART[home.logoId]) && (badge?.src ?? (!badge?.neutral && home.logoId ? logos[home.logoId] : null)) && (
          <LogoMark src={badge?.src ?? logos[home.logoId!]} cx={60} cy={H / 2} size={11} chipOpacity={0.16} imageClass="lf-mid" />
        )}
        {earlier > 0 && <text x="11.5" y="4.6" className="lf-tagtext">▲ {earlier} earlier play{earlier === 1 ? "" : "s"}</text>}
        {/* where the drive started */}
        <g className="lf-start">
          <line x1={X(start)} x2={X(start)} y1="7.5" y2={H - 5} stroke={colors[side]} className="df-start" />
          <text x={X(start) + dir * 1.2} y="6.4" className="lf-tagtext" textAnchor={dir > 0 ? "start" : "end"}>START</text>
        </g>
        {/* the drive, one line per play from the top down: red for a run, blue for a pass, gold for a punt or field goal. A play that lost yards is dashed. */}
        <g className="lf-plays-chart" data-dir={dir}>
          {shown.map((g, i) => {
            const y = rowY(i);
            const kind = g.kind ?? "other";
            const a = X(clamp(g.from)), b = g.kind === "fg" ? X(g.to) : X(clamp(g.to));
            const loss = g.kind !== "punt" && g.kind !== "fg" && g.yards < 0;
            const right = Math.max(a, b);
            const labelRight = right < 104;
            const text = playLabel(g);
            return (
              <g key={i} className={`df-play ${kind}${loss ? " loss" : ""}`} data-kind={kind} data-yards={g.yards}>
                {i > 0 && <line x1={a} x2={a} y1={rowY(i - 1)} y2={y} className="df-step" />}
                {g.incomplete ? (
                  <>
                    <line x1={a} x2={a + dir * 2.4} y1={y} y2={y} className="df-seg pass inc" />
                    <circle cx={a + dir * 3.4} cy={y} r="0.9" className="df-seg-inc" />
                  </>
                ) : (
                  <line x1={a} x2={b} y1={y} y2={y} className={`df-seg ${kind}${loss ? " loss" : ""}${a === b ? " zero" : ""}`} />
                )}
                <circle cx={a} cy={y} r="0.7" className="df-play-start" />
                {g.kind === "punt" && <path d={`M${b} ${y - 1.3}l1.3 1.3l-1.3 1.3l-1.3 -1.3z`} className="df-kick-mark" />}
                {g.kind === "fg" && <path d={`M${b - 0.9} ${y - 1.6}v3.2M${b + 0.9} ${y - 1.6}v3.2M${b - 0.9} ${y}h1.8`} className="df-kick-mark post" />}
                {g.score && g.kind !== "fg" && <circle cx={b} cy={y} r="1.5" className="df-score-ring" />}
                <text x={labelRight ? right + 1.8 : Math.min(a, b) - 1.8} y={y + 0.9} className={`df-play-label ${kind}`} textAnchor={labelRight ? "start" : "end"}>{text}</text>
              </g>
            );
          })}
        </g>
        <g className="df-ball" style={{ transform: `translateX(${X(ball)}px)` }}>
          <line x1="0" x2="0" y1="0" y2={H} className="df-los" />
          <circle cx="0" cy={ballY} r="4.6" className="df-pulse" stroke={colors[side]} />
          {/* the offense's helmet, as the team wears it, facing the way it is driving, with the logo on the shell */}
          <g transform={`translate(0 ${ballY}) scale(${dir} 1)`} className="lf-helmet" data-facing={dir > 0 ? "right" : "left"} data-shell={helmet.shell}>
            <path d="M-3.8 1.9C-4.7 -2.4 -1.8 -4.1 0.8 -3.9C3 -3.7 4.1 -1.9 3.9 0.2L3.3 1.2L1.5 1.3L0.7 2.5L-1.4 3.1L-3 3Z" className="lf-helmet-shell" fill={helmet.shell} />
            <path d="M-3.8 1.9C-4.7 -2.4 -1.8 -4.1 0.8 -3.9C3 -3.7 4.1 -1.9 3.9 0.2L3.3 1.2L1.5 1.3L0.7 2.5L-1.4 3.1L-3 3Z" className="lf-shell-shade" />
            <path d="M2.4 -0.7L3.8 -0.3L3.3 1.2L1.7 1.3Z" className="lf-visor" />
            <ellipse cx="-0.7" cy="1" rx="0.8" ry="0.95" className="lf-helmet-ear" />
            <path d="M3.9 0.5L5.1 0.9L5.1 2.8L2.6 3.3L1.2 2.6M4 1.6L1.9 1.7M4.6 0.7V3" className="lf-helmet-mask" stroke={helmet.mask} />
          </g>
          {helmet.decal && <text x={-0.2 * dir} y={ballY - 0.2} className="lf-decal" textAnchor="middle" fill={helmet.decal.color}>{helmet.decal.text}</text>}
          {helmet.tint && <filter id={`lf-tint-${helmet.tint.slice(1)}`} colorInterpolationFilters="sRGB"><feFlood floodColor={helmet.tint} result="c" /><feComposite in="c" in2="SourceAlpha" operator="in" /></filter>}
          {logo && !helmet.decal && <image transform={helmet.facesRight && dir < 0 ? `translate(${-0.4 * dir} 0) scale(-1 1)` : undefined} style={helmet.tint ? { filter: `url(#lf-tint-${helmet.tint.slice(1)}) drop-shadow(0 0 0.3px rgb(0 0 0 / 40%))` } : undefined} href={logos[teams[side].logoId!]} x={-0.2 * dir - 1.5} y={ballY - 2.2} width="2.8" height="2.8" preserveAspectRatio="xMidYMid meet" className="lf-ball-logo" />}
          <text x={tagLeft ? -4.5 : 4.5} y="3.6" className="lf-tagtext ball" textAnchor={tagLeft ? "end" : "start"}>{abbr} · {spotName(ballOwn, own, opp)}</text>
        </g>
      </svg>
      <p className="drive-cap">
        <span className="drive-dot" aria-hidden="true" />
        <b>{label}</b>
        {stats && <span> · {stats}</span>}
        <span className="lf-started"> · drive started {startedAt}</span>
        {plays.length > 0 && (
          <span className="lf-key" aria-hidden="true"><i className="run" /> run <i className="pass" /> pass <i className="kick" /> punt / FG</span>
        )}
        {wxText && <span className="lf-wx"> · {weather?.icon ?? ""} {wxText}</span>}
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
export function LiveDrive({ espnId, league, teams, badge, weather }: { espnId: string; league: string; teams: FieldTeam[]; badge?: GameBadge | null; weather?: WeatherLike | null }) {
  // The wrapper (and its ref, which the on-screen check watches) stays put as the field appears and disappears.
  const { ref, data, loaded } = useSummary(league, espnId, true);
  const live = data?.status.state === "in";
  const field = FieldView({ data, teams, variant: "card", badge, weather });
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
