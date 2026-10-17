import { useEffect, useMemo, useRef, useState } from "react";
import { logos, teamColor } from "./data";
import type { GameBadge } from "./gameLogo";
import { LogoMark } from "./logoTone";
import { WeatherLayer } from "./WeatherFx";
import { ConfMark, confEntry } from "./ConfMark";
import { EndZones, EZ_H, EZ_W } from "./sim/EndZones";
import { endzoneFor } from "./sim/endzone";
import { MIDFIELD_ART } from "./sim/midfield";
import type { WeatherLike } from "./weatherFx";
import { logoOutline, logoFilled, exitPoints, bandCue, SCRIPT_OHIO, OHIO_DOTTER, OHIO_DOT, OHIO_STAGE, entrancePoints, type BandPoint } from "./bandLogo";
import { FORMATIONS, HALFTIME_MS, mix, N, STEP_MS, clockText, firstSeen, halftimeLeft, nearestAssignment, MOVE_MS } from "./halftimeLogic";

/**
 * College halftime: a 20-minute countdown and the band marching through formations on the field. It stands in for the drive
 * chart while the game is at halftime (college games only). Still for visitors who ask for reduced motion.
 */
export type Side = { abbr?: string; name: string; color?: string | null; logoId?: string; conf?: string | null };


/** The stadium from above: turf, end zones with each school's name and logo, yard lines, hash marks and numbers, and the midfield logo. */
export function FieldArt({ id, home, hc, badge }: { id: string; home: Side; away: Side; hc: string; ac: string; badge?: GameBadge | null }) {
  const espnId = id;
  // The field is the home team's all game: its end zones at both ends and its conference at both 25s, exactly as on the game card and in the Game Center.
  const nflGame = home.conf === "AFC" || home.conf === "NFC";
  const homeShort = nflGame ? home.name.split(" ").pop() ?? home.name : home.name;
  const ez = endzoneFor({ short: homeShort, color: hc, alt: undefined });
  const fieldConf = nflGame ? "NFL" : home.conf && home.conf !== "Independent" ? home.conf : null;
  const midArt = !badge?.src && home.logoId ? MIDFIELD_ART[home.logoId] : undefined;
  return (
    <>
        <defs>
          <radialGradient id={`turf-${espnId}`} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#2b6a3a" />
            <stop offset="100%" stopColor="#1a4a29" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="120" height="40" fill={`url(#turf-${espnId})`} />
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={10 + i * 10} y="0" width="10" height="40" className={i % 2 ? "df-stripe" : "df-stripe alt"} />
        ))}
        {/* the home team's real end zone design at both ends (the same art as the game simulator and the cards) */}
        <svg x="0" y="0" width="120" height="40" viewBox={`0 0 ${EZ_W} ${EZ_H}`} preserveAspectRatio="none" className="lf-ezart">
          <EndZones ez={ez} name={homeShort} />
        </svg>
        {/* goal lines, end lines, sidelines and the orange pylons */}
        <line x1="10" x2="10" y1="0" y2="40" className="band-goal" />
        <line x1="110" x2="110" y1="0" y2="40" className="band-goal" />
        <rect x="0.4" y="0.4" width="119.2" height="39.2" className="band-boundary" />
        {[[10, 0.4], [10, 39.6], [110, 0.4], [110, 39.6]].map(([x, y], i) => (
          <rect key={i} x={x - 0.6} y={y - 0.6} width="1.2" height="1.2" className="band-pylon" />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={20 + i * 10} x2={20 + i * 10} y1="0.4" y2="39.6" className={i === 4 ? "df-line mid" : "df-line"} />
        ))}
        {/* hash marks every yard, longer at five */}
        {Array.from({ length: 101 }, (_, i) => (
          <g key={i} className="band-hash">
            <line x1={10 + i} x2={10 + i} y1="14.2" y2={i % 5 ? 15.6 : 16.4} />
            <line x1={10 + i} x2={10 + i} y1={i % 5 ? 24.4 : 23.6} y2="25.8" />
            {i % 5 === 0 && i % 10 !== 0 && (
              <>
                <line x1={10 + i} x2={10 + i} y1="0.4" y2="1.6" />
                <line x1={10 + i} x2={10 + i} y1="38.4" y2="39.6" />
              </>
            )}
          </g>
        ))}
        {/* yard numbers, upside down along the far sideline, with arrows pointing at the nearer goal */}
        {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((n, i) => {
          const x = 20 + i * 10;
          const left = i < 4;
          return (
            <g key={i} className="band-yard">
              <text x={x} y="37.2" className="df-num" textAnchor="middle">{n * 10}</text>
              <text x={x} y="6.8" className="df-num" textAnchor="middle" transform={`rotate(180 ${x} 5.4)`}>{n * 10}</text>
              {n !== 5 && <path d={left ? `M${x - 4.6} 36 l-1.6 -1 v2z` : `M${x + 4.6} 36 l1.6 -1 v2z`} className="df-arrow" />}
              {n !== 5 && <path d={left ? `M${x - 4.6} 4.4 l-1.6 1 v-2z` : `M${x + 4.6} 4.4 l1.6 1 v-2z`} className="df-arrow" />}
            </g>
          );
        })}
        {/* midfield: the home team's own art or logo, painted on the turf */}
        {midArt ? (
          <image href={midArt.src} data-midfield="art" x={60 - midArt.card / 2} y={20 - midArt.card / midArt.ratio / 2} width={midArt.card} height={midArt.card / midArt.ratio} opacity="0.95" />
        ) : (
          <>
            <circle cx="60" cy="20" r="7.4" className="band-mid-ring" />
            {/* a special or neutral-site game paints its own logo here; any other game, the home team's */}
            {badge?.src ? <LogoMark src={badge.src} cx={60} cy={20} size={14} chipOpacity={0.15} imageClass="band-mid-logo" gameLogo />
              : !badge?.neutral && home.logoId && logos[home.logoId] && <LogoMark src={logos[home.logoId]} cx={60} cy={20} size={14} chipOpacity={0.15} imageClass="band-mid-logo" />}
          </>
        )}
        {fieldConf && (
          <>
            <ConfMark conf={fieldConf} cx={35} cy={7.5} size={5.5} />
            <g transform="rotate(180 85 32.5)"><ConfMark conf={fieldConf} cx={85} cy={32.5} size={5.5} /></g>
          </>
        )}
    </>
  );
}

