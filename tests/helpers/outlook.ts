import type { Page } from "@playwright/test";

/** The playoff picture (what was the Outlook tab) now lives in the Standings tab, one tap from the standings. */
export async function openOutlook(page: Page) {
  await page.locator('[data-tab="standings"]').evaluate((b) => (b as HTMLElement).click());
  await page.getByRole("button", { name: "Playoff picture" }).click();
}
