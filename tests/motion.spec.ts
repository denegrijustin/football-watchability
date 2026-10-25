import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
import { closeAndLate, liveHeat, pickWatchNow } from "../src/watchNow";
import { stubFinals } from "./helpers/finals";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const NFL = slate.games.filter((g: any) => g.league === "NFL");
const live = (detail: string, away: number, home: number) => ({ state: "in" as const, detail, away, home });

test("a one-score game in the 4th quarter or overtime is close and late; a blowout or an early game is not", () => {
  expect(closeAndLate(live("2:10 - 4th", 21, 17)).both).toBe(true);
  expect(closeAndLate(live("2:10 - 4th", 21, 17)).label).toBe("One-score game · 4th quarter");
  expect(closeAndLate(live("4:00 - OT", 24, 24)).label).toBe("One-score game · overtime");
  expect(closeAndLate(live("2:10 - 4th", 35, 10)).both).toBe(false);
  expect(closeAndLate(live("8:00 - 2nd", 7, 7)).both).toBe(false);
  expect(closeAndLate(undefined).both).toBe(false);
});

test("a live game heats up as it gets closer and later, and never above 100", () => {
  expect(liveHeat(60, undefined)).toBe(60);
  expect(liveHeat(60, live("8:00 - 2nd", 21, 3))).toBe(60);
  expect(liveHeat(60, live("2:00 - 4th", 17, 14))).toBeGreaterThan(liveHeat(60, live("2:00 - 4th", 35, 14)));
  expect(liveHeat(60, live("2:00 - 4th", 17, 14))).toBeGreaterThan(liveHeat(60, live("2:00 - 2nd", 17, 14)));
  expect(liveHeat(95, live("1:00 - OT", 20, 20))).toBe(100);
});

test("the Watch-now strip takes the hottest live games, then the best ones starting within the hour", () => {
  const now = Date.parse("2026-10-25T17:00:00Z");
  const g = (id: string, score: number, minutes: number) => ({ id, espnId: id, score, date: new Date(now + minutes * 60_000).toISOString() });
  const games = [g("a", 70, -90), g("b", 55, -60), g("c", 90, -30), g("d", 40, -20), g("s1", 80, 20), g("s2", 60, 45), g("s3", 95, 50), g("far", 99, 240)];
  const map = { a: live("1:00 - 4th", 20, 17), b: live("5:00 - 3rd", 3, 28), c: live("9:00 - 1st", 7, 7), d: live("2:00 - 4th", 14, 13) };
  const tiles = pickWatchNow(games, map, now);
  expect(tiles.filter((t) => t.kind === "live").map((t) => t.game.id)).toEqual(["c", "a", "d"]);
  expect(tiles.filter((t) => t.kind === "soon").map((t) => t.game.id)).toEqual(["s3", "s1"]);
  expect(tiles.find((t) => t.game.id === "s1")!.minutes).toBe(20);
  expect(pickWatchNow([g("x", 80, 10)], { x: { state: "post", detail: "Final", away: 1, home: 2 } }, now)).toHaveLength(0);
});

test.describe("on the board", () => {
  test.beforeEach(async ({ page }) => { await stubFinals(page); });

  test("a close-and-late game shows in Watch now with a glowing flag, its score flashes when it changes, and a refresh says it was updated", async ({ page }) => {
    const start = Math.min(...NFL.map((g: any) => new Date(g.date).getTime()));
    await page.clock.install({ time: start + 150 * 60e3 });
    let away = 21;
    await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [[40, 4, { id: "1", text: "x", clock: "3:00" }], [35, 4, { id: "2", text: "y", clock: "2:10" }]] } }));
    await page.route("**/api/scores**", (r) => r.fulfill({ json: NFL.map((g: any, i: number) => ({ id: g.espnId, state: i === 0 ? "in" : "pre", detail: "2:10 - 4th", away: i === 0 ? away : 0, home: i === 0 ? 17 : 0 })) }));
    await page.goto("/?league=NFL");
    const tile = page.locator(".watch-now .wn-tile.live").first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await expect(tile).toContainText("One-score game · 4th quarter");
    await expect(tile).toContainText("%");
    await expect(page.locator(".late-flag").first()).toContainText("One-score game");
    await expect(page.locator(".live-meters .lm").first()).toBeVisible();
    away = 28;
    await page.locator(".live-fresh").evaluate((b) => (b as HTMLElement).click());
    await expect(page.locator(".team-score.scored").first()).toBeVisible();
    await expect(page.locator(".game-card .pulse-ring").first()).toBeAttached();
    await expect(page.locator(".toast")).toHaveText("Updated just now");
  });

  test("the score is a ring that fills, and tapping it says why", async ({ page }) => {
    await page.goto("/?league=NFL");
    const ring = page.locator(".game-card:not(.result-card) .score-ring").first();
    await expect(ring).toBeVisible();
    await expect.poll(() => ring.locator(".sr-fill").evaluate((c) => Number(getComputedStyle(c).strokeDashoffset.replace("px", "")))).toBeLessThan(130);
    await ring.getByRole("button", { name: /Show why/ }).click();
    await expect(page.locator(".sr-pop")).toContainText("Starting point");
    await page.keyboard.press("Escape");
    await expect(page.locator(".sr-pop")).toHaveCount(0);
  });

  test("switching tabs slides the new view in and the pressed tab carries the underline", async ({ page }) => {
    await page.goto("/?league=NFL");
    await page.locator('.view-switch [data-tab="picks"]').click();
    await expect(page.locator(".view-in").first()).toBeVisible();
    await expect(page.locator('.view-switch [data-tab="picks"]')).toHaveAttribute("aria-pressed", "true");
    const bar = await page.locator('.view-switch [data-tab="picks"]').evaluate((b) => getComputedStyle(b, "::after").height);
    expect(bar).toBe("3px");
  });

  test("a slow load shows card-shaped placeholders, not a Loading line", async ({ page }) => {
    await page.route("**/data/nfl*.json", async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue(); });
    await page.goto("/?league=NFL");
    await page.locator('.view-switch [data-tab="picks"]').click();
    await expect(page.locator(".skel").first()).toBeVisible();
  });
});

test("with reduced motion the new animations do not play", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await stubFinals(page);
  await page.goto("/?league=NFL");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator(".game-grid > .game-card").first()).toBeVisible();
  expect(await page.locator(".game-grid > .game-card").first().evaluate((c) => getComputedStyle(c).animationName)).toBe("none");
  await ctx.close();
});

test("@phone pulling the top of the page down refreshes and says so", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch only");
  await stubFinals(page);
  let calls = 0;
  await page.route("**/api/odds**", (r) => { calls++; return r.fulfill({ json: { at: Date.now(), league: "nfl", week: 7, games: [] } }); });
  await page.goto("/?league=NFL");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await page.evaluate(() => {
    const t = (y: number) => new Touch({ identifier: 1, target: document.body, clientX: 100, clientY: y });
    const fire = (type: string, y: number | null) => document.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: y == null ? [] : [t(y)], changedTouches: [t(y ?? 0)] }));
    fire("touchstart", 120); fire("touchmove", 200); fire("touchmove", 280); fire("touchend", null);
  });
  await expect(page.locator(".ptr.busy")).toBeAttached();
  await expect(page.locator(".toast")).toHaveText("Updated just now", { timeout: 10_000 });
  expect(calls).toBeGreaterThan(0);
});
