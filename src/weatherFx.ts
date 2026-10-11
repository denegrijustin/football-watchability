// Which weather effects a game's field should show, and how hard, from the game's weather block (see weatherFor in
// scripts/build-slate.mjs). Pure (no site data) so tests can use it.
export type Hour = {
  /** The hour the reading starts, as an instant (ISO). */
  at?: string;
  precip: number;
  windMph: number;
  gustMph: number;
  dir?: string;
  tempF?: number;
  /** Inches of precipitation that hour, and the WMO weather code: what is really falling. Older data has neither. */
  rainIn?: number;
  code?: number;
};
export type WeatherLike = {
  title?: string;
  icon?: string;
  indoor?: boolean;
  factors?: { key: string; level: number }[];
  hours?: Hour[];
};
export type Fx = {
  /** 0 = none, 1 light, 2 steady, 3 heavy */
  rain: number;
  snow: number;
  wind: number;
  storm: boolean;
  fog: boolean;
  drizzle: boolean;
  /** -1 blowing toward the left of the screen, +1 toward the right, 0 straight along the field's length */
  drift: number;
  /** How thick the rain or snow is, 0 to 1, continuous (the levels above are its steps). */
  rate: number;
  windMph: number;
  windText: string;
  rainText: string;
};

const FROM: Record<string, number> = { N: 0, NNE: 22, NE: 45, ENE: 67, E: 90, ESE: 112, SE: 135, SSE: 157, S: 180, SSW: 202, SW: 225, WSW: 247, W: 270, WNW: 292, NW: 315, NNW: 337 };

/** Wind from the east blows toward the left of the page, from the west toward the right. */
const driftOf = (dir?: string) => (dir && dir in FROM ? -Math.round(Math.sin((FROM[dir] * Math.PI) / 180) * 10) / 10 : 0);

const NONE: Fx = { rain: 0, snow: 0, wind: 0, storm: false, fog: false, drizzle: false, drift: 0, rate: 0, windMph: 0, windText: "", rainText: "" };

const HOUR = 3600e3;
const isSnowCode = (c?: number) => c != null && ((c >= 71 && c <= 77) || c === 85 || c === 86);
const isRainCode = (c?: number) => c != null && ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The forecast as it stands at `nowMs`. Each reading stands for the middle of its hour, and the time between two readings
 * blends them, so the sky changes gradually as the game goes on instead of jumping at each quarter.
 */
export function readingAt(hours: Hour[], nowMs: number): Hour | null {
  const stamped = hours.filter((h) => h.at && !Number.isNaN(Date.parse(h.at)));
  if (!stamped.length) return null;
  const mid = (h: Hour) => Date.parse(h.at!) + HOUR / 2;
  if (nowMs <= mid(stamped[0])) return stamped[0];
  const last = stamped[stamped.length - 1];
  if (nowMs >= mid(last)) return last;
  const i = stamped.findIndex((h, k) => nowMs >= mid(h) && nowMs < mid(stamped[k + 1]));
  const a = stamped[i];
  const b = stamped[i + 1];
  const t = (nowMs - mid(a)) / (mid(b) - mid(a));
  const near = t < 0.5 ? a : b; // what kind of weather it is does not blend: the nearer reading's sky wins
  return {
    ...near,
    precip: lerp(a.precip, b.precip, t),
    windMph: lerp(a.windMph, b.windMph, t),
    gustMph: lerp(a.gustMph, b.gustMph, t),
    tempF: a.tempF != null && b.tempF != null ? lerp(a.tempF, b.tempF, t) : near.tempF,
    rainIn: a.rainIn != null && b.rainIn != null ? lerp(a.rainIn, b.rainIn, t) : near.rainIn,
  };
}

/**
 * What to draw. With `nowMs` the forecast is read at that moment (the game as it is being played); else `period` (the quarter in
 * play, 1-4, beyond that overtime) picks that hour's reading; else the worst of the game decides.
 */
