import { useEffect, useMemo, useRef, useState } from "react";
import { teamColor } from "./data";
import type { GameBadge } from "./gameLogo";
import { WeatherLayer } from "./WeatherEffects";
import type { WeatherLike } from "./weatherFx";
import { FieldArt, type Side } from "./halftime";
import { mix, nearestAssignment, clockText } from "./halftimeLogic";
import { EXIT_MARGIN_MS, pregameElapsed, pregameNow, pregameToKickoff, type Pregame } from "./pregameLogic";
import type { BandPoint } from "./bandLogo";

/**
 * NFL pregame: the home cheerleaders take the field 15 minutes before kickoff, run a few routines and are off the field
 * five minutes before kickoff. Same top-down stadium view as the band. Where the squad is comes from the game's pregame clock,
 * so a reload or the Game Center lands on the same routine rather than replaying the entrance.
 */
export const CHEER_N = 16;
export const ROUTINE_MS = 12_000;
const ENTER_MS = 12_000;
const EXIT_LEAD_MS = 25_000;
const SPEED = 2.4; // field units per second while running, so a long run takes longer than a short one

const line = (y: number, n: number, x0: number, x1: number): BandPoint[] => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y]);
const ring = (cx: number, cy: number, rx: number, ry: number, n: number): BandPoint[] => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * 2 * Math.PI), cy + ry * Math.sin((i / n) * 2 * Math.PI)]);

/** Every routine places all sixteen on the field, spaced at least two units apart. */
export const ROUTINES: { name: string; pts: BandPoint[] }[] = [
  { name: "two lines", pts: [...line(24, 8, 36, 84), ...line(30, 8, 36, 84)] },
  { name: "V formation", pts: Array.from({ length: CHEER_N }, (_, i) => [60 + (i % 2 ? 1 : -1) * (Math.floor(i / 2) + 1) * 4.2, 10 + (Math.floor(i / 2) + 1) * 2.6] as BandPoint) },
  { name: "circle at midfield", pts: [...ring(60, 20, 9, 7, 10), ...ring(60, 20, 4, 3, 6)] },
  { name: "two columns", pts: [...Array.from({ length: 8 }, (_, i) => [50, 6 + i * 4] as BandPoint), ...Array.from({ length: 8 }, (_, i) => [70, 6 + i * 4] as BandPoint)] },
  { name: "four pods", pts: [30, 50, 70, 90].flatMap((x, k) => [[x - 2.4, 14 + (k % 2) * 10], [x + 2.4, 14 + (k % 2) * 10], [x - 2.4, 22 + (k % 2) * 10], [x + 2.4, 22 + (k % 2) * 10]] as BandPoint[]) },
  { name: "diamond", pts: [...ring(60, 20, 20, 12, 12), ...ring(60, 20, 8, 5, 4)] },
];
export const CHEER_ENTRANCE: BandPoint[] = Array.from({ length: CHEER_N }, (_, i) => [34 + (i % 8) * 7.5, 44 + Math.floor(i / 8) * 1.4]);
export const exitSpots = (pts: BandPoint[]): BandPoint[] => pts.map(([x], i) => [x, 45 + (i % 2) * 1.2]);

/** Which routine is on (or "enter" / "exit") at a moment, from the clock alone. */
export function cheerCue(elapsed: number, msLeftInShow: number): { phase: "enter" | "routine" | "exit"; index: number } {
  if (msLeftInShow <= EXIT_LEAD_MS) return { phase: "exit", index: 0 };
  if (elapsed < ENTER_MS) return { phase: "enter", index: 0 };
  return { phase: "routine", index: Math.floor((elapsed - ENTER_MS) / ROUTINE_MS) % ROUTINES.length };
}

