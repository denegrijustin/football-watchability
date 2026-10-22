import type { Page } from "@playwright/test";

/** Opens the Team performance menu and picks one of the eight views by name (retrying if the page re-renders under it while data loads). */
export async function goPerf(page: Page, name: string) {
  const btn = page.getByTestId("perf-menu-btn");
  const esc = name.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&");
  const item = page.getByRole("menuitemradio").filter({ has: page.locator("b", { hasText: new RegExp(`^${esc}$`) }) });
  for (let i = 0; ; i++) {
    try {
      if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
      await item.click({ timeout: 4000 });
      return;
    } catch (e) {
      if (i >= 3) throw e;
    }
  }
}
