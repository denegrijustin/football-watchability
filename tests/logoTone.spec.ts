import { expect, test } from "./fixtures";
import { hasCfbGame, NO_CFB } from "./helpers/slate";
import { CHIP_DARK, CHIP_LIGHT, chipFor } from "../src/logoTone";
import { withRedRiver } from "./helpers/redRiver";

const px = (rgb: [number, number, number], n = 40, a = 255) => Array.from({ length: n }, () => [...rgb, a]).flat();

test("a light logo gets a dark chip; a dark or mid-tone one gets a white chip", () => {
  expect(chipFor(px([255, 255, 255]))).toBe(CHIP_DARK);
  expect(chipFor(px([245, 245, 240]))).toBe(CHIP_DARK);
  expect(chipFor(px([0, 0, 0]))).toBe(CHIP_LIGHT);
  expect(chipFor(px([158, 27, 50]))).toBe(CHIP_LIGHT); // crimson
  expect(chipFor(px([191, 87, 0]))).toBe(CHIP_LIGHT); // burnt orange
});

test("transparent pixels are ignored, so a white logo on a clear background still reads as white", () => {
  expect(chipFor([...px([255, 255, 255], 10), ...px([0, 0, 0], 200, 0)])).toBe(CHIP_DARK);
  expect(chipFor(px([0, 0, 0], 20, 0))).toBe(CHIP_LIGHT); // nothing visible: the default
});

test("on the live field, Texas's white longhorn sits on a dark chip and a dark logo on a light one", async ({ page }) => {

  test.skip(!hasCfbGame(), NO_CFB);
  const { g, games } = await withRedRiver(page);
  const start = Math.max(...games.map((x: any) => new Date(x.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (r) => r.fulfill({ json: games.map((x: any) => ({ id: x.espnId, state: x === g ? "in" : "pre", detail: x === g ? "5:12 - 3rd" : "", away: 14, home: 17 })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  const [a, h] = g.teams;
  await page.route("**/api/game**", (r) =>
    r.fulfill({
      json: {
        id: g.espnId, status: { state: "in", detail: "5:12 - 3rd", period: 3, clock: "5:12" },
        teams: [{ id: a.espnId, abbr: a.abbr, name: a.name, homeAway: "away", score: 14, linescores: [], possession: true }, { id: h.espnId, abbr: h.abbr, name: h.name, homeAway: "home", score: 17, linescores: [], possession: false }],
        situation: { text: "1st & 10 at OKLA 40", possession: a.espnId, toGo: 60, redZone: false, lastPlay: "x" },
        drives: [{ team: a.espnId, from: 25, to: 40, yards: 15, plays: 4, result: "", score: false, time: "1:40", current: true }],
        wp: [], plays: [], allOffense: [], scoring: [], teamStats: {}, players: {},
      },
    }),
  );
  await page.goto("/?league=CFB");
  await page.clock.resume();
  const svg = page.locator(".game-card", { hasText: "Texas @ Oklahoma" }).first().locator("svg.drive-svg");
  // The offense is Texas: its logo is the ball marker. Texas's logo is white, so its chip must be dark.
  await expect(svg.locator(".df-ball circle.lf-chip")).toHaveAttribute("data-chip", "dark");
  // End zones: Texas dark chip (white logo), Oklahoma light chip (crimson logo).
  await expect(svg.locator("circle[data-chip]").first()).toBeAttached();
  const chips = await svg.locator("circle[data-chip]").evaluateAll((els) => els.map((e) => e.getAttribute("data-chip")));
  expect(chips).toContain("dark");
  expect(chips).toContain("light");
});
