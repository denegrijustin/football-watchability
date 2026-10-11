// Which weather effects a game's field should show, from the game's weather block (see weatherFor in scripts/build-slate.mjs).
// Pure (no site data) so tests can use it.
export type WeatherLike = {
  title?: string;
  icon?: string;
  indoor?: boolean;
  factors?: { key: string; level: number }[];
  hours?: { precip: number; windMph: number; gustMph: number; dir?: string; tempF?: number }[];
};
export type Fx = {
  /** 0 = none, 1 light, 2 steady, 3 heavy */
  rain: number;
  snow: number;
  wind: number;
  storm: boolean;
  /** -1 blowing toward the left of the screen, +1 toward the right, 0 straight along the field's length */
  drift: number;
  windText: string;
  rainText: string;
};

const FROM: Record<string, number> = { N: 0, NNE: 22, NE: 45, ENE: 67, E: 90, ESE: 112, SE: 135, SSE: 157, S: 180, SSW: 202, SW: 225, WSW: 247, W: 270, WNW: 292, NW: 315, NNW: 337 };

/** Wind from the east blows toward the left of the page, from the west toward the right. */
const driftOf = (dir?: string) => (dir && dir in FROM ? -Math.round(Math.sin((FROM[dir] * Math.PI) / 180) * 10) / 10 : 0);

const NONE: Fx = { rain: 0, snow: 0, wind: 0, storm: false, drift: 0, windText: "", rainText: "" };

/**
 * `period` is the quarter in play (1-4, or beyond for overtime) when the game is live: that hour's forecast then sets how
 * hard it is coming down right now; otherwise the worst of the game does.
 */
export function weatherFx(w: WeatherLike | null | undefined, period?: number | null): Fx {
  if (!w || w.indoor || !w.factors?.length) return NONE;
  const level = (k: string) => w.factors!.find((f) => f.key === k)?.level ?? 0;
  const hour = period && w.hours?.length ? w.hours[Math.min(w.hours.length, Math.max(1, period)) - 1] : null;
  const storm = level("storm") > 0;
  const byPop = (p: number) => (p >= 70 ? 3 : p >= 50 ? 2 : p >= 30 ? 1 : 0);
  let rain = level("rain");
  if (storm) rain = Math.max(rain, 3);
  // The quarter's own chance of rain eases or confirms the game-long figure.
  if (hour && rain && !storm) rain = Math.min(rain, Math.max(byPop(hour.precip), hour.precip >= 20 ? 1 : 0));
  const snow = level("snow") > 0 ? (level("snow") >= 3 ? 2 : 1) : 0;
  if (snow) rain = 0; // snow is what is falling, not rain
  // Wind shows when it is strong enough to matter to the kicking game: gusts of 25 mph or more.
  const gust = hour?.gustMph ?? 0;
  const gameWind = level("wind");
  let wind = gameWind >= 2 ? gameWind : 0;
  if (hour) wind = wind ? (gust >= 35 ? 3 : gust >= 25 ? 2 : 0) : 0;
  const dir = hour?.dir ?? w.hours?.[0]?.dir;
  const windMph = hour ? Math.max(hour.windMph, hour.gustMph) : Math.max(...(w.hours ?? []).map((h) => h.gustMph), 0);
  return {
    rain,
    snow,
    wind,
    storm,
    drift: driftOf(dir),
    windText: wind ? `wind ${dir ?? ""} ${windMph} mph`.replace("  ", " ") : "",
    rainText: snow ? "snow" : rain ? ["", "light rain", "rain", "heavy rain"][rain] : "",
  };
}

export const hasFx = (fx: Fx) => fx.rain > 0 || fx.snow > 0 || fx.wind > 0 || fx.storm;
/** "heavy rain · wind E 31 mph" for a caption. */
export const fxText = (fx: Fx) => [fx.storm ? "storms" : "", fx.rainText, fx.windText].filter(Boolean).join(" · ");
