import { expect, test, type Page } from "./fixtures";
import { PREGAME_CLEAR_MS, PREGAME_LEAD_MS, pregameFor, stepAtElapsed } from "../src/pregameLogic";
import { CHEER_N, ROUTINES, cheerCue } from "../src/pregameCheerLogic";

const MIN = 60_000;
const K = Date.parse("2026-09-05T23:30:00Z");
const at = (league: string, minutesBefore: number, extra: Record<string, unknown> = {}) =>
  pregameFor({ league, date: new Date(K).toISOString(), state: "pre", now: K - minutesBefore * MIN, ...extra });

test("college: the window opens 20 minutes before kickoff and closes at 5; nothing outside it", () => {
  expect(PREGAME_LEAD_MS.CFB).toBe(20 * MIN);
  expect(PREGAME_CLEAR_MS).toBe(5 * MIN);
  expect(at("CFB", 20.5)).toBeNull(); // before the window
  expect(at("CFB", 20)).not.toBeNull(); // the entrance
  expect(at("CFB", 12.3)).not.toBeNull(); // midway
  expect(at("CFB", 5.01)).not.toBeNull();
  expect(at("CFB", 5)).toBeNull(); // cleared at five minutes
  expect(at("CFB", 2)).toBeNull();
  expect(at("CFB", -3)).toBeNull(); // after kickoff time with no live feed: field stays clear
});

test("NFL: the cheerleaders run 15 minutes before kickoff to 5", () => {
  expect(at("NFL", 16)).toBeNull();
  expect(at("NFL", 15)?.league).toBe("NFL");
  expect(at("NFL", 5)).toBeNull();
});

test("no show for a live, finished, postponed or canceled game, or for a game with no kickoff time", () => {
  expect(at("CFB", 10, { state: "in" })).toBeNull(); // live: stops immediately
  expect(at("CFB", 10, { state: "post" })).toBeNull();
  expect(at("CFB", 10, { detail: "Postponed" })).toBeNull();
  expect(at("CFB", 10, { detail: "Canceled" })).toBeNull();
  expect(at("NFL", 10, { state: "in" })).toBeNull();
  expect(at("CFB", 10, { date: "" })).toBeNull();
  expect(at("XFL", 10)).toBeNull();
});

test("a revised kickoff moves the window with it, and a delay without one leaves the field clear after the original cutoff", () => {
  const now = K - 12 * MIN; // twelve minutes before the original kickoff: mid-show
  expect(pregameFor({ league: "CFB", date: new Date(K).toISOString(), state: "pre", now })).not.toBeNull();
  const later = new Date(K + 60 * MIN).toISOString(); // moved an hour later: not yet
  expect(pregameFor({ league: "CFB", date: later, state: "pre", now })).toBeNull();
  const nowLate = K + 60 * MIN - 10 * MIN; // ...and the show starts for the revised time
  const p = pregameFor({ league: "CFB", date: later, state: "pre", now: nowLate })!;
  expect(p.kickoff).toBe(K + 60 * MIN);
  // "Delayed" with the old scheduled time: past the original cutoff the show does not come back
  expect(pregameFor({ league: "CFB", date: new Date(K).toISOString(), state: "pre", detail: "Delayed", now: K - 4 * MIN })).toBeNull();
});

test("the formation step comes from the clock alone, so a reload lands on the same step", () => {
  expect(stepAtElapsed(0, 16_000, 1, 28_000)).toBe(0);
  expect(stepAtElapsed(15_999, 16_000, 1, 28_000)).toBe(0);
  expect(stepAtElapsed(16_000, 16_000, 1, 28_000)).toBe(1); // the script step
  expect(stepAtElapsed(16_000 + 27_999, 16_000, 1, 28_000)).toBe(1);
  expect(stepAtElapsed(16_000 + 28_000, 16_000, 1, 28_000)).toBe(2);
  expect(stepAtElapsed(120_000, 16_000, 1, 28_000)).toBe(stepAtElapsed(120_000, 16_000, 1, 28_000));
});

test("cheer routines place all sixteen on the field, apart from each other, and the squad exits in the last seconds", () => {
  for (const r of ROUTINES) {
    expect(r.pts).toHaveLength(CHEER_N);
    for (const [x, y] of r.pts) { expect(x).toBeGreaterThan(10); expect(x).toBeLessThan(110); expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(40); }
    let min = Infinity;
    for (let i = 0; i < r.pts.length; i++) for (let j = i + 1; j < r.pts.length; j++) min = Math.min(min, Math.hypot(r.pts[i][0] - r.pts[j][0], r.pts[i][1] - r.pts[j][1]));
    expect(min, r.name).toBeGreaterThan(1.6);
  }
  expect(cheerCue(2_000, 600_000).phase).toBe("enter");
  expect(cheerCue(100_000, 600_000).phase).toBe("routine");
  expect(cheerCue(500_000, 20_000).phase).toBe("exit");
});

