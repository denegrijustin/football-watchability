import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const cfb = slate.games.filter((g: any) => g.league === "CFB");
const live = cfb[0];

/** Home win % per play: flat near 50, or swinging hard. */
const series = (wild: boolean) =>
  Array.from({ length: 60 }, (_, i) => [wild ? (i % 2 ? 90 : 10) : 50 + (i % 3), 1 + Math.floor(i / 15), { id: String(i), text: "play", clock: "1:00" }]);

test("a game in progress joins the Insanity list, scored live, and refreshes every 60 seconds along with the ledger", async ({ page }) => {
  const start = new Date(live.date).getTime();
  await page.clock.install({ time: start + 90 * 60e3 });
  let wild = false;
  let ledgerFetches = 0;
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: cfb.map((g: any) => ({ id: g.espnId, state: g === live ? "in" : "pre", detail: g === live ? "5:12 - 3rd" : "", away: wild ? 21 : 10, home: wild ? 24 : 7 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: series(wild) } }));
  await page.route("**/api/game**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/data/season.json", (route) => {
    ledgerFetches++;
    return route.continue();
  });
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "Insanity", exact: true }).click();
  const card = page.locator(".ib-cards > li.is-live").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".ic-live")).toContainText("LIVE");
  await expect(card.locator(".ic-teams")).toContainText("10");
  const calm = Number(await card.getAttribute("data-insanity"));
  await expect(page.locator(".ib-live-head")).toContainText("rescored every 60 seconds");
  const before = ledgerFetches;

  // A minute later the game is rescored from its new win-probability line, and the ledger is fetched again.
  wild = true;
  await page.clock.fastForward(61_000);
  await expect.poll(async () => Number(await page.locator(".ib-cards > li.is-live").first().getAttribute("data-insanity"))).toBeGreaterThan(calm);
  await expect(page.locator(".ib-cards > li.is-live").first().locator(".ic-teams")).toContainText("24");
  expect(ledgerFetches).toBeGreaterThan(before);
});

test("with no game in progress nothing polls and no live row or note appears", async ({ page }) => {
  let flows = 0;
  await page.route("**/api/scores**", (route) => route.fulfill({ json: cfb.map((g: any) => ({ id: g.espnId, state: "pre", detail: "", away: 0, home: 0 })) }));
  await page.route("**/api/flow**", (route) => {
    flows++;
    return route.fulfill({ json: { wp: [] } });
  });
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "Insanity", exact: true }).click();
  await expect(page.locator(".ib-cards > li").first()).toBeVisible();
  await expect(page.locator(".ib-cards > li.is-live")).toHaveCount(0);
  await expect(page.locator(".ib-live-head")).toHaveCount(0);
  expect(flows).toBe(0);
});

test("a game that ended since the last rebuild is scored from its win-probability line and listed as FINAL, not left out", async ({ page }) => {
  const ledger = JSON.parse(readFileSync("src/data/season.json", "utf8")).games;
  const inLedger = new Set(ledger.map((g: any) => g.id));
  const results = JSON.parse(readFileSync("src/data/results.json", "utf8")).games;
  const archived = new Set(results.map((r: any) => r.espnId));
  const fresh = cfb.find((g: any) => !inLedger.has(g.espnId) && !archived.has(g.espnId));
  expect(fresh, "a college game on the slate that the ledger doesn't have yet").toBeTruthy();
  const start = new Date(fresh.date).getTime();
  await page.clock.install({ time: start + 5 * 3600e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({ json: cfb.map((g: any) => ({ id: g.espnId, state: g === fresh ? "post" : "pre", detail: g === fresh ? "Final" : "", away: 24, home: 24 + 3 })) }),
  );
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: series(true) } }));
  await page.route("**/api/game**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "Insanity", exact: true }).click();
  const group = page.getByRole("group", { name: "Ranking" });
  await group.getByRole("button", { name: "Season" }).click();
  // It sits in the ranked list at its place under the chosen sort (not pinned above it), tagged FINAL, with its score.
  for (let i = 0; i < 40 && !(await page.locator(".ic-fresh").count()); i++) await page.getByRole("button", { name: /^Show more/ }).click(); // it can rank beyond the first page
  const card = page.locator(".ib-cards > li", { has: page.locator(".ic-fresh") }).first();
  await expect(card).toBeVisible();
  await expect(card.locator(".ic-fresh")).toHaveText("FINAL");
  await expect(card.locator(".ic-watch.est")).toContainText("~"); // an estimated watch score until the archive has the real one
  await expect(card.locator(".ic-teams")).toContainText("27");
  expect(Number(await card.getAttribute("data-insanity"))).toBeGreaterThan(50);
  await expect(page.locator(".ib-live-head")).toHaveCount(0); // it is a final, not a live game
  // And it is not listed twice.
  await expect(page.locator(".ic-fresh")).toHaveCount(1);
});
