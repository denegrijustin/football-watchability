import type { Page } from "@playwright/test";
import type { Final } from "../../src/finals";

/**
 * Pins the finished-games overlay for a test: the saved finals file and ESPN's scoreboards (through our proxy or directly) return
 * exactly `games`, so a tracker's record does not depend on today's real scores.
 */
export async function stubFinals(page: Page, games: Final[] = []) {
  const league = (url: string) => (/league=nfl|\/nfl\//.test(url) ? "nfl" : "cfb");
  await page.route("**/data/finals.json", (r) => r.fulfill({ json: { updated: "2026-10-14T00:00:00Z", season: 2026, games } }));
  await page.route("**/api/scores**", (r) => {
    const url = r.request().url();
    return url.includes("full=1") ? r.fulfill({ json: games.filter((g) => g.l === league(url)) }) : r.fulfill({ json: [] });
  });
  await page.route("https://site.api.espn.com/**", (r) => r.fulfill({ json: { events: [] } }));
}

/** The final-scores strip lists the week's finished games, so on the first days of a new week (before any game is played) there is none to check. Call after opening the board. */
export async function skipWithoutFinalScores(page: Page, skip: (c: boolean, why: string) => void) {
  await page.locator(".game-card").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  skip((await page.locator(".fs-toggle").count()) === 0, "no game has finished on this week's board yet, so there is no final-scores strip");
}
