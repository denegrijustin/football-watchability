import { useEffect, useState, useId } from "react";
import { fxText, hasFx, weatherFx, type Fx, type WeatherLike } from "./weatherFx";

// A cheap pseudo-random number from an index, so every render draws the same sky.
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** The time, refreshed every minute, so the sky follows the forecast hour by hour while a game is watched. */
export function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * The weather over a field, read at this moment: the forecast hour (blended with the next) decides whether it is raining,
 * snowing, foggy or storming, how hard, and how fast the wind is blowing it. Redrawn every minute.
 */
export function WeatherLayer({ weather, period, seed = 1, w = 120, h = 34, y0 = 0, compact = false }: { weather?: WeatherLike | null; period?: number | null; seed?: number; w?: number; h?: number; y0?: number; compact?: boolean }) {
  const now = useMinute();
  const fx = weatherFx(weather, period, now);
  return hasFx(fx) ? <WeatherFx fx={fx} w={w} h={h} y0={y0} seed={seed} compact={compact} /> : null;
}
/** The caption for the same moment. */
export const weatherCaption = (weather: WeatherLike | null | undefined, period?: number | null) => {
  const fx = weatherFx(weather, period, Date.now());
  return hasFx(fx) ? fxText(fx) : "";
};

/**
 * Weather over a field drawn in SVG units (w by h). Rain falls in two depths (small, slow, faint ones behind big, fast,
 * bright ones), slanted by the wind's real speed, and splashes where it lands; heavy rain adds mist along the turf. Snow
 * drifts down in three sizes. Wind blows streaks across at a speed that follows the mph. Fog drifts in banks. Storms darken
 * the sky and flash. Still for visitors who ask for reduced motion.
 */
