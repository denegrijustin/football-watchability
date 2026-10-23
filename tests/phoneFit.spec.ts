import { test, expect } from "./fixtures";
import { stubFinals } from "./helpers/finals";
import { openSppTab } from "./helpers/spp";

// On a small phone no view may make the page itself scroll sideways. (The TV grid and the conference chart keep their own scroll area on purpose.)
for (const lg of ["CFB", "NFL"] as const) {
  test(`@phone no view widens the page on a 360px phone (${lg})`, async ({ page }) => {
    test.setTimeout(150_000);
    await stubFinals(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/?league=${lg}`);
    await page.locator(".game-card").first().waitFor();
    const widest = async (what: string) => {
      await page.waitForTimeout(500);
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(sw, `${what} is wider than the screen`).toBeLessThanOrEqual(cw);
    };
    await widest("board");
    for (const v of ["picks", "upset", "insanity", "sim", "grid", "outlook", "empire"]) {
      await page.evaluate((d) => window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: d })), v);
      await page.waitForTimeout(1200);
      await widest(v);
      if (v === "picks") for (const s of ["ATS record", "Parlays", "This week"]) { await page.getByRole("group", { name: "Picks section" }).getByRole("button", { name: s }).click(); await widest(`picks / ${s}`); }
    }
    for (const [v, tabs] of [["spplus", ["Rankings", "Simulator", "ATS tracker"]], ["nfl", ["Ratings", "Simulator", "ATS tracker"]]] as const) {
      await page.evaluate((d) => window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: d })), v);
      await page.waitForTimeout(1500);
      for (const t of tabs) { await openSppTab(page, t, true); await widest(`${v} / ${t}`); }
    }
  });
}
