import type { Fx } from "./weatherFx";

// A cheap pseudo-random number from an index, so every render draws the same sky.
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Weather over a field drawn in SVG units (w by h): rain streaks, snow flakes and wind streaks, falling and blowing with the
 * game's own forecast. Sits above the turf and below the markings that matter. Still for visitors who ask for reduced motion.
 */
export function WeatherFx({ fx, w = 120, h = 34, y0 = 0, seed = 1, compact = false }: { fx: Fx; w?: number; h?: number; y0?: number; seed?: number; compact?: boolean }) {
  const scale = compact ? 0.6 : 1;
  const rain = fx.rain ? Math.round([0, 22, 40, 64][fx.rain] * scale) : 0;
  const snow = fx.snow ? Math.round([0, 18, 34][fx.snow] * scale) : 0;
  const wind = fx.wind ? [0, 0, 7, 12][fx.wind] : 0;
  const slant = fx.drift * 3 + (fx.wind ? fx.drift * 2 : 0);
  return (
    <g className="wx" aria-hidden="true">
      {(rain > 0 || snow > 0) && <rect x="0" y={y0} width={w} height={h} className={`wx-tint ${snow ? "snow" : "rain"}`} />}
      {Array.from({ length: rain }, (_, i) => {
        const x = rnd(i, seed) * (w + 12) - 6;
        const len = 2.4 + rnd(i, seed + 1) * 2.2;
        return (
          <line
            key={`r${i}`}
            className="wx-drop"
            x1={x}
            y1={y0 - 4}
            x2={x + slant * 0.5}
            y2={y0 - 4 + len}
            style={{ animationDelay: `${-rnd(i, seed + 2) * 1.2}s`, animationDuration: `${0.55 + rnd(i, seed + 3) * 0.3}s`, ["--wx-dx" as string]: `${slant * (h / 8)}px`, ["--wx-dy" as string]: `${h + 8}px` }}
          />
        );
      })}
      {Array.from({ length: snow }, (_, i) => (
        <circle
          key={`s${i}`}
          className="wx-flake"
          cx={rnd(i, seed + 4) * w}
          cy={y0 - 2}
          r={0.35 + rnd(i, seed + 5) * 0.5}
          style={{ animationDelay: `${-rnd(i, seed + 6) * 6}s`, animationDuration: `${4 + rnd(i, seed + 7) * 3}s`, ["--wx-dx" as string]: `${fx.drift * 6 + (rnd(i, seed + 8) - 0.5) * 6}px`, ["--wx-dy" as string]: `${h + 4}px` }}
        />
      ))}
      {Array.from({ length: wind }, (_, i) => {
        const dir = fx.drift >= 0 ? 1 : -1;
        const y = y0 + 2 + rnd(i, seed + 9) * (h - 4);
        const len = 5 + rnd(i, seed + 10) * 9;
        return (
          <line
            key={`w${i}`}
            className="wx-gust"
            x1={dir > 0 ? -len : w + len}
            x2={dir > 0 ? 0 : w}
            y1={y}
            y2={y + (rnd(i, seed + 11) - 0.5) * 1.6}
            style={{ animationDelay: `${-rnd(i, seed + 12) * 2.5}s`, animationDuration: `${1.6 - fx.wind * 0.25 + rnd(i, seed + 13) * 0.5}s`, ["--wx-dx" as string]: `${dir * (w + len * 2)}px` }}
          />
        );
      })}
      {fx.storm && <rect x="0" y={y0} width={w} height={h} className="wx-flash" />}
    </g>
  );
}
