import { expect, test } from "./fixtures";
import { openPicksPart } from "./helpers/outlook";
import { readFileSync } from "node:fs";

const ledger = JSON.parse(readFileSync("src/data/season.json", "utf8")).games as any[];

test("the Upset Meter's completed games sort by insanity in an earlier week too (the ledger has them, the archive does not)", async ({ page }) => {
  await page.goto("/?league=CFB");
  await openPicksPart(page, "Upset Alert Meter");
  await page.getByLabel("Week", { exact: true }).selectOption({ label: "Oct. 1–5, 2026" });
  const sort = page.getByRole("group", { name: "Sort completed games by" });
  await sort.getByRole("button", { name: "Most insane" }).click();
  await expect(page.locator(".um-row").first()).toBeVisible();
  const pairs = await page.locator(".um-row").evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll(".um-tr b")].map((b) => b.textContent)));
  const score = (p: (string | null)[]) => ledger.find((g) => g.week === "Oct. 1–5, 2026" && g.league === "CFB" && g.away.abbr === p[0] && g.home.abbr === p[1])?.insanity ?? ledger.find((g) => g.week === "Oct. 1–5, 2026" && g.league === "CFB" && g.away.abbr === p[1] && g.home.abbr === p[0])?.insanity ?? -1;
  const scores = pairs.map(score);
  expect(scores.length).toBeGreaterThan(10);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
});

test("the Insanity tab shows each game's watch score and each team's rank, and Highest ranked orders by the better rank shown", async ({ page }) => {
  await page.goto("/?league=CFB");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^Insanity/ }).click();
  await page.getByRole("group", { name: "Sort games by" }).getByRole("button", { name: "Highest ranked" }).click();
  await expect(page.locator(".ic .ic-watch").first()).toBeVisible();
  await expect(page.locator(".ic .plus-rank").first()).toBeVisible();
  const best = await page.locator(".ic").evaluateAll((els) => els.map((e) => {
    const n = [...e.querySelectorAll(".plus-rank [aria-hidden]")].map((x) => +(x.textContent ?? "NaN")).filter((x) => x > 0);
    return n.length ? Math.min(...n) : Infinity;
  }));
  expect(best.length).toBeGreaterThan(3);
  expect(best).toEqual([...best].sort((a, b) => a - b));
});

test("a game that just ended is sorted into the Insanity list with the rest, not pinned above it", async ({ page }) => {
  // the same setup as the live-insanity test: one college game is final on the live feed but not yet archived
  const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
  const archived = new Set(JSON.parse(readFileSync("src/data/results.json", "utf8")).games.map((r: any) => String(r.espnId)));
  const cfb = slate.games.filter((g: any) => g.league === "CFB" && !archived.has(String(g.espnId)));
  test.skip(cfb.length === 0, "no college game waiting to be archived on this slate");
  const fresh = cfb[0];
  await page.clock.install({ time: new Date(fresh.date).getTime() + 5 * 3600e3 });
  await page.route("**/api/scores**", (route) => route.fulfill({ json: cfb.map((g: any) => ({ id: g.espnId, state: g === fresh ? "post" : "pre", detail: g === fresh ? "Final" : "", away: 20, home: 23 })) }));
  await page.route("**/api/flow**", (route) => route.fulfill({ json: { wp: Array.from({ length: 80 }, (_, i) => [50 + (i % 2 ? 4 : -4), 1 + Math.floor(i / 20)]) } }));
  await page.route("**/api/game**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/?league=CFB");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^Insanity/ }).click();
  await page.getByRole("group", { name: "Sort games by" }).getByRole("button", { name: "Score margin" }).click();
  await expect(page.locator(".ic-fresh")).toHaveCount(1);
  const margins = await page.locator(".ib-cards > li").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-margin"))));
  expect(margins).toEqual([...margins].sort((a, b) => a - b));
});
