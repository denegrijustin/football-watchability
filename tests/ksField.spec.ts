import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { hasCfbGame, NO_CFB } from "./helpers/slate";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));

// Kansas State's field is a picture of the field (end zones, turf, numbers, midfield mark and the Big 12 marks), and the halftime show shows it as it is.
test("at halftime Kansas State's field is its picture, whole, not a field painted in code", async ({ page }) => {
  test.skip(!hasCfbGame(), NO_CFB);
  const g = slate.games.find((x: any) => x.league === "CFB" && x.espnId);
  const sl = JSON.parse(JSON.stringify(slate));
  const gg = sl.games.find((x: any) => x.id === g.id);
  gg.teams[1] = { ...gg.teams[1], name: "Kansas State", abbr: "KSU", logoId: "kansas-state", ranks: { ...(gg.teams[1].ranks ?? {}), confName: "Big 12" } };
  gg.matchup = `${gg.teams[0].name} @ Kansas State`;
  await page.route("**/data/slate.json", (r) => r.fulfill({ json: sl }));
  await page.clock.install({ time: new Date(g.date).getTime() + 90 * 60e3 });
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [{ id: g.espnId, state: "in", detail: "Halftime", away: 14, home: 17 }] }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (r) => r.fulfill({ status: 503, json: {} }));
  await page.goto("/?league=CFB");
  const band = page.locator(`.game-card[data-game-id="${g.id}"] .halftime-band`);
  await expect(band.locator("svg.band-svg")).toBeVisible({ timeout: 15_000 });
  const field = band.locator('image[data-full-field="kansas-state"]');
  await expect(field).toHaveCount(1);
  expect(await field.getAttribute("href")).toBe("/field-art/cfb/kansas-state.webp");
  // nothing is painted over the picture in code: no yard numbers, no goal lines, no painted end zones, no conference marks
  await expect(band.locator(".band-yard, .band-goal, [data-endzone], g.lf-conf")).toHaveCount(0);
  // the picture itself loads
  const ok = await page.evaluate(() => fetch("/field-art/cfb/kansas-state.webp").then((r) => r.ok));
  expect(ok).toBe(true);
});
