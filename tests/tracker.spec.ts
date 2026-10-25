import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { nflTier, trackerTier } from "../scripts/outlook-lib.mjs";

const outlook = JSON.parse(readFileSync("src/data/outlook.json", "utf8"));

test("a team lands in the tier its odds put it in", () => {
  const row = (pPlayoffs: number, pByLoss: (number | null)[], more: object = {}) => ({ pPlayoffs, pByLoss, pIfWin: null, pIfNot: null, pTitle: 0, ...more });
  expect(trackerTier(row(100, [100, 100, 100, 100]))).toBe("clinched");
  expect(trackerTier(row(90, [99, 95, 70, 20]))).toBe("safe");
  expect(trackerTier(row(70, [95, 60, 20, 3]))).toBe("thin");
  expect(trackerTier(row(40, [80, 30, 5, 0]))).toBe("table");
  expect(trackerTier(row(20, [40, 10, 1, 0], { pIfWin: 70, pIfNot: 1, pTitle: 30 }))).toBe("must");
  expect(trackerTier(row(8, [30, 5, 0, 0]))).toBe("life");
  expect(trackerTier(row(0.2, [1, 0, 0, 0]))).toBe("out");
  expect(trackerTier(row(15, [30, 5, 0, 0]), { g6: true })).toBe("g6");
  expect(trackerTier(row(0.3, [1, 0, 0, 0]), { g6: true })).toBe("out"); // a Group of 6 school with no chance is out
  expect(["clinched", "safe", "favored", "toss", "under", "long", "out"].map((k, i) => nflTier([100, 90, 70, 50, 20, 5, 0][i]))).toEqual(["clinched", "safe", "favored", "toss", "under", "long", "out"]);
});

test("the saved tracker puts every team in exactly one tier", () => {
  const t = outlook.cfb.tracker;
  expect(t.spots).toBe(12);
  const ids = t.tiers.flatMap((x: any) => x.teams.map((y: any) => y.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.length).toBe(outlook.cfb.composite.length);
  expect(t.tiers.map((x: any) => x.key)).toEqual(["clinched", "safe", "thin", "table", "must", "life", "g6", "out"]);
  for (const c of ["AFC", "NFC"]) {
    const n = outlook.nfl.conferences[c].tracker.tiers.flatMap((x: any) => x.teams).length;
    expect(n).toBe(16);
  }
});

test("the Tracker tab shows the tiers with logos that open a team's profile", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-tab="outlook"]').click();
  const ctl = page.locator(".ol-controls");
  await ctl.getByRole("button", { name: "College" }).click();
  await ctl.getByRole("button", { name: "Tracker", exact: true }).click();
  const tk = page.locator("section.tk");
  await expect(tk).toBeVisible();
  await expect(tk.locator(".tk-tier")).toHaveCount(8);
  await expect(tk.locator(".tk-tier.clinched .tk-logos li")).toHaveCount(12); // logos and open slots
  const first = tk.locator(".tk-tier:not(.clinched) .tk-team").first();
  await first.click();
  await expect(page.locator('.view-switch [data-tab="spplus"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-tab="outlook"]').click();
  await ctl.getByRole("button", { name: "NFL" }).click();
  await ctl.getByRole("button", { name: "Tracker", exact: true }).click();
  await expect(page.locator("section.tk")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
