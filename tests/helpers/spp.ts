import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Opens one of the CFB SP+ or NFL+ views by name. On a computer that is a click on its tab; on a phone the tabs are replaced by the Views pop-up menu,
 * so the menu is opened and the item picked.
 */
export async function openSppTab(page: Page, name: string | RegExp, exact = false) {
  const btn = page.getByTestId("view-menu-btn");
  await page.locator(".spp .tabrow").first().waitFor();
  if (await btn.isVisible()) {
    await btn.click();
    await page.locator(".spp").getByRole("menuitemradio", { name, exact }).click();
  } else {
    await page.locator(".spp").getByRole("tab", { name, exact }).click();
  }
}

/** Each view is reachable: its tab is visible on a computer, its menu item on a phone. */
export async function expectSppTabs(page: Page, names: string[]) {
  const btn = page.getByTestId("view-menu-btn");
  await page.locator(".spp .tabrow").first().waitFor();
  const phone = await btn.isVisible();
  if (phone) await btn.click();
  for (const name of names) {
    const item: Locator = phone ? page.locator(".spp").getByRole("menuitemradio", { name, exact: true }) : page.locator(".spp").getByRole("tab", { name, exact: true });
    await expect(item).toBeVisible();
  }
  if (phone) await page.keyboard.press("Escape");
}
