import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const games = slate.games.filter((g: any) => g.league === "NFL");

test("@phone on a phone the space above the first game card is under 420px", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile", "phone layout");
  const start = Math.min(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (r) => r.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i < 2 ? "in" : "pre", detail: "8:54 - 4th", away: 21, home: 21 })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [[44, 4, { id: "1", text: "x", clock: "9:00" }], [56, 4, { id: "2", text: "y", clock: "8:54" }]] } }));
  await page.goto("/?league=NFL");
  const card = page.locator(".board-section.live .game-card").first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  const top = await card.evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.screenshot({ path: "test-results/phone-top.png" });
  expect(top).toBeLessThan(420);
  expect((await card.boundingBox())!.height).toBeLessThan(385); // a live card on a phone: one-line header, inline records, slim meters
});

test("@phone every Watch now tile is the same size and shows its teams and scores whole", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile", "phone layout");
  const start = Math.min(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (r) => r.fulfill({ json: games.map((g: any, i: number) => ({ id: g.espnId, state: i < 3 ? "in" : "pre", detail: "0:32 - 1st", away: 3, home: 107 })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [[44, 1, { id: "1", text: "x", clock: "9:00" }], [56, 1, { id: "2", text: "y", clock: "0:32" }]] } }));
  await page.goto("/?league=NFL");
  const tiles = page.locator(".watch-now .wn-tile");
  await expect(tiles.first()).toBeVisible({ timeout: 10_000 });
  const m = await tiles.evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), cut: [...e.querySelectorAll(".wn-teams b, .wn-teams em, .wn-when, .wn-foot span")].filter((x) => { const b = x.getBoundingClientRect(); return b.right > r.right - 1 || x.scrollWidth > x.clientWidth + 1; }).map((x) => x.textContent) };
  }));
  expect(new Set(m.map((t) => t.w)).size, "tile widths").toBe(1);
  expect(new Set(m.map((t) => t.h)).size, "tile heights").toBe(1);
  expect(m.flatMap((t) => t.cut), "text cut off by its tile").toEqual([]);
});
