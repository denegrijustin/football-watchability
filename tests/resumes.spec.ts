import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { buildModel } from "../src/spplus/data/model";
import { cfbResumes, nflResumes, BAD_HOME, BAD_ROAD } from "../src/resume";

const model = buildModel(JSON.parse(readFileSync("src/data/spplus.json", "utf8")));
const nfl = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));

test("every FBS team has a resumé, in rating order, with its wins and losses", () => {
  const rs = cfbResumes(model);
  expect(rs.length).toBeGreaterThanOrEqual(130);
  expect(rs.map((r) => r.rank)).toEqual([...rs.map((r) => r.rank)].sort((a, b) => a - b));
  for (const r of rs) {
    expect(r.wins.length).toBeLessThanOrEqual(3);
    expect(r.losses.length).toBe(r.l); // every loss is listed
    expect(r.wins.every((g) => g.pts > g.oppPts)).toBe(true);
    expect(r.losses.every((g) => g.pts < g.oppPts)).toBe(true);
    for (let i = 1; i < r.wins.length; i++) expect(r.wins[i - 1].oppRating).toBeGreaterThanOrEqual(r.wins[i].oppRating); // best first
  }
  const sos = rs.map((r) => r.sos).filter((x): x is number => x != null);
  expect(new Set(sos).size).toBe(sos.length); // each rank used once
});

test("a loss is BAD when it is to a team outside the top group, with a longer leash on the road", () => {
  for (const lg of ["CFB", "NFL"] as const) {
    const rs = lg === "CFB" ? cfbResumes(model) : nflResumes(nfl);
    for (const g of rs.flatMap((r) => r.losses)) {
      const limit = (g.venue === "at" ? BAD_ROAD : BAD_HOME)[lg];
      expect(!!g.bad, `${g.opp} ${g.oppRk}`).toBe(g.oppRk == null || g.oppRk > limit);
    }
  }
  // a college loss to a lower-division school is always bad
  expect(cfbResumes(model).flatMap((r) => r.losses).filter((g) => g.oppRk == null).every((g) => g.bad)).toBe(true);
});

test("all 32 NFL teams are there, with records that add up to the games played", () => {
  const rs = nflResumes(nfl);
  expect(rs).toHaveLength(32);
  for (const r of rs) {
    expect(r.wins.length + r.losses.length).toBeLessThanOrEqual(r.w + r.l + r.t);
    expect(r.losses.length).toBe(r.l);
    expect(r.rank).toBeGreaterThan(0); expect(r.off).toBeGreaterThan(0); expect(r.def).toBeGreaterThan(0);
  }
  expect(new Set(rs.map((r) => r.rank)).size).toBe(32);
});

test("the Resumés tab lists every team for both leagues, and the search narrows it", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-tab="resumes"]').click();
  await expect(page.locator("section.rs")).toBeVisible();
  await page.getByRole("button", { name: "College (all FBS)" }).click();
  await expect(page.locator(".rs-row").first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator(".rs-row").count()).toBeGreaterThanOrEqual(130);
  await expect(page.locator(".rs-row").first().locator(".rs-col.wins")).toBeVisible();
  await page.getByRole("button", { name: "NFL", exact: true }).click();
  await expect(page.locator(".rs-row")).toHaveCount(32);
  await page.getByPlaceholder("Find a team or conference").fill("seahawks");
  await expect(page.locator(".rs-row")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
