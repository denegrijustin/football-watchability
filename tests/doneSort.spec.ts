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
