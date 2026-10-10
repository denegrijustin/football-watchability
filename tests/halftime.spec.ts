import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { FORMATIONS, clockText, halftimeLeft, isHalftime } from "../src/halftimeLogic";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const cfb = slate.games.filter((g: any) => g.league === "CFB");
const nfl = slate.games.filter((g: any) => g.league === "NFL");

test("the halftime clock is 20 minutes, with the feed's one-minute delay already counted", () => {
  const t0 = 1_000_000_000_000;
  expect(clockText(halftimeLeft(t0, t0))).toBe("19:00"); // first seen: a minute has already gone
  expect(clockText(halftimeLeft(t0, t0 + 60_000))).toBe("18:00");
  expect(clockText(halftimeLeft(t0, t0 + 10 * 60_000))).toBe("9:00");
  expect(halftimeLeft(t0, t0 + 19 * 60_000)).toBe(0);
  expect(halftimeLeft(t0, t0 + 40 * 60_000)).toBe(0);
  expect(isHalftime("Halftime")).toBe(true);
  expect(isHalftime("5:12 - 3rd")).toBe(false);
  expect(isHalftime(undefined)).toBe(false);
});

test("every formation places all 64 members on the field", () => {
  expect(FORMATIONS.length).toBeGreaterThanOrEqual(5);
  for (const f of FORMATIONS) {
    expect(f.pts).toHaveLength(64);
    for (const [x, y] of f.pts) {
      expect(x).toBeGreaterThan(10); // inside the end zones
      expect(x).toBeLessThan(110);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(40);
    }
  }
  // They are genuinely different shapes.
  const key = (f: (typeof FORMATIONS)[number]) => f.pts.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(";");
  expect(new Set(FORMATIONS.map(key)).size).toBe(FORMATIONS.length);
});

async function open(page: Page, league: "CFB" | "NFL", detail: string) {
  const games = league === "CFB" ? cfb : nfl;
  const start = Math.min(...games.map((g: any) => new Date(g.date).getTime()));
  const T = start + 90 * 60e3;
  await page.clock.install({ time: T });
  await page.clock.pauseAt(T + 1000); // time now moves only when a test moves it
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: i === 0 ? detail : "", away: 14, home: 17 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (route) => route.fulfill({ status: 503, json: { error: "none" } }));
  await page.goto(`/?league=${league}`);
}
const live = (page: Page) => page.locator(".board-section.live .game-card").first();

test("a college game at halftime shows the band, second under the score, with a 20-minute countdown", async ({ page }) => {
  await open(page, "CFB", "Halftime");
  const band = live(page).locator(".halftime-band");
  await expect(band.locator("svg.band-svg")).toBeVisible();
  // Seen from above: shoulders, a plumed hat and an instrument per member.
  await expect(band.locator(".band-shoulders")).toHaveCount(64);
  await expect(band.locator(".band-hat")).toHaveCount(64);
  await expect(band.locator(".band-plume")).toHaveCount(64);
  await expect(band.locator(".band-member")).toHaveCount(64);
  const order = await live(page).locator(".compact-overview > *").evaluateAll((els) => els.map((e) => e.className.split(" ")[0]));
  expect(order.indexOf("halftime-band")).toBe(order.indexOf("matchup") + 1);
  expect(order.indexOf("facts")).toBe(order.indexOf("halftime-band") + 1);
  await expect(band).toContainText("Halftime · about 19:00 left");
  await page.clock.fastForward(60_000);
  await expect(band).toContainText("about 18:00 left");
  await page.clock.fastForward(20 * 60_000);
  await expect(band).toContainText("Halftime is wrapping up");
});

test("the band changes formation every few seconds", async ({ page }) => {
  await open(page, "CFB", "Halftime");
  const dot = live(page).locator(".band-member").nth(5);
  await expect(dot).toBeAttached();
  const at = () => dot.evaluate((e) => (e as SVGElement).style.transform);
  const first = await at();
  await expect(live(page).locator(".halftime-band")).toContainText("block");
  await page.clock.fastForward(5_100);
  await expect.poll(at).not.toBe(first);
  await expect(live(page).locator(".halftime-band")).toContainText("ring");
});

test("the clock keeps its place across a reload", async ({ page }) => {
  await open(page, "CFB", "Halftime");
  await expect(live(page).locator(".halftime-band")).toContainText("19:00 left");
  await page.clock.fastForward(5 * 60_000);
  await expect(live(page).locator(".halftime-band")).toContainText("14:00 left");
  await page.reload();
  await expect(live(page).locator(".halftime-band")).toContainText(/1[34]:\d\d left/); // not back at 19:00
});

test("only college games get the band: the NFL and a college game mid-quarter do not", async ({ page }) => {
  await open(page, "NFL", "Halftime");
  await expect(live(page)).toBeVisible();
  await expect(page.locator(".halftime-band")).toHaveCount(0);
});

test("a college game that is not at halftime shows the drive chart slot, not the band", async ({ page }) => {
  await open(page, "CFB", "5:12 - 3rd");
  await expect(live(page)).toBeVisible();
  await expect(page.locator(".halftime-band")).toHaveCount(0);
});

test("with reduced motion the band stays in one formation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "CFB", "Halftime");
  const band = live(page).locator(".halftime-band");
  await expect(band).toContainText("block");
  await page.clock.fastForward(30_000);
  await expect(band).toContainText("block");
  expect(await live(page).locator(".band-member").first().evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
});
