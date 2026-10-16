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

test("every tab stays visible and none overlap at any width", async ({ page }) => {
  for (const w of [320, 390, 700, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/?league=NFL");
    await expect(page.locator(".view-switch button").first()).toBeVisible();
    const r = await page.evaluate(() => {
      const bs = [...document.querySelectorAll(".view-switch button")].map((x) => x.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].left < bs[j].right - 0.5 && bs[j].left < bs[i].right - 0.5 && bs[i].top < bs[j].bottom - 0.5 && bs[j].top < bs[i].bottom - 0.5) overlaps++;
      return { n: bs.length, overlaps, off: bs.filter((b) => b.right > innerWidth + 1 || b.left < -1).length };
    });
    expect(r, `tabs at ${w}px`).toEqual({ n: 8, overlaps: 0, off: 0 });
  }
});
