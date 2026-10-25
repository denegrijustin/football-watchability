import { expect, test } from "./fixtures";

test("an idle page pauses its looping animations, and the first touch plays them again", async ({ page }) => {
  await page.clock.install({ time: Date.parse("2026-10-24T14:00:00Z") });
  await page.goto("/");
  await page.locator(".game-card").first().waitFor();
  // whatever the board happens to show, give it one looping animation to be sure of the count
  await page.evaluate(() => { const d = document.createElement("div"); d.id = "loop"; document.body.append(d); d.animate([{ opacity: 1 }, { opacity: 0.4 }], { duration: 1000, iterations: Infinity }); });
  const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity).length);
  const before = await running();
  expect(before, "a looping animation runs while the page is in use").toBeGreaterThan(0);
  await page.clock.fastForward(30_000);
  await expect(page.locator("html")).toHaveAttribute("data-idle", "");
  expect(await running()).toBe(0);
  await page.mouse.move(40, 40);
  await page.mouse.down(); await page.mouse.up();
  await expect(page.locator("html")).not.toHaveAttribute("data-idle", "");
  await expect.poll(running).toBeGreaterThan(0);
});

test("no looping animation repaints with box-shadow, background or filter (only transform and opacity)", async ({ page }) => {
  await page.goto("/");
  await page.locator(".game-card").first().waitFor();
  await page.waitForTimeout(1500);
  const bad = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity).map((a) => ({ name: (a as CSSAnimation).animationName, props: [...new Set((a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))].filter((p) => !["offset", "easing", "composite", "computedOffset", "transform", "opacity"].includes(p)) })).filter((x) => x.props.length));
  expect(bad).toEqual([]);
});