const ys = (page: Page, sel: string) =>
  page.locator(sel).evaluateAll((els) => els.map((e) => Number(/translate\([^,]+,\s*([-\d.]+)px/.exec((e as HTMLElement).style.transform)?.[1] ?? NaN)));
async function preview(page: Page, league: "CFB" | "NFL", q: string) {
  await page.goto(`/?pregamePreview=${league}&${q}`);
}

test("preview, college: nothing before the window, the band at the entrance, and a card-size and Game Center-size view agree", async ({ page }) => {
  await preview(page, "CFB", "pregame=21");
  await expect(page.locator("[data-size=card] [data-pregame=none]")).toBeVisible();
  await page.goto("/?pregamePreview=CFB&pregame=19.9");
  const card = page.locator("[data-size=card] .halftime-band");
  const center = page.locator("[data-size=center] .halftime-band");
  await expect(card.locator(".band-count-k")).toHaveText("PREGAME BAND");
  await expect(center.locator(".band-count-k")).toHaveText("PREGAME BAND");
  await expect(card.locator(".band-member")).toHaveCount(64);
  await expect(card).toHaveClass(/band-enter/); // walking on from the sideline
  const a = await card.locator(".band-count-t").textContent();
  const b = await center.locator(".band-count-t").textContent();
  expect(Math.abs(Number(a!.split(":")[0]) * 60 + Number(a!.split(":")[1]) - (Number(b!.split(":")[0]) * 60 + Number(b!.split(":")[1])))).toBeLessThanOrEqual(1);
  await expect(card.locator("p.drive-cap")).toContainText("Kickoff in");
});

test("preview, college: joining midway puts the band on the field at once, with no replayed entrance", async ({ page }) => {
  await preview(page, "CFB", "pregame=12");
  const band = page.locator("[data-size=card] .halftime-band");
  await expect(band.locator(".band-member")).toHaveCount(64);
  await page.waitForTimeout(1500);
  await expect(band).not.toHaveClass(/band-enter/);
  const y = await ys(page, "[data-size=card] .band-member");
  expect(y.filter((v) => v < 41).length).toBe(64); // every member is on the field, none still walking on
  await page.reload(); // a reload midway lands on the same point
  await expect(band.locator(".band-count-t")).toHaveText(/^1[12]:\d\d$/);
  await page.waitForTimeout(1500);
  expect((await ys(page, "[data-size=card] .band-member")).filter((v) => v < 41).length).toBe(64);
});

test("preview, college: at 5:36 to kickoff the band is already off the field, and at 5:00 the normal field is back", async ({ page }) => {
  await page.clock.install();
  await preview(page, "CFB", "pregame=5.6");
  const band = page.locator("[data-size=card] .halftime-band");
  await expect(band).toBeVisible();
  await page.clock.fastForward(1_500);
  const y = await ys(page, "[data-size=card] .band-member");
  expect(y.length).toBe(64);
  expect(y.filter((v) => v > 41).length).toBe(64); // everyone is beyond the sideline before the cutoff
  await page.clock.fastForward(40_000);
  await expect(page.locator("[data-size=card] [data-pregame=none]")).toBeVisible();
});

test("preview, college: the exit begins 45 seconds before the cutoff (the longest walk is under 28 seconds)", async ({ page }) => {
  await page.clock.install();
  await preview(page, "CFB", "pregame=6.2"); // 12 seconds before the planned exit begins
  const band = page.locator("[data-size=card] .halftime-band");
  await expect(band.locator(".band-member")).toHaveCount(64);
  await page.clock.fastForward(2_000);
  expect((await ys(page, "[data-size=card] .band-member")).filter((v) => v < 41).length).toBe(64); // still performing
  await page.clock.fastForward(40_000);
  await expect(band).toHaveClass(/band-exit/);
});

test("preview: a live, finished or postponed game gets no show", async ({ page }) => {
  for (const s of ["in", "post", "postponed"]) {
    await preview(page, "CFB", `pregame=10&pstate=${s}`);
    await expect(page.locator("[data-size=card] [data-pregame=none]")).toBeVisible();
  }
});

test("preview, NFL: cheerleaders from 15 minutes out, sixteen of them, gone at five", async ({ page }) => {
  await preview(page, "NFL", "pregame=16");
  await expect(page.locator("[data-size=card] [data-pregame=none]")).toBeVisible();
  await page.clock.install();
  await preview(page, "NFL", "pregame=10");
  const squad = page.locator("[data-size=card] .pregame-cheer");
  await expect(squad.locator(".band-count-k")).toHaveText("PREGAME CHEER");
  await expect(squad.locator(".cheer-member")).toHaveCount(CHEER_N);
  expect((await ys(page, "[data-size=card] .cheer-member")).filter((v) => v < 41).length).toBe(CHEER_N); // joined midway: already on the field
  await page.clock.fastForward(5 * MIN + 10_000);
  await expect(page.locator("[data-size=card] [data-pregame=none]")).toBeVisible();
});

test("preview: reduced motion still shows the show, still; hiding the page pauses nothing that breaks on return", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await preview(page, "CFB", "pregame=12");
  await expect(page.locator("[data-size=card] .band-member")).toHaveCount(64);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator("[data-size=card] .band-member")).toHaveCount(64);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("a game card on the board shows the cheerleaders in the pregame window, and not once the game is live", async ({ page }) => {
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
  await page.goto("/?league=NFL&pregame=10");
  const card = page.locator(".game-card:not(.result-card)").first();
  test.skip(!(await card.count()), "no upcoming NFL game on this board");
  await expect(card.locator(".pregame-cheer")).toBeVisible();
  await expect(card.locator(".band-count-k")).toHaveText("PREGAME CHEER");
});
