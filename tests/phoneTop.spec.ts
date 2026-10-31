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
