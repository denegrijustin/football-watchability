import { expect, test } from "@playwright/test";

// The simulator is a lazy tab. It must open, run a game and its forecast, and never disturb the rest of the page.
test("the Simulator tab runs a game: forecast, stage, play feed and a final score", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "Simulator" }).click();
  await expect(page.getByRole("heading", { name: "Game simulator" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate this game" }).click();
  const forecast = page.getByRole("region", { name: "Forecast" });
  await expect(forecast).toBeVisible({ timeout: 45_000 });
  await expect(forecast.getByText("Projected score")).toBeVisible();
  await expect(page.locator(".st")).toBeVisible();
  // Skip to the end: a final score and a full play log.
  await page.getByRole("button", { name: "Skip to final" }).click();
  await expect(page.locator(".st-clock b")).toHaveText(/FINAL/);
  expect(await page.locator(".sim-feed li").count()).toBeGreaterThan(20);
  await expect(page.locator(".sim-lines")).toBeVisible();
  expect(errors).toEqual([]);
});

test("all nine tabs stay on one row, visible and not overlapping, from 375px up", async ({ page }) => {
  for (const w of [375, 390, 700, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/?league=NFL");
    await expect(page.locator(".view-switch button").first()).toBeVisible();
    const r = await page.evaluate(() => {
      const bs = [...document.querySelectorAll(".view-switch button")].map((x) => x.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].left < bs[j].right - 0.5 && bs[j].left < bs[i].right - 0.5 && bs[i].top < bs[j].bottom - 0.5 && bs[j].top < bs[i].bottom - 0.5) overlaps++;
      return { n: bs.length, overlaps, off: bs.filter((b) => b.right > innerWidth + 1 || b.left < -1).length, rows: new Set(bs.map((b) => Math.round(b.top))).size };
    });
    expect(r, `tabs at ${w}px`).toEqual({ n: 9, overlaps: 0, off: 0, rows: 1 });
  }
});

test("the Upset Alert Meter: filters on one line, a week selector, and an earlier week loads its own games", async ({ page }) => {
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "Upset Alert Meter" }).click();
  await expect(page.locator(".um-row").first()).toBeVisible();
  // The league and Show filters share one row.
  const tops = await page.locator(".um-controls .segmented").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // An earlier week is one click away and lists only finished games.
  const select = page.locator(".um-week select");
  const options = await select.locator("option").allTextContents();
  expect(options.length).toBeGreaterThan(2);
  expect(options[0]).toContain("this week");
  await select.selectOption({ index: 1 });
  await expect(page.locator(".um-col h3")).toHaveText(/Completed/);
  await expect(page.locator(".um-row").first()).toBeVisible();
  expect(await page.locator(".um-row.final").count()).toBe(await page.locator(".um-row").count());
  await expect(page.getByRole("button", { name: "To play" })).toHaveCount(0);
});

import { shape, type Raw } from "../src/sim/roster";

test("rosters: season leaders pick the players; without them the most experienced QB and real roster names are used", () => {
  const people = [
    { id: "1", name: "J. Fields", pos: "QB", exp: 5 }, { id: "2", name: "P. Mahomes", pos: "QB", exp: 9 }, { id: "3", name: "G. Nussmeier", pos: "QB", exp: 0 },
    { id: "4", name: "K. Walker III", pos: "RB", exp: 3 }, { id: "5", name: "E. Johnson", pos: "RB", exp: 2 },
    { id: "6", name: "T. Kelce", pos: "TE", exp: 13 }, { id: "7", name: "R. Rice", pos: "WR", exp: 3 }, { id: "8", name: "X. Worthy", pos: "WR", exp: 2 },
  ];
  const leaders: Raw["leaders"] = {
    passingYards: [{ id: "2", w: 1037 }], rushingYards: [{ id: "4", w: 537 }, { id: "5", w: 56 }, { id: "2", w: 41 }],
    receivingYards: [{ id: "6", w: 246 }, { id: "7", w: 190 }, { id: "8", w: 133 }, { id: "4", w: 84 }],
  };
  const full = shape({ color: "e31837", alt: "ffb81c", people, leaders });
  expect(full.roster.qb).toBe("P. Mahomes");
  expect(full.roster.rushers?.map((r) => r.name)).toEqual(["K. Walker III", "E. Johnson"]); // the quarterback's scrambles are not a back
  expect(full.roster.receivers?.map((r) => [r.name, r.pos])).toEqual([["T. Kelce", "TE"], ["R. Rice", "WR"], ["X. Worthy", "WR"], ["K. Walker III", "RB"]]);
  expect(full.color).toBe("#e31837");
  // ESPN's season leaders missing: the starter is the veteran, not whoever is listed first, and every position still has names.
  const bare = shape({ color: null, alt: null, people, leaders: { passingYards: [], rushingYards: [], receivingYards: [] } });
  expect(bare.roster.qb).toBe("P. Mahomes");
  expect(bare.roster.rushers?.map((r) => r.name)).toEqual(["K. Walker III", "E. Johnson"]);
  expect(bare.roster.receivers?.length).toBeGreaterThanOrEqual(3);
  expect(bare.roster.receivers?.every((r) => r.name && !/receiver/i.test(r.name))).toBe(true);
});
