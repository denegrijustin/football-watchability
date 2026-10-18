import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";

const ledger = JSON.parse(readFileSync("src/data/season.json", "utf8")).games as any[];

test("the Upset Meter's completed games sort by insanity in an earlier week too (the ledger has them, the archive does not)", async ({ page }) => {
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "Upset Alert Meter" }).click();
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
