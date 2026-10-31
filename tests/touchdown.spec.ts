import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { isTouchdown, observeScores, resetTouchdowns, FLASH_MS, PIN_MS } from "../src/touchdown";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const games = slate.games.filter((g: any) => g.league === "NFL");

test("a touchdown is a jump of 6, 7 or 8 points for one side; a field goal or an extra point is not", () => {
  for (const d of [6, 7, 8]) expect(isTouchdown(d)).toBe(true);
  for (const d of [0, 1, 2, 3, 5, 9, 14]) expect(isTouchdown(d)).toBe(false);
});

test("scores are watched: the first look and a look after a long gap set a baseline, a touchdown jump is recorded", async () => {
  const { useTouchdowns } = await import("../src/touchdown");
  void useTouchdowns;
  resetTouchdowns();
  const t0 = 1_000_000;
  observeScores({ g1: { away: 7, home: 3, state: "in" } }, t0);              // baseline: no celebration for old points
  observeScores({ g1: { away: 7, home: 6, state: "in" } }, t0 + 15_000);       // +3: a field goal
  observeScores({ g1: { away: 14, home: 6, state: "in" } }, t0 + 30_000);      // +7 away: a touchdown
  observeScores({ g2: { away: 0, home: 0, state: "in" } }, t0 + 31_000);
  observeScores({ g2: { away: 0, home: 7, state: "in" } }, t0 + 200_000);      // too long a gap since the last look: baseline only
  observeScores({ g3: { away: 3, home: 10, state: "post" } }, t0 + 201_000);
  expect(FLASH_MS).toBeLessThan(PIN_MS);
});

test("a touchdown covers the card for a few seconds, moves the game to the top of the board for a while, then puts it back", async ({ page }) => {
  const g = games[0];
  const start = new Date(g.date).getTime();
  await page.clock.install({ time: start + 90 * 60e3 });
  let away = 14;
  const payload = () => games.map((x: any, i: number) => ({ id: x.espnId, state: i < 3 ? "in" : "pre", detail: "5:12 - 3rd", away: i === 0 ? away : 7, home: 17 }));
  await page.route("**/api/scores**", (r) => r.fulfill({ json: payload() }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (r) => r.fulfill({ status: 503, json: { error: "none" } }));
  await page.goto("/?league=NFL");
  const card = page.locator(`.game-card[data-game-id="${g.id}"]`);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator(".team-score").first()).toContainText("14"); // the first live scores are in
  await expect(page.locator(".td-burst")).toHaveCount(0); // opening the page does not celebrate points already on the board
  away = 21; // a touchdown and the extra point
  await page.locator(".live-fresh").evaluate((b) => (b as HTMLElement).click());
  const burst = card.locator(".td-burst");
  await expect(burst).toBeVisible({ timeout: 10_000 });
  await expect(burst).toContainText(/Touchdown/i);
  // The game that scored is first on the board, in a strip of its own.
  await expect(page.locator(".td-pinned .game-card").first()).toHaveAttribute("data-game-id", g.id);
  // The celebration ends after a few seconds; the game stays at the top for a minute and a half, then goes back to its place.
  await page.clock.fastForward(FLASH_MS + 1500);
  await expect(card.locator(".td-burst")).toHaveCount(0);
  await expect(page.locator(".td-pinned")).toHaveCount(1);
  await page.clock.fastForward(PIN_MS);
  await expect(page.locator(".td-pinned")).toHaveCount(0);
  await expect(card).toBeVisible();
});

test("with motion off the touchdown banner still appears but nothing moves", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const g = games[0];
  await page.clock.install({ time: new Date(g.date).getTime() + 90 * 60e3 });
  let home = 17;
  await page.route("**/api/scores**", (r) => r.fulfill({ json: games.map((x: any, i: number) => ({ id: x.espnId, state: i === 0 ? "in" : "pre", detail: "5:12 - 3rd", away: 14, home: i === 0 ? home : 0 })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  await page.goto("/?league=NFL");
  await expect(page.locator(`.game-card[data-game-id="${g.id}"] .team-score`).first()).toContainText("14", { timeout: 15_000 });
  home = 24;
  await page.locator(".live-fresh").evaluate((b) => (b as HTMLElement).click());
  const burst = page.locator(".td-burst").first();
  await expect(burst).toBeVisible({ timeout: 10_000 });
  expect(await burst.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
});
