import { test, expect } from "./fixtures";
import { stubFinals } from "./helpers/finals";

test.beforeEach(async ({ page }) => { await stubFinals(page); });

for (const [lg, label] of [["NFL", "NFL"], ["CFB", "College"]] as const) {
  test(`the Picks tab puts the ${label} spread picks, over/under picks and parlays one tap from the board`, async ({ page }) => {
    await page.goto(`/?league=${lg}`);
    await page.locator('.view-switch [data-tab="picks"]').click();
    await expect(page.getByRole("group", { name: "League" }).getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".lp-pick").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".lp-pick .lp-facts").first()).toContainText("Ratings expect");
    await expect(page.locator(".lb")).toBeVisible();
    await expect(page.locator(".picks-tl li").first()).toBeVisible();
    await page.getByRole("group", { name: "Picks section" }).getByRole("button", { name: "Parlays" }).click();
    await expect(page.locator(".pl-slip").first()).toBeVisible();
    await page.getByRole("button", { name: /Full .* ATS tracker/ }).click();
    await expect(page.locator(".spp")).toBeVisible({ timeout: 20_000 });
  });
}

for (const [lg, label] of [["NFL", "NFL"], ["CFB", "College"]] as const) {
  test(`the ${label} Picks tab shows how graded picks won or missed and charts the parlay record`, async ({ page }) => {
    await page.goto(`/?league=${lg}`);
    await page.locator('.view-switch [data-tab="picks"]').click();
    await expect(page.locator(".pr-results .pr-pick").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".pr-results .pr-why").first()).toContainText(/Covered by|Missed by|Push/);
    await page.getByRole("group", { name: "Picks section" }).getByRole("button", { name: "Parlays" }).click();
    await expect(page.getByRole("group", { name: /Share of 2-leg slips/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("group", { name: "Slip size" }).getByRole("button", { name: "3-leg" }).click();
    await expect(page.getByRole("group", { name: /Share of 3-leg slips/ })).toBeVisible();
    await expect(page.locator(".pr-slip .pr-why").first()).toBeVisible();
  });
}
