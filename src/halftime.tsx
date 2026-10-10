import { useEffect, useMemo, useRef, useState } from "react";
import { logos, teamColor } from "./data";
import type { GameBadge } from "./gameLogo";
import { FORMATIONS, HALFTIME_MS, N, STEP_MS, anglesAt, clockText, firstSeen, halftimeLeft } from "./halftimeLogic";

/**
 * College halftime: a 20-minute countdown and the band marching through formations on the field. It stands in for the drive
 * chart while the game is at halftime (college games only). Still for visitors who ask for reduced motion.
 */
type Side = { abbr?: string; name: string; color?: string | null; logoId?: string };

/** Mix a #rrggbb color toward white (t > 0) or black (t < 0). */
function mix(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t)));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function HalftimeBand({ espnId, home, away, badge }: { espnId: string; home: Side; away: Side; badge?: GameBadge | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seenAt] = useState(() => firstSeen(espnId, Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);
  const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const clock = setInterval(() => !document.hidden && setNow(Date.now()), 1000);
    const dance = still ? undefined : setInterval(() => !document.hidden && setStep((s) => s + 1), STEP_MS);
    setNow(Date.now());
    return () => {
      clearInterval(clock);
      if (dance) clearInterval(dance);
    };
  }, [visible, still]);

  const left = halftimeLeft(seenAt, now);
  const f = FORMATIONS[step % FORMATIONS.length];
  const hc = teamColor(home.color) ?? "#2f7de1";
  const ac = teamColor(away.color) ?? "#c1403d";
  const label = left > 0 ? `Second half in ${clockText(left)}` : "Second half starting";
  const pctLeft = Math.round((left / HALFTIME_MS) * 100);
  const dots = useMemo(() => Array.from({ length: N }, (_, i) => i), []);
  const angles = anglesAt(step);

  return (
    <div ref={ref} className="halftime-band" role="img" aria-label={`${label}. The ${home.abbr ?? home.name} band is on the field in a ${f.name.toLowerCase()} formation.`}>
      <div className="band-count" aria-hidden="true">
        <span className="band-count-k">HALFTIME</span>
        <strong className="band-count-t">{left > 0 ? clockText(left) : "0:00"}</strong>
        <span className="band-count-l">{left > 0 ? "until the second half" : "second half starting"}</span>
        <i className="band-count-bar"><b style={{ width: `${pctLeft}%` }} /></i>
      </div>
      {/* The stadium seen from directly above: end zones with the schools' names and logos, the home logo at midfield, and the
          home band in its uniforms — shakos with plumes, jackets with white trim, brass, drums and sousaphones. */}
      <svg viewBox="0 0 120 40" className="band-svg" aria-hidden="true">
        <defs>
          <radialGradient id={`turf-${espnId}`} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#2b6a3a" />
            <stop offset="100%" stopColor="#1a4a29" />
          </radialGradient>
          <pattern id={`ez-${espnId}-a`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="3" fill={ac} />
            <rect width="1.2" height="3" fill={mix(ac, -0.22)} />
          </pattern>
          <pattern id={`ez-${espnId}-h`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="3" fill={hc} />
            <rect width="1.2" height="3" fill={mix(hc, -0.22)} />
          </pattern>
        </defs>
        <rect x="0" y="0" width="120" height="40" fill={`url(#turf-${espnId})`} />
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={10 + i * 10} y="0" width="10" height="40" className={i % 2 ? "df-stripe" : "df-stripe alt"} />
        ))}
        {/* end zones: team color, diagonal weave, the school name in block letters and its logo */}
        <rect x="0" y="0" width="10" height="40" fill={`url(#ez-${espnId}-a)`} />
        <rect x="110" y="0" width="10" height="40" fill={`url(#ez-${espnId}-h)`} />
        {[[away, 5, -90] as const, [home, 115, 90] as const].map(([t, x, rot], k) => (
          <g key={k}>
            <text x={x} y="20" className="band-ez" transform={`rotate(${rot} ${x} 20)`} textAnchor="middle" dominantBaseline="central" textLength={Math.min(26, Math.max(14, t.name.length * 3))} lengthAdjust="spacingAndGlyphs">
              {t.name.toUpperCase()}
            </text>
            {t.logoId && logos[t.logoId] && <image href={logos[t.logoId]} x={x - 3.4} y={k === 0 ? 31 : 3} width="6.8" height="6.8" preserveAspectRatio="xMidYMid meet" />}
            {t.logoId && logos[t.logoId] && <image href={logos[t.logoId]} x={x - 3.4} y={k === 0 ? 2.2 : 31} width="6.8" height="6.8" preserveAspectRatio="xMidYMid meet" opacity="0.9" />}
          </g>
        ))}
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
        {/* midfield: the home team's logo, painted on the turf */}
        <circle cx="60" cy="20" r="9.4" className="band-mid-ring" />
        {/* a special or neutral-site game paints its own logo here; any other game, the home team's */}
        {badge?.src ? <image href={badge.src} x="50" y="10" width="20" height="20" preserveAspectRatio="xMidYMid meet" className="band-mid-logo" data-game-logo />
          : !badge?.neutral && home.logoId && logos[home.logoId] && <image href={logos[home.logoId]} x="50" y="10" width="20" height="20" preserveAspectRatio="xMidYMid meet" className="band-mid-logo" />}
        {dots.map((i) => {
          const [x, y] = f.pts[i];
          const major = i === 0; // the drum major leads the band
          const role = major ? "major" : i % 16 < 2 ? "sousa" : i % 16 < 6 ? "drum" : i % 3 === 0 ? "wood" : "brass";
          return (
            <g
              key={i}
              className={`band-member ${role}`}
              style={{ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${angles[i].toFixed(1)}deg)`, transitionDelay: `${(i % 4) * 40}ms` }}
            >
              <g className="band-march" style={{ animationDelay: `${-(i % 8) * 60}ms` }}>
              <ellipse className="band-foot a" cx="0" cy="-0.75" rx="0.75" ry="0.34" />
              <ellipse className="band-foot b" cx="0" cy="0.75" rx="0.75" ry="0.34" />
              <ellipse cx="0.25" cy="0.3" rx={role === "sousa" ? 2.1 : 1.5} ry={role === "sousa" ? 1.7 : 1} className="band-shadow" />
              {/* jacket with white shoulder trim and a chest stripe */}
              <ellipse cx="0" cy="0" rx="0.85" ry="1.45" fill={major ? "#f6f6f6" : hc} className="band-shoulders" />
              <ellipse cx="0" cy="-1.05" rx="0.35" ry="0.28" fill={major ? "#d9b13b" : "#ffffff"} className="band-epaulet" />
              <ellipse cx="0" cy="1.05" rx="0.35" ry="0.28" fill={major ? "#d9b13b" : "#ffffff"} className="band-epaulet" />
              <line x1="-0.3" x2="-0.3" y1="-1" y2="1" stroke={major ? "#d9b13b" : mix(hc, 0.7)} strokeWidth="0.22" />
              {role === "sousa" && <circle cx="0.5" cy="0" r="1.55" className="band-sousa" />}
              {role === "brass" && <ellipse cx="1.4" cy="0" rx="0.8" ry="0.55" className="band-brass" />}
              {role === "wood" && <line x1="0.6" x2="1.9" y1="0" y2="0" className="band-wood" />}
              {role === "drum" && <circle cx="1.05" cy="0" r="0.85" className="band-drum" stroke={hc} />}
              {role === "major" && <line x1="0.6" x2="2.6" y1="0.5" y2="-0.6" className="band-baton" />}
              {/* shako: brim ring, crown and a tall plume */}
              <circle cx="0.05" cy="0" r="0.72" fill={major ? "#f6f6f6" : mix(hc, -0.25)} className="band-hat" />
              <circle cx="0.05" cy="0" r="0.45" fill={major ? "#d9b13b" : hc} className="band-crown" />
              <ellipse cx="-0.25" cy="-0.1" rx={major ? 0.5 : 0.3} ry={major ? 0.9 : 0.55} className="band-plume" />
              </g>
            </g>
          );
        })}
      </svg>
      <p className="drive-cap">
        <span className="drive-dot" aria-hidden="true" />
        <b>{label}</b>
        <span> · {home.abbr ?? home.name} band: {f.name.toLowerCase()}</span>
      </p>
    </div>
  );
}
