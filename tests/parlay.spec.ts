import { test, expect } from "./fixtures";
import { stubFinals } from "./helpers/finals";
import { american, byGame, evaluate, recommend, type Leg } from "../src/parlay";
import { coverRule, ratingsMargin, strengthOf } from "../src/livePicks";

const leg = (id: string, gameId: string, cover: number, kind: Leg["kind"] = "spread", when = "2026-10-25"): Leg => ({ id, gameId, game: gameId, away: "A", home: "B", league: "NFL", when, kind, label: id, cover, edge: 1 });

test("a parlay's chance is the product of its legs, and it pays the standard −110 prices", () => {
  const e = evaluate([{ cover: 0.6 }, { cover: 0.6 }]);
  expect(e.p).toBeCloseTo(0.36, 5);
  expect(american(e.american)).toBe("+264");
  expect(american(evaluate([{ cover: 0.5 }, { cover: 0.5 }, { cover: 0.5 }]).american)).toBe("+596");
  expect(e.breakEvenP).toBeCloseTo(0.5238 ** 2, 3);
});

test("slips take one leg per game, the most likely first, with a second slip that shares nothing", () => {
  const pool = [leg("a-s", "a", 0.7), leg("a-t", "a", 0.66, "total"), leg("b-s", "b", 0.65), leg("c-s", "c", 0.62), leg("d-s", "d", 0.6), leg("e-s", "e", 0.57), leg("f-s", "f", 0.4)];
  const slips = recommend(pool, { sizes: [2], minCover: 0.55 });
  expect(slips.map((s) => s.legs.map((l) => l.id))).toEqual([["a-s", "b-s"], ["c-s", "d-s"]]);
  expect(recommend(pool, { sizes: [3], minCover: 0.55 }).length).toBe(1); // only five games clear the bar: a second 3-leg slip is not possible
  expect(recommend(pool, { sizes: [2], minCover: 0.9 })).toEqual([]);
});

test("by game: legs best first, and a same-game slip only when both legs are worth taking", () => {
  const games = byGame([leg("a-s", "a", 0.7), leg("a-t", "a", 0.6, "total"), leg("b-s", "b", 0.8), leg("b-t", "b", 0.4, "total")], 0.5);
  expect(games.map((g) => g.gameId)).toEqual(["b", "a"]);
  expect(games[1].same?.stats.p).toBeCloseTo(0.42, 5);
  expect(games[0].same).toBeNull();
});

test("a pick says what has to happen, what the ratings expect and how strong it is", () => {
  expect(coverRule("Chicago", 3)).toBe("Covers if Chicago wins by more than 3 (exactly 3 is a push).");
  expect(coverRule("New Orleans", -3.5)).toBe("Covers if New Orleans wins, or loses by less than 3.5.");
  expect(ratingsMargin(3, 1.1)).toBe(4.1);
  expect(ratingsMargin(-3.5, 0.3)).toBe(-3.2);
  expect([0.65, 0.57, 0.52, null].map(strengthOf)).toEqual(["strong", "lean", "slight", null]);
});

for (const [lg, name] of [["NFL", "NFL"], ["CFB", "College"]] as const) {
  test(`the Parlays tab builds slips of two to four legs and lists the games (${name})`, async ({ page }) => {
    await stubFinals(page);
    await page.goto(`/?league=${lg}`);
    await page.locator('.view-switch [data-tab="picks"]').click();
    await page.getByRole("group", { name: "Picks section" }).getByRole("button", { name: "Parlays" }).click();
    await expect(page.locator(".pl-slip").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".pl-warn")).toContainText("every leg hits");
    for (const n of [2, 3, 4]) await expect(page.locator(".pl-slip h4", { hasText: `${n}-leg · Top picks` })).toBeVisible();
    await expect(page.locator(".pl-slip").first().locator(".pl-leg")).toHaveCount(2);
    await page.getByRole("button", { name: "All football" }).click();
    await expect(page.locator(".pl-slip").first()).toBeVisible();
    await expect(page.locator(".pl-games > li").first()).toBeVisible();
  });
}
