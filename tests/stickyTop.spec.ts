import { expect, test } from "./fixtures";
import { endzoneFor } from "../src/sim/endzone";
import { MIDFIELD_ART } from "../src/sim/midfield";

test("@phone the ticker, header, filters and tab row stay at the top of the page while it scrolls", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.waitForSelector(".view-row", { state: "attached" });
  await page.evaluate(() => window.scrollTo(0, 1800));
  await page.waitForTimeout(300);
  const top = (sel: string) => page.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().top));
  const bottom = (sel: string) => page.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().bottom));
  expect(await top(".ticker")).toBe(0);
  if (!isMobile) expect(await top(".view-row")).toBeLessThan(300); // the tab row is on screen after a long scroll
  if (!isMobile) {
    expect(await top(".site-header")).toBe(await bottom(".ticker"));
    expect(await top(".filter-dock")).toBe(await bottom(".site-header"));
    expect(await top(".view-row")).toBe(await bottom(".filter-dock"));
  } else {
    expect(await top(".filter-dock")).toBe(await bottom(".ticker"));
    // On a phone the sections are a tab bar fixed to the bottom of the screen.
    expect(await bottom(".view-switch")).toBeGreaterThan(await page.evaluate(() => innerHeight) - 4);
  }
});

test("LSU: gold end zone on the left, purple on the right, and the tiger eye at midfield", () => {
  const ez = endzoneFor({ short: "LSU", color: "#461d7c" });
  expect(ez.sides![0]).toMatchObject({ base: "#fdd023", ink: "#461d7c" });
  expect(ez.sides![1]).toMatchObject({ base: "#461d7c", ink: "#fdd023" });
  expect(MIDFIELD_ART.lsu.src).toBe("/field-art/lsu.webp");
});

test("the ticker's upset halo is a steady glow (it no longer pulses, so the screen is not redrawn all day)", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".ticker-item");
  const upset = page.locator(".ticker-item.upset").first();
  test.skip((await upset.count()) === 0, "no upset in the ticker on this slate");
  const name = await upset.evaluate((e) => getComputedStyle(e).animationName);
  const shadow = await upset.evaluate((e) => getComputedStyle(e).boxShadow);
  expect(name).toBe("none");
  expect(shadow).not.toBe("none");
});