export function weatherFx(w: WeatherLike | null | undefined, period?: number | null, nowMs?: number | null): Fx {
  if (!w || w.indoor) return NONE;
  const level = (k: string) => w.factors?.find((f) => f.key === k)?.level ?? 0;
  const hours = w.hours ?? [];
  if (!w.factors?.length && !hours.some((h) => h.code != null)) return NONE;

  let r: Hour | null = null;
  if (nowMs != null) r = readingAt(hours, nowMs);
  if (!r && period && hours.length) r = hours[Math.min(hours.length, Math.max(1, period)) - 1];
  const worst = !r && hours.length ? hours.reduce((m, h) => (h.precip > m.precip || h.gustMph > m.gustMph ? { ...m, precip: Math.max(m.precip, h.precip), gustMph: Math.max(m.gustMph, h.gustMph), windMph: Math.max(m.windMph, h.windMph), rainIn: Math.max(m.rainIn ?? 0, h.rainIn ?? 0), code: h.precip >= m.precip ? h.code ?? m.code : m.code } : m), { ...hours[0] }) : null;
  const x = r ?? worst;

  const factorStorm = level("storm") > 0;
  const code = x?.code;
  const storm = factorStorm && !x?.code ? true : code != null ? code >= 95 : factorStorm;
  const fog = code === 45 || code === 48;
  const drizzle = code != null && code >= 51 && code <= 57;

  // How hard it is coming down.
  let rain = 0;
  let rate = 0;
  if (x?.rainIn != null && code != null) {
    // Real amounts: inches that hour. A tenth of an inch an hour is steady rain; 0.3 is a downpour.
    const wet = isRainCode(code) || (x.rainIn >= 0.01 && x.precip >= 25);
    rate = wet ? Math.min(1, Math.max(x.rainIn / 0.3, drizzle ? 0.12 : 0.18)) : 0;
    rain = !rate ? 0 : rate < 0.25 ? 1 : rate < 0.55 ? 2 : 3;
  } else {
    const byPop = (p: number) => (p >= 70 ? 3 : p >= 50 ? 2 : p >= 30 ? 1 : 0);
    rain = level("rain");
    if (x && hours.length) rain = rain ? Math.min(rain, Math.max(byPop(x.precip), x.precip >= 20 ? 1 : 0)) : 0;
    rate = rain / 3;
  }
  if (storm) {
    rain = Math.max(rain, 3);
    rate = Math.max(rate, 0.8);
  }
  const snowing = x?.code != null ? isSnowCode(code) || (rain > 0 && x.tempF != null && x.tempF <= 32) : level("snow") > 0;
  const snow = snowing ? (rate >= 0.55 || level("snow") >= 3 ? 2 : 1) : 0;
  if (snow) rain = 0;
  if (snow) rate = Math.max(rate, 0.4);

  // Wind shows when it is strong enough to matter to the kicking game: gusts of 25 mph or more.
  const gust = x?.gustMph ?? 0;
  const wind = hours.length ? (gust >= 35 ? 3 : gust >= 25 ? 2 : 0) : level("wind") >= 2 ? level("wind") : 0;
  const dir = x?.dir ?? hours[0]?.dir;
  const windMph = Math.round(x ? Math.max(x.windMph, x.gustMph) : 0);
  return {
    rain,
    snow,
    wind,
    storm,
    fog,
    drizzle: drizzle && rain > 0,
    drift: driftOf(dir),
    rate,
    windMph,
    windText: wind ? `wind ${dir ?? ""} ${windMph} mph`.replace("  ", " ") : "",
    rainText: snow ? (snow > 1 ? "heavy snow" : "snow") : fog ? "fog" : rain ? (drizzle ? "drizzle" : ["", "light rain", "rain", "heavy rain"][rain]) : "",
  };
}

export const hasFx = (fx: Fx) => fx.rain > 0 || fx.snow > 0 || fx.wind > 0 || fx.storm || fx.fog;
/** "heavy rain · wind E 31 mph" for a caption. */
export const fxText = (fx: Fx) => [fx.storm ? "storms" : "", fx.rainText, fx.windText].filter(Boolean).join(" · ");
