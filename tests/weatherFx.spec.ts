import { expect, test } from "./fixtures";
import { fxText, hasFx, weatherFx } from "../src/weatherFx";

const hours = (precip: number[], gust: number[], dir = "E") => precip.map((p, i) => ({ precip: p, windMph: Math.round(gust[i] / 2), gustMph: gust[i], dir }));

test("a game with no weather impact, or indoors, gets no effects", () => {
  expect(hasFx(weatherFx({ factors: [] }))).toBe(false);
  expect(hasFx(weatherFx({ indoor: true }))).toBe(false);
  expect(hasFx(weatherFx(null))).toBe(false);
  expect(hasFx(weatherFx({ factors: [{ key: "heat", level: 2 }, { key: "cold", level: 1 }] }))).toBe(false); // heat and cold aren't drawn
  expect(hasFx(weatherFx({ factors: [{ key: "wind", level: 1 }] }))).toBe(false); // a steady breeze is not worth drawing
});

test("rain, snow and wind come from the game's factors, and heavier levels draw more", () => {
  expect(weatherFx({ factors: [{ key: "rain", level: 3 }] }).rain).toBe(3);
  expect(weatherFx({ factors: [{ key: "rain", level: 1 }] }).rain).toBe(1);
  expect(weatherFx({ factors: [{ key: "wind", level: 2 }] }).wind).toBe(2);
  const s = weatherFx({ factors: [{ key: "snow", level: 3 }, { key: "rain", level: 2 }] });
  expect(s.snow).toBe(2);
  expect(s.rain).toBe(0); // snow is falling, not rain
  expect(weatherFx({ factors: [{ key: "storm", level: 3 }] })).toMatchObject({ storm: true, rain: 3 });
});

test("live, the quarter's own forecast decides how hard it is coming down and blowing", () => {
  const w = { factors: [{ key: "rain", level: 3 }, { key: "wind", level: 3 }], hours: hours([76, 64, 40, 25], [37, 28, 24, 12]) };
  expect(weatherFx(w, 1)).toMatchObject({ rain: 3, wind: 3 });
  expect(weatherFx(w, 2)).toMatchObject({ rain: 2, wind: 2 });
  expect(weatherFx(w, 4)).toMatchObject({ rain: 1, wind: 0 }); // it has eased by the fourth quarter
  expect(weatherFx(w, 9)).toBeTruthy(); // overtime uses the last hour
});

test("the wind drifts away from the side it comes from, and the caption says what is falling", () => {
  expect(weatherFx({ factors: [{ key: "wind", level: 3 }], hours: hours([0], [40], "E") }).drift).toBeLessThan(0);
  expect(weatherFx({ factors: [{ key: "wind", level: 3 }], hours: hours([0], [40], "W") }).drift).toBeGreaterThan(0);
  const t = fxText(weatherFx({ factors: [{ key: "rain", level: 3 }, { key: "wind", level: 3 }], hours: hours([80], [36], "NE") }, 1));
  expect(t).toContain("heavy rain");
  expect(t).toContain("wind NE 36 mph");
});

const T0 = Date.parse("2026-10-10T19:00:00Z");
const at = (k: number) => new Date(T0 + k * 3600e3).toISOString();
const hr = (k: number, o: Partial<{ precip: number; gust: number; rainIn: number; code: number; tempF: number; dir: string }> = {}) => ({
  at: at(k), precip: o.precip ?? 0, windMph: Math.round((o.gust ?? 5) / 2), gustMph: o.gust ?? 5, dir: o.dir ?? "E", tempF: o.tempF ?? 60, rainIn: o.rainIn ?? 0, code: o.code ?? 1,
});

test("the forecast is read at the moment: each hour's reading stands for its middle, and the time between blends", async () => {
  const { readingAt } = await import("../src/weatherFx");
  const hours = [hr(0, { precip: 0 }), hr(1, { precip: 80, rainIn: 0.2, code: 63 })];
  expect(readingAt(hours, T0)?.precip).toBe(0); // before the first reading's middle: the first
  expect(readingAt(hours, T0 + 3 * 3600e3)?.precip).toBe(80); // after the last: the last
  // Halfway between the middle of hour 0 (T0+30m) and of hour 1 (T0+90m) = T0+60m: a blend.
  expect(readingAt(hours, T0 + 3600e3)?.precip).toBeCloseTo(40, 5);
  expect(readingAt(hours, T0 + 3600e3)?.rainIn).toBeCloseTo(0.1, 5);
});

test("how hard it rains follows the real amount, not just the chance", () => {
  const w = (rainIn: number, precip = 90, code = 61) => ({ factors: [{ key: "rain", level: 3 }], hours: [hr(0, { precip, rainIn, code })] });
  const at0 = T0 + 1800e3;
  expect(weatherFx(w(0.03), null, at0)).toMatchObject({ rain: 1 }); // a light fall
  expect(weatherFx(w(0.12), null, at0)).toMatchObject({ rain: 2 });
  expect(weatherFx(w(0.4), null, at0)).toMatchObject({ rain: 3 }); // a downpour
  expect(weatherFx(w(0.4), null, at0).rate).toBe(1);
  // A high chance with nothing falling that hour is a dry hour.
  expect(weatherFx(w(0, 90, 3), null, at0).rain).toBe(0); // overcast, nothing falling
  // The quarter-by-quarter sky: dry, then raining.
  const two = { factors: [{ key: "rain", level: 2 }], hours: [hr(0, { precip: 5, code: 3 }), hr(1, { precip: 80, rainIn: 0.2, code: 63 })] };
  expect(weatherFx(two, null, T0 + 1800e3).rain).toBe(0);
  expect(weatherFx(two, null, T0 + 5400e3).rain).toBeGreaterThan(0);
});

test("snow, drizzle, fog and storms come from the weather code", () => {
  const one = (code: number, extra = {}) => ({ factors: [{ key: "rain", level: 1 }], hours: [hr(0, { precip: 60, rainIn: 0.05, code, ...extra })] });
  const t = T0 + 1800e3;
  expect(weatherFx(one(73, { tempF: 28 }), null, t)).toMatchObject({ snow: expect.any(Number), rain: 0 });
  expect(weatherFx(one(73, { tempF: 28 }), null, t).snow).toBeGreaterThan(0);
  expect(weatherFx(one(53), null, t)).toMatchObject({ drizzle: true });
  expect(weatherFx(one(45, { precip: 5, rainIn: 0 }), null, t).fog).toBe(true);
  expect(weatherFx(one(95), null, t)).toMatchObject({ storm: true, rain: 3 });
  // Rain codes at freezing turn to snow.
  expect(weatherFx(one(61, { tempF: 30 }), null, t).snow).toBeGreaterThan(0);
});

test("the wind's speed is real: it sets the lean of the rain and shows in the caption", () => {
  const w = { factors: [{ key: "wind", level: 3 }], hours: [hr(0, { gust: 38, dir: "W" })] };
  const fx = weatherFx(w, null, T0 + 1800e3);
  expect(fx).toMatchObject({ wind: 3, windMph: 38 });
  expect(fx.drift).toBeGreaterThan(0);
  expect(fxText(fx)).toContain("wind W 38 mph");
  expect(weatherFx({ factors: [{ key: "wind", level: 3 }], hours: [hr(0, { gust: 12 })] }, null, T0 + 1800e3).wind).toBe(0); // calm: nothing blows
});