export function PregameCheer({ espnId, home, away, badge, weather, pregame }: { espnId: string; home: Side; away: Side; badge?: GameBadge | null; weather?: WeatherLike | null; pregame: Pregame }) {
  const ref = useRef<HTMLDivElement>(null);
  const clockNow = () => pregameNow(pregame.kickoff);
  const [now, setNow] = useState(clockNow);
  const [visible, setVisible] = useState(true);
  const [still] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const showLeft = Math.max(0, pregame.cutoff - EXIT_MARGIN_MS - now);
  const cue = cheerCue(pregameElapsed(pregame, now), showLeft);
  const target = useMemo(() => (cue.phase === "exit" ? null : cue.phase === "enter" ? ROUTINES[0].pts : ROUTINES[cue.index].pts), [cue.phase, cue.index]);
  // Joining mid-show starts the squad in its current routine; only a visit at the very start sees the entrance.
  const [drill, setDrill] = useState(() => {
    const first = cheerCue(pregameElapsed(pregame, clockNow()), Math.max(0, pregame.cutoff - EXIT_MARGIN_MS - clockNow()));
    const late = first.phase === "routine" || (first.phase === "exit");
    const pts = late ? (first.phase === "exit" ? ROUTINES[first.index].pts : ROUTINES[first.index].pts) : CHEER_ENTRANCE;
    return { points: pts, angles: Array(CHEER_N).fill(90) as number[], dist: Array(CHEER_N).fill(0) as number[], moving: false };
  });
  const [snap, setSnap] = useState(true);
  useEffect(() => { const t = setTimeout(() => setSnap(false), 80); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => !document.hidden && setNow(clockNow()), 1000);
    setNow(clockNow());
    return () => clearInterval(t);
  }, [visible]);
  useEffect(() => {
    setDrill((prev) => {
      const to = target ? nearestAssignment(prev.points, target) : exitSpots(prev.points);
      const moved = to.some(([x, y], i) => Math.hypot(x - prev.points[i][0], y - prev.points[i][1]) > 0.1);
      if (!moved) return { ...prev, moving: false };
      const angles = to.map(([x, y], i) => {
        const dx = x - prev.points[i][0], dy = y - prev.points[i][1];
        if (Math.hypot(dx, dy) < 0.1) return prev.angles[i];
        let a = (Math.atan2(dy, dx) * 180) / Math.PI;
        while (a - prev.angles[i] > 180) a -= 360;
        while (a - prev.angles[i] < -180) a += 360;
        return a;
      });
      return { points: to, angles, dist: to.map(([x, y], i) => Math.hypot(x - prev.points[i][0], y - prev.points[i][1])), moving: !still };
    });
  }, [target, cue.phase, still]);
  // Arrived: stop running, turn to face the stands (the home sideline, +y) and cheer.
  useEffect(() => {
    if (!drill.moving) return;
    const longest = Math.max(...drill.dist) / SPEED;
    const t = setTimeout(() => setDrill((d) => ({ ...d, moving: false, angles: d.angles.map((a) => a + (((90 - a) % 360) + 540) % 360 - 180) })), Math.min(14, Math.max(1.5, longest)) * 1000);
    return () => clearTimeout(t);
  }, [drill.points]);
  const hc = teamColor(home.color) ?? "#2f7de1";
  const ac = teamColor(away.color) ?? "#c1403d";
  const toKick = pregameToKickoff(pregame, now);
  const label = `Kickoff in ${clockText(toKick)}`;
  const routineName = cue.phase === "exit" ? "running off" : cue.phase === "enter" ? "taking the field" : ROUTINES[cue.index].name;
  const pct = Math.round((1 - pregameElapsed(pregame, now) / (pregame.cutoff - pregame.start)) * 100);
  const pom = mix(hc, 0.55);
  return (
    <div ref={ref} className={`halftime-band pregame-cheer${drill.moving ? " band-travel" : ""}${visible ? "" : " band-paused"}`} data-pregame="cheer" role="img" aria-label={`${label}. The ${home.abbr ?? home.name} cheerleaders are on the field: ${routineName}.`}>
      <div className="band-count" aria-hidden="true">
        <span className="band-count-k">PREGAME CHEER</span>
        <strong className="band-count-t">{clockText(toKick)}</strong>
        <span className="band-count-l">until kickoff</span>
        <i className="band-count-bar"><b style={{ width: `${pct}%` }} /></i>
      </div>
      <svg viewBox="0 0 120 40" className="band-svg" aria-hidden="true">
        <FieldArt id={espnId} home={home} away={away} hc={hc} ac={ac} badge={badge} />
        <WeatherLayer weather={weather} period={1} h={40} seed={Number(espnId) || 1} />
        {drill.points.map(([x, y], i) => (
          <g key={i} className="cheer-member" style={{ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`, transitionDuration: still || snap ? "0s" : `${Math.min(14, Math.max(1.5, drill.dist[i] / SPEED))}s`, transitionDelay: snap ? "0s" : `${(i % 8) * 0.1}s` }}>
            <ellipse cx="0.3" cy="0.45" rx="1.2" ry="0.75" className="band-ground-shadow" />
            <g className="band-facing" style={{ transform: `rotate(${drill.angles[i].toFixed(1)}deg)` }}>
              <g className={drill.moving ? "band-march" : "cheer-pose"} style={{ ["--cheer-phase" as string]: `${-(i % 4) * 0.12}s` }}>
                <ellipse className="band-foot a" cx="0" cy="-0.6" rx="0.8" ry="0.34" />
                <ellipse className="band-foot b" cx="0" cy="0.6" rx="0.8" ry="0.34" />
                <ellipse cx="0" cy="0" rx="0.8" ry="1.3" fill={hc} className="band-shoulders" />
                <line x1="-0.3" x2="-0.3" y1="-0.9" y2="0.9" stroke="#fff" strokeWidth="0.22" />
                <circle cx="0.15" cy="0" r="0.62" fill={["#f1c9a5", "#d8a47a", "#a8734e", "#7a4e30"][i % 4]} />
                <ellipse cx="-0.35" cy="0" rx="0.4" ry="0.55" fill={["#3b2a1d", "#c89a3c", "#1a1a1a", "#7a3b1d"][(i + 1) % 4]} />
                <g className="cheer-poms">
                  <circle cx="0.9" cy="-1.55" r="0.78" fill="#ffffff" />
                  <circle cx="0.9" cy="-1.55" r="0.42" fill={pom} />
                  <circle cx="0.9" cy="1.55" r="0.78" fill="#ffffff" />
                  <circle cx="0.9" cy="1.55" r="0.42" fill={pom} />
                </g>
              </g>
            </g>
          </g>
        ))}
        <text x="60" y="39" className="band-home-sideline" textAnchor="middle">{home.abbr ?? home.name} HOME SIDELINE</text>
      </svg>
      <p className="drive-cap">
        <span className="drive-dot" aria-hidden="true" />
        <b>{label}</b>
        <span> · {home.abbr ?? home.name} cheerleaders: {routineName}</span>
      </p>
    </div>
  );
}