export function WeatherFx({ fx, w = 120, h = 34, y0 = 0, seed = 1, compact = false }: { fx: Fx; w?: number; h?: number; y0?: number; seed?: number; compact?: boolean }) {
  const scale = compact ? 0.6 : 1;
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = `wx-${instance}-${seed}-${compact ? "c" : "f"}`;
  const dirn = fx.drift >= 0 ? 1 : -1;
  // How far a raindrop is carried sideways while it falls: the wind's mph against a fall of about 20.
  const lean = fx.drift * Math.min(h * 0.65, fx.windMph * 0.22);
  const drops = fx.rain ? Math.round((12 + fx.rate * 64) * scale) : 0;
  const splashes = fx.rain >= 2 ? Math.round((5 + fx.rate * 12) * scale) : 0;
  const flakes = fx.snow ? Math.round((16 + fx.rate * 34) * scale) : 0;
  const gusts = fx.wind ? [0, 0, 7, 12][fx.wind] : 0;
  const gustSpeed = Math.max(0.7, 2.4 - fx.windMph / 22);
  const fall = h + 8;
  const tint = fx.storm ? 0.2 : fx.snow ? 0.06 : fx.fog ? 0.12 : fx.rain ? 0.05 + fx.rate * 0.08 : 0;
  const tintColor = fx.snow ? "#dce8f5" : fx.fog ? "#c9d3dc" : "#07162b";
  return (
    <g className="wx" aria-hidden="true" clipPath={`url(#${id}-clip)`} style={{ ["--wx-storm-period" as string]: `${14 + rnd(seed, 41) * 9}s` }}>
      <defs>
        <clipPath id={`${id}-clip`}><rect x="0" y={y0} width={w} height={h} /></clipPath>
        <radialGradient id={`${id}-cloud`}>
          <stop offset="0" stopColor="#edf2f6" stopOpacity="0.32" />
          <stop offset="1" stopColor="#edf2f6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-light`} cx="65%" cy="0%" r="100%">
          <stop offset="0" stopColor="#e0e9ff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#cbdcff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dfeaf5" stopOpacity="0" />
          <stop offset="1" stopColor="#dfeaf5" stopOpacity="0.38" />
        </linearGradient>
      </defs>
      {tint > 0 && <rect x="0" y={y0} width={w} height={h} fill={tintColor} opacity={tint} className="wx-tint" />}
      {fx.fog &&
        Array.from({ length: compact ? 3 : 5 }, (_, i) => (
          <ellipse
            key={`f${i}`}
            className="wx-fog"
            cx={rnd(i, seed + 20) * w}
            cy={y0 + h * (0.2 + rnd(i, seed + 21) * 0.65)}
            rx={22 + rnd(i, seed + 22) * 16}
            ry={4 + rnd(i, seed + 23) * 4}
            fill={`url(#${id}-cloud)`}
            style={{ animationDuration: `${26 + rnd(i, seed + 24) * 20}s`, animationDelay: `${-rnd(i, seed + 25) * 30}s`, ["--wx-dx" as string]: `${dirn * 36}px` }}
          />
        ))}
      {Array.from({ length: drops }, (_, i) => {
        const near = i % 5 < 2; // two in five are close to the viewer: bigger, faster, brighter
        const len = (near ? 3.2 : 1.9) * (fx.drizzle ? 0.6 : 1) + rnd(i, seed + 1) * 1.2;
        const travelX = lean * (near ? 1 : 0.8);
        const travelY = fall + 4;
        const v = Math.hypot(travelX, travelY);
        const dx = travelX * len / v;
        const dy = travelY * len / v;
        const x = rnd(i, seed) * (w + 14) - 7 - lean * 0.3;
        return (
          <line
            key={`r${i}`}
            className={near ? "wx-drop near" : "wx-drop far"}
            x1={x}
            y1={y0 - 4}
            x2={x + dx}
            y2={y0 - 4 + dy}
            style={{
              animationDelay: `${-rnd(i, seed + 2) * 1.4}s`,
              animationDuration: `${(near ? 0.46 : 0.8) + rnd(i, seed + 3) * 0.25}s`,
              ["--wx-dx" as string]: `${travelX}px`,
              ["--wx-still" as string]: rnd(i, seed + 36),
              ["--wx-dy" as string]: `${fall + 4}px`,
            }}
          />
        );
      })}
      {Array.from({ length: splashes }, (_, i) => (
        <ellipse
          key={`p${i}`}
          className="wx-splash"
          cx={rnd(i, seed + 30) * (w - 24) + 12}
          cy={y0 + 2 + rnd(i, seed + 31) * Math.max(0, h - 4)}
          rx="1.3"
          ry="0.4"
          style={{ animationDelay: `${-rnd(i, seed + 32) * 0.9}s`, animationDuration: `${0.55 + rnd(i, seed + 33) * 0.4}s` }}
        />
      ))}
      {fx.rain >= 3 && <rect x="0" y={y0 + h * 0.62} width={w} height={h * 0.38} fill={`url(#${id}-mist)`} className="wx-mist" />}
      {Array.from({ length: flakes }, (_, i) => {
        const size = i % 3; // 0 small & slow & faint, 2 large & quicker
        return (
          <circle
            key={`s${i}`}
            className="wx-flake"
            cx={rnd(i, seed + 4) * w}
            cy={y0 - 2}
            r={0.28 + size * 0.28 + rnd(i, seed + 5) * 0.15}
            opacity={0.5 + size * 0.2}
            style={{
              animationDelay: `${-rnd(i, seed + 6) * 8}s`,
              animationDuration: `${(6.5 - size * 1.4) + rnd(i, seed + 7) * 2}s`,
              ["--wx-dx" as string]: `${fx.drift * Math.min(14, 3 + fx.windMph / 2) + (rnd(i, seed + 8) - 0.5) * 5}px`,
              ["--wx-dy" as string]: `${h + 4}px`,
              ["--wx-still" as string]: rnd(i, seed + 37),
              ["--wx-sway" as string]: `${0.5 + rnd(i, seed + 38) * 1.6}px`,
            }}
          />
        );
      })}
      {Array.from({ length: gusts }, (_, i) => {
        const y = y0 + 2 + rnd(i, seed + 9) * (h - 4);
        const len = 5 + rnd(i, seed + 10) * 9 + fx.windMph / 8;
        return (
          <line
            key={`w${i}`}
            className="wx-gust"
            x1={dirn > 0 ? -len : w + len}
            x2={dirn > 0 ? 0 : w}
            y1={y}
            y2={y + (rnd(i, seed + 11) - 0.5) * 1.6}
            style={{ animationDelay: `${-rnd(i, seed + 12) * 3}s`, animationDuration: `${gustSpeed + rnd(i, seed + 13) * 0.6}s`, ["--wx-dx" as string]: `${dirn * (w + len * 2)}px` }}
          />
        );
      })}
      {fx.storm && (
        <>
          <rect x="0" y={y0} width={w} height={h} fill={`url(#${id}-light)`} className="wx-flash" />

        </>
      )}
    </g>
  );
}
