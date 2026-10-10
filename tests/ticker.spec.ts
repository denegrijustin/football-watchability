import { expect, test } from "@playwright/test";

test("a persistent strip of final scores sits at the very top and stays there while scrolling", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  await expect(ticker).toBeVisible();
  await expect(ticker.locator(".ticker-item").first()).toBeAttached();
  expect(await ticker.evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBe(0);
  await page.mouse.wheel(0, 2500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  expect(await ticker.evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBe(0);
  // It never makes the page wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
});

test("it scrolls, stops under the pointer or on request, and each score says where it leads", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  const track = ticker.locator(".ticker-track");
  await expect(track).toBeVisible();
  const state = () => track.evaluate((e) => getComputedStyle(e).animationPlayState);
  expect(await state()).toBe("running");
  await ticker.hover();
  expect(await state()).toBe("paused");
  await page.mouse.move(0, 400);
  expect(await state()).toBe("running");
  const pause = ticker.getByRole("button", { name: "Pause" });
  await pause.click();
  await page.mouse.move(0, 400);
  expect(await state()).toBe("paused");
  await expect(ticker.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "true");
  // Real scores, each labeled for assistive tech, and the looped copy is hidden from it.
  const labels = await ticker.locator(".ticker-track > li:not([aria-hidden]) .ticker-item").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labels.length).toBeGreaterThan(0);
  for (const l of labels) expect(l).toMatch(/\d+, .* \d+, final(\/ot)?\. Open the postgame summary\.$/);
  expect(await ticker.locator(".ticker-dup").count()).toBe(labels.length);
});

test("clicking a score opens its Game Center postgame summary", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  const first = ticker.locator(".ticker-track > li:not([aria-hidden]) .ticker-item").first();
  const label = (await first.getAttribute("aria-label")) ?? "";
  await ticker.hover(); // the strip holds still under the pointer, so the click lands
  await first.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/final/i);
  // The teams in the dialog are the ones that were clicked.
  const [away] = label.split(", ");
  await expect(dialog).toContainText(away.replace(/ \d+$/, ""));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("with reduced motion the strip doesn't scroll by itself", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  await expect(ticker.locator(".ticker-item").first()).toBeAttached();
  expect(await ticker.locator(".ticker-track").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await expect(ticker.locator(".ticker-dup").first()).toBeHidden();
  await expect(ticker.getByRole("button", { name: "Pause" })).toBeHidden();
});
