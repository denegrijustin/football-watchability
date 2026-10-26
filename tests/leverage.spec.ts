import { test, expect } from "./fixtures";
import { openOutlook } from "./helpers/outlook";
import { readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";

test.beforeEach(async ({ page }) => { await stubFinals(page); });

type Row = { id: string; bye?: boolean; cur: number; ifWin?: number | null; ifLoss?: number | null };
const outlook = JSON.parse(readFileSync("src/data/outlook.json", "utf8"));

test("the saved leverage numbers make sense: a win never hurts, byes carry no swing, and the odds sit between the two ends", () => {
  for (const lg of ["nfl", "cfb"]) {
    const lev = outlook[lg].leverage;
    expect(lev.week).toBeGreaterThan(0);
    expect(lev.rows.length).toBeGreaterThan(10);
    for (const r of lev.rows as Row[]) {
      if (r.bye) { expect(r.ifWin).toBeUndefined(); continue; }
      expect(r.ifWin).not.toBeNull();
      expect(r.ifWin! + 0.6).toBeGreaterThanOrEqual(r.ifLoss!);
      expect(r.cur).toBeLessThanOrEqual(Math.max(r.ifWin!, r.ifLoss!) + 1.5);
      expect(r.cur).toBeGreaterThanOrEqual(Math.min(r.ifWin!, r.ifLoss!) - 1.5);
    }
    for (const g of lev.games) expect(g.total).toBeCloseTo((g.away.ifWin - g.away.ifLoss) + (g.home.ifWin - g.home.ifLoss), 0);
  }
});

for (const [name, lg, label] of [["NFL", "nfl", "NFL"], ["College", "cfb", "CFB"]] as const) {
  test(`the Outlook tab's Leverage view draws every team and the games of the week (${name})`, async ({ page }) => {
    await page.goto(`/?league=${label}`);
    await openOutlook(page);
    const group = page.getByRole("group", { name: "Outlook section" });
    await group.getByRole("button", { name: "Leverage" }).click();
    const lev = outlook[lg].leverage;
    await expect(page.locator(".lev-chart svg image, .lev-chart svg .lev-chip")).toHaveCount(lev.rows.length);
    await expect(page.locator(".lev-games li")).toHaveCount(lev.games.length);
    await expect(page.getByText(`going into week ${lev.week}`)).toBeVisible();
  });
}
