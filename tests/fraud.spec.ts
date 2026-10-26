import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { fraudRows } from "../src/fraud";

const outlook = JSON.parse(readFileSync("src/data/outlook.json", "utf8"));
const grid = Object.values(outlook.nfl.conferences).flatMap((c: any) => c.grid) as any[];

test("the fraud gap is a team's simulated final wins against a typical team with the same record", () => {
  const base = { id: "x", name: "X", abbr: "X", logoId: null };
  // 0-0: a typical team wins half of 17; a team simulated at 10.5 is two wins better.
  expect(fraudRows([{ ...base, record: "0-0", expW: 10.5 }])[0].gap).toBe(2);
  // 2-4 with 11 games left: typical = 2 + 11 * 8/18 = 6.9, so a simulated 9 hides about two wins.
  const r = fraudRows([{ ...base, record: "2-4", expW: 9 }])[0];
  expect(r.typical).toBe(6.9);
  expect(r.gap).toBeCloseTo(2.11, 1);
  expect(r.finish).toBe("9-8");
  // Sorted from most hidden wins to most faked ones.
  const rows = fraudRows(grid);
  expect(rows).toHaveLength(32);
  for (let i = 1; i < rows.length; i++) expect(rows[i - 1].gap).toBeGreaterThanOrEqual(rows[i].gap);
});

test("the Resumés tab has a fraud meter: every NFL team, best record-beaters first, with its record and projected finish", async ({ page }) => {
  await page.goto("/?league=NFL");
  await page.locator('[data-tab="resumes"]').click();
  await page.getByRole("button", { name: "NFL", exact: true }).click();
  await page.getByRole("group", { name: "Resumé view" }).getByRole("button", { name: "Fraud meter" }).click();
  const rows = page.locator(".fm-row");
  await expect(rows).toHaveCount(32);
  await expect(rows.first()).toHaveClass(/up/);
  await expect(rows.last()).toHaveClass(/down/);
  await expect(rows.first().locator(".fm-name small")).toContainText("→");
  await rows.first().locator(".fm-logo").click(); // a team opens its page
  await expect(page.locator('.view-switch [data-tab="teams"]')).toHaveAttribute("aria-pressed", "true");
});

test("the fraud meter says it is NFL only when college is chosen, and the resumés are one tap back", async ({ page }) => {
  await page.goto("/?league=CFB");
  await page.locator('[data-tab="resumes"]').click();
  await page.getByRole("button", { name: "College (all FBS)" }).click();
  await page.getByRole("button", { name: "Fraud meter" }).click();
  await expect(page.getByText("NFL only for now")).toBeVisible();
  await page.getByRole("button", { name: "Resumés", exact: true }).click();
  await expect(page.locator(".rs-row").first()).toBeVisible();
});
