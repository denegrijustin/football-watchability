import { expect, test } from "@playwright/test";

test("crossover engine expands, compares ranks and swaps teams", async ({ page }) => {
  await page.goto("/matchup-demo.html?sample=1");
  const toggle = page.getByRole("button", { name: /Kansas City Chiefs vs/ });
  const swap = page.getByRole("button", { name: "Swap teams" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(swap).not.toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("table")).toHaveCount(2);
  await expect(page.getByRole("row")).toHaveCount(14);
  await expect(page.getByLabel("KC advantage: 20 rank spots", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Even matchup: 1 rank spots apart", { exact: true })).toBeVisible();
  await expect(page.getByText("Top 10", { exact: true })).toHaveCount(7);
  await expect(page.getByText("Top 5", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Best in League", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Worst", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Bottom 5", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Bottom 10", { exact: true })).toHaveCount(7);
  await swap.click();
  await expect(swap).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "LV offense vs. KC defense" })).toBeVisible();
  const sections = page.locator("section");
  const first = await sections.nth(0).boundingBox(), second = await sections.nth(1).boundingBox();
  expect(first && second).toBeTruthy();
  if (test.info().project.name === "mobile") expect(second!.y).toBeGreaterThan(first!.y);
  else expect(second!.y).toBe(first!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(swap).not.toBeVisible();
});

 test("college labels use national ranks and the supplied pool", async ({ page }) => {
  await page.goto("/matchup-demo.html?sample=1");
  await page.getByLabel("League").selectOption("CFB");
  await page.getByRole("button", { name: /College Team A vs/ }).click();
  await expect(page.getByText("#1 nationally", { exact: true })).toBeVisible();
  await expect(page.getByText("Best in Nation", { exact: true })).toBeVisible();
  await expect(page.getByText("#136 nationally", { exact: true })).toBeVisible();
  await expect(page.getByText("Worst", { exact: true })).toBeVisible();
  await expect(page.getByText("Bottom 5", { exact: true })).toHaveCount(1);
});
