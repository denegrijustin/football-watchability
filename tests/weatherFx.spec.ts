import { expect, test } from "@playwright/test";
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
