import type { Page } from "@playwright/test";

/** The playoff picture (what was the Outlook tab) now lives in the Standings tab, one tap from the standings. */
export async function openOutlook(page: Page) {
  await page.locator('[data-tab="standings"]').evaluate((b) => (b as HTMLElement).click());
  await page.getByRole("button", { name: "Playoff picture" }).click();
}

/** The simulator, the Upset Alert Meter and the full ATS tracker live in the Picks tab, beside the picks and parlays. */
export async function openPicksPart(page: Page, part: "Simulator" | "Upset Alert Meter" | "Full ATS tracker" | "Picks & parlays") {
  await page.locator('[data-tab="picks"]').evaluate((b) => (b as HTMLElement).click());
  await page.getByRole("group", { name: "Picks area" }).getByRole("button", { name: part, exact: true }).click();
}