export function HalftimeBand({ espnId, home, away, badge, weather }: { espnId: string; home: Side; away: Side; badge?: GameBadge | null; weather?: WeatherLike | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const isOhioState = home.logoId === "ohio-state";
  const conference = confEntry(home.conf);
  const scriptStep = conference ? 2 : 1;
  const [seenAt] = useState(() => firstSeen(espnId, Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);
  const [still, setStill] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [moving, setMoving] = useState(false);
  const [dotting, setDotting] = useState(false);
  const [logoPoints, setLogoPoints] = useState<BandPoint[] | null>(null);
  const [logoReady, setLogoReady] = useState(false);
  const [drill, setDrill] = useState(() => ({ points: entrancePoints(N), angles: Array(N).fill(-90) as number[], distances: Array(N).fill(0) as number[] }));
  const [conferencePoints, setConferencePoints] = useState<BandPoint[] | null>(null);
  const [conferenceReady, setConferenceReady] = useState(false);
  const [conferenceLettering, setConferenceLettering] = useState(false);
  useEffect(() => {
    setConferencePoints(null);
    setConferenceReady(false);
    setConferenceLettering(false);
    if (!conference) { setConferenceReady(true); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const fallback = () => {
      if (cancelled) return;
      if (ctx) {
        canvas.width = 128;
        ctx.clearRect(0, 0, 128, 128);
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${Math.min(75, 180 / conference.label.length)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(conference.label, 64, 64, 116);
        setConferencePoints(logoFilled(ctx.getImageData(0, 0, 128, 128).data, 128, 128, N));
      }
      setConferenceLettering(true);
      setConferenceReady(true);
    };
    const sources = [...(conference.src ? [conference.src] : []), ...(conference.remote ?? [])];
    const next = (index: number) => {
      if (cancelled) return;
      if (!ctx || index >= sources.length) { fallback(); return; }
      const image = new Image();
      let settled = false;
      const failed = () => {
        if (settled || cancelled) return;
        settled = true;
        clearTimeout(timer);
        next(index + 1);
      };
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (settled || cancelled) return;
        try {
          canvas.width = 128;
          ctx.clearRect(0, 0, 128, 128);
          const scale = Math.min(128 / image.naturalWidth, 128 / image.naturalHeight);
          const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
          ctx.drawImage(image, (128 - w) / 2, (128 - h) / 2, w, h);
          const points = logoFilled(ctx.getImageData(0, 0, 128, 128).data, 128, 128, N);
          if (!points) { failed(); return; }
          settled = true;
          clearTimeout(timer);
          setConferencePoints(points);
          setConferenceReady(true);
        } catch { failed(); }
      };
      image.onerror = failed;
      timer = setTimeout(failed, 4_000);
      image.src = sources[index];
    };
    next(0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [conference]);
  const logoSrc = home.logoId ? logos[home.logoId] : undefined;
  useEffect(() => {
    setLogoPoints(null);
    setLogoReady(false);
    if (!logoSrc) { setLogoReady(true); return; }
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) { setLogoReady(true); return; }
        ctx.drawImage(image, 0, 0, 128, 128);
        setLogoPoints(logoOutline(ctx.getImageData(0, 0, 128, 128).data, 128, 128, N));
      } catch { /* Unreadable assets use a ring; a block is never shown. */ }
      setLogoReady(true);
    };
    image.onerror = () => { if (!cancelled) setLogoReady(true); };
    image.src = logoSrc;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [logoSrc]);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setStill(q.matches);
    change();
    q.addEventListener("change", change);
    return () => q.removeEventListener("change", change);
  }, []);


  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const canMarch = logoReady && (step !== 1 || !conference || conferenceReady);
  useEffect(() => {
    if (!visible) return;
    const clock = setInterval(() => !document.hidden && setNow(Date.now()), 1000);
    const dance = still || !canMarch ? undefined : setInterval(() => !document.hidden && setStep((s) => s + 1), isOhioState && step === scriptStep ? 28_000 : STEP_MS);
    setNow(Date.now());
    return () => {
      clearInterval(clock);
      if (dance) clearInterval(dance);
    };
  }, [visible, still, step, isOhioState, canMarch, scriptStep]);

  const left = halftimeLeft(seenAt, now);
  const phase = bandCue(left, step, !!conference);
  const f = FORMATIONS[Math.max(0, step - scriptStep) % FORMATIONS.length];
  const entering = step === 0 && phase === "logo";
  const scriptOhio = isOhioState && step === scriptStep && phase === "show";
  const target = scriptOhio ? SCRIPT_OHIO : phase === "conference" ? conferencePoints ?? FORMATIONS[0].pts : phase !== "show" ? logoPoints ?? FORMATIONS[0].pts : f.pts;
  const formationName = scriptOhio ? (dotting ? "Script Ohio · dotting the i" : "Script Ohio") : phase === "conference" ? `${home.conf} ${conferencePoints ? conferenceLettering ? "lettering" : "logo" : "logo unavailable · ring"}` : phase === "exit" ? "sideline exit" : phase === "logo" ? (logoPoints ? "home logo" : "ring") : f.name.toLowerCase();
  const drillReady = phase === "exit" || (logoReady && (phase !== "conference" || conferenceReady));
  useEffect(() => {
    if (!drillReady) return;
    setDotting(false);
    setDrill((prev) => {
      let points: BandPoint[];
      if (scriptOhio) {
        const letters = nearestAssignment(prev.points.filter((_, i) => i !== OHIO_DOTTER), SCRIPT_OHIO);
        let next = 0;
        points = prev.points.map((_, i) => i === OHIO_DOTTER ? (still ? OHIO_DOT : OHIO_STAGE) : letters[next++]);
      } else points = phase === "exit" ? exitPoints(prev.points) : nearestAssignment(prev.points, target);
      const angles = points.map(([x, y], i) => {
        const dx = x - prev.points[i][0], dy = y - prev.points[i][1];
        if (Math.hypot(dx, dy) < 0.1) return prev.angles[i];
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        while (angle - prev.angles[i] > 180) angle -= 360;
        while (angle - prev.angles[i] < -180) angle += 360;
        return angle;
      });
      return { points, angles, distances: points.map(([x, y], i) => Math.hypot(x - prev.points[i][0], y - prev.points[i][1])) };
    });
    setMoving(!still);
    // Hold the other 63 musicians, then let the sousaphone high-step to the dot.
    const dotTimer = scriptOhio && !still ? setTimeout(() => {
      setDotting(true);
      setDrill((prev) => ({
        ...prev,
        points: prev.points.map((p, i) => i === OHIO_DOTTER ? OHIO_DOT : p),
        angles: prev.angles.map((a, i) => {
          if (i !== OHIO_DOTTER) return a;
          let angle = -180;
          while (angle - a > 180) angle -= 360;
          while (angle - a < -180) angle += 360;
          return angle;
        }),
      }));
    }, MOVE_MS + 750) : undefined;
    const dotFinish = scriptOhio && !still ? setTimeout(() => { setDotting(false); setMoving(false); }, MOVE_MS + 750 + 7_000) : undefined;
    const timer = setTimeout(() => setMoving(false), phase === "exit" ? 29_000 : scriptOhio ? 24_000 : entering ? 15_000 : MOVE_MS);
    return () => { clearTimeout(timer); if (dotTimer) clearTimeout(dotTimer); if (dotFinish) clearTimeout(dotFinish); };
  }, [phase, target, still, scriptOhio, drillReady, entering]);
  const hc = teamColor(home.color) ?? "#2f7de1";
  const ac = teamColor(away.color) ?? "#c1403d";
  const label = left > 0 ? `Second half in ${clockText(left)}` : "Second half starting";
  const pctLeft = Math.round((left / HALFTIME_MS) * 100);
  const dots = useMemo(() => Array.from({ length: N }, (_, i) => i), []);
  const { angles, points } = drill;

  return (
    <div ref={ref} className={`halftime-band${moving ? " band-travel" : ""}${phase === "exit" ? " band-exit" : ""}${entering && moving ? " band-enter" : ""}${visible ? "" : " band-paused"}`} role="img" aria-label={`${label}. The ${home.abbr ?? home.name} band is on the field in a ${formationName} formation.`}>
      <div className="band-count" aria-hidden="true">
        <span className="band-count-k">HALFTIME</span>
        <strong className="band-count-t">{left > 0 ? clockText(left) : "0:00"}</strong>
        <span className="band-count-l">{left > 0 ? "until the second half" : "second half starting"}</span>
        <i className="band-count-bar"><b style={{ width: `${pctLeft}%` }} /></i>
      </div>
      {/* The stadium seen from directly above: end zones with the schools' names and logos, the home logo at midfield, and the
          home band in its uniforms — shakos with plumes, jackets with white trim, brass, drums and sousaphones. */}
      <svg viewBox="0 0 120 40" className="band-svg" aria-hidden="true">
        <FieldArt id={espnId} home={home} away={away} hc={hc} ac={ac} badge={badge} />
        <WeatherLayer weather={weather} period={2} h={40} seed={Number(espnId) || 1} />
        <text x="60" y="39" className="band-home-sideline" textAnchor="middle">{home.abbr ?? home.name} HOME SIDELINE</text>
        {dots.map((i) => {
          const [x, y] = points[i];
          const major = i === 0; // the drum major leads the band
          const role = major ? "major" : i % 16 < 2 ? "sousa" : i % 16 < 6 ? "drum" : i % 3 === 0 ? "wood" : "brass";
          return (
            <g
              key={i}
              className={`band-member ${role}${scriptOhio && dotting && i === OHIO_DOTTER ? " band-dotter" : ""}`}
              style={{ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`, ["--band-phase" as string]: `${-(Math.floor(i / 16) % 2) * 0.025}s`, transitionDuration: still ? "0s" : entering ? `${Math.min(14, Math.max(4, drill.distances[i] / 3.5))}s` : scriptOhio && dotting && i === OHIO_DOTTER ? "7s" : phase === "exit" ? `${Math.min(27, Math.max(4, drill.distances[i] / 1.8))}s` : `${MOVE_MS / 1000}s`, transitionDelay: phase === "exit" || entering ? `${(i % 8) * 0.12}s` : "0s" }}
            >
              <ellipse cx="0.3" cy="0.45" rx="1.25" ry="0.75" className="band-ground-shadow" />
              <g className="band-facing" style={{ transform: `rotate(${angles[i].toFixed(1)}deg)` }}>
              <g className="band-march">
              <ellipse className="band-foot a" cx="0" cy="-0.7" rx="0.85" ry="0.38" />
              <ellipse className="band-foot b" cx="0" cy="0.7" rx="0.85" ry="0.38" />
              <ellipse cx="0.25" cy="0.3" rx={role === "sousa" ? 2.1 : 1.5} ry={role === "sousa" ? 1.7 : 1} className="band-shadow" />
              {/* jacket with white shoulder trim and a chest stripe */}
              <ellipse cx="0" cy="0" rx="0.85" ry="1.45" fill={major ? "#f6f6f6" : hc} className="band-shoulders" />
              <ellipse cx="0" cy="-1.05" rx="0.35" ry="0.28" fill={major ? "#d9b13b" : "#ffffff"} className="band-epaulet" />
              <ellipse cx="0" cy="1.05" rx="0.35" ry="0.28" fill={major ? "#d9b13b" : "#ffffff"} className="band-epaulet" />
              <line x1="-0.3" x2="-0.3" y1="-1" y2="1" stroke={major ? "#d9b13b" : mix(hc, 0.7)} strokeWidth="0.22" />
              {(role === "wood" || role === "major") && (
                <>
                  <ellipse className="band-arm a" cx="0.2" cy="-1.35" rx="0.55" ry="0.28" fill={major ? "#f6f6f6" : mix(hc, -0.1)} />
                  <ellipse className="band-arm b" cx="0.2" cy="1.35" rx="0.55" ry="0.28" fill={major ? "#f6f6f6" : mix(hc, -0.1)} />
                </>
              )}
              {role === "sousa" && <g><circle cx="0.5" cy="0" r="1.55" className="band-sousa" /><ellipse cx="1.35" cy="-0.6" rx="0.85" ry="0.65" className="band-bell" /><ellipse cx="1.4" cy="-0.6" rx="0.48" ry="0.37" className="band-bell-inner" /></g>}
              {role === "brass" && <g><path d="M0.5 -0.15H1.4V0.15H0.5" className="band-brass" /><ellipse cx="1.6" cy="0" rx="0.55" ry="0.65" className="band-bell" /><ellipse cx="1.7" cy="0" rx="0.25" ry="0.4" className="band-bell-inner" /></g>}
              {role === "wood" && <line x1="0.6" x2="1.9" y1="0" y2="0" className="band-wood" />}
              {role === "drum" && <g><circle cx="1.05" cy="0" r="0.85" className="band-drum" stroke={hc} /><path d="M0.65 -1.1L1.2 -0.25M0.65 1.1L1.2 0.25" className="band-sticks" /></g>}
              {role === "major" && <line x1="0.6" x2="2.6" y1="0.5" y2="-0.6" className="band-baton" />}
              {/* shako: brim ring, crown and a tall plume */}
              <circle cx="0.05" cy="0" r="0.72" fill={major ? "#f6f6f6" : mix(hc, -0.25)} className="band-hat" />
              <circle cx="0.05" cy="0" r="0.45" fill={major ? "#d9b13b" : hc} className="band-crown" />
              <ellipse cx="-0.25" cy="-0.1" rx={major ? 0.5 : 0.3} ry={major ? 0.9 : 0.55} className="band-plume" />
              </g>
              </g>
            </g>
          );
        })}
      </svg>
      <p className="drive-cap">
        <span className="drive-dot" aria-hidden="true" />
        <b>{phase === "exit" ? "Band clearing the field" : entering && moving ? "Band entering from the home sideline" : label}</b>
        <span> · {home.abbr ?? home.name} band: {formationName}</span>
      </p>
    </div>
  );
}
