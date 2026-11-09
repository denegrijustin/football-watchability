import { test as base } from "@playwright/test";
export * from "@playwright/test";

// On a phone the app puts the filters in a Filters sheet, and the navigation puts every destination in a menu that opens from one of five
// buttons (a dropdown on a computer, a sheet above the bottom bar on a phone). Most tests are about what the destinations do, not where
// they sit, so by default they lay the menus out open and inline (the five category buttons are hidden, every destination is visible);
// a test that is about the real layout carries "@phone" (phone layout) or "@nav" (menus as they really behave) in its title.
const NAV_INLINE = `
  .view-row { position: static !important; height: auto !important; }
  .site-nav { position: static !important; padding: 0 !important; border: 0 !important; }
  .nav-list { display: flex !important; flex-wrap: wrap !important; }
  .nav-trigger, .nav-scrim { display: none !important; }
  .nav-panel { position: static !important; display: block !important; visibility: visible !important; opacity: 1 !important; transform: none !important; min-width: 0 !important; max-height: none !important; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
  .nav-group ul { display: flex !important; flex-wrap: wrap !important; }
  .nav-item { width: auto !important; }
`;
const INLINE = `@media (max-width: 760px) {
  .filter-dock { position: static !important; }
  .filter-sheet { position: static !important; display: contents !important; transform: none !important; visibility: visible !important; opacity: 1 !important; }
  .filter-bar { flex-wrap: wrap !important; overflow: visible !important; max-width: 100% !important; }
  .filter-toggle, .sheet-head { display: none !important; }
}`;

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const real = testInfo.title.includes("@phone") || testInfo.title.includes("@nav");
    const css = (testInfo.project.name === "mobile" && !testInfo.title.includes("@phone") ? INLINE : "") + (real ? "" : NAV_INLINE);
    if (css) {
      await page.addInitScript((css) => {
        const add = () => {
          const s = document.createElement("style");
          s.textContent = css;
          document.documentElement.appendChild(s);
        };
        if (document.documentElement) add();
        else document.addEventListener("DOMContentLoaded", add);
      }, css);
    }
    await use(page);
  },
});

/** Opens a section the way a reader does: its category button first when the menu is closed (the real layout), then the entry. */
export async function openSection(page: import("@playwright/test").Page, view: string) {
  const item = page.locator(`.site-nav [data-tab="${view}"]`);
  if (!(await item.isVisible())) {
    const cat = await item.evaluate((el) => el.closest(".nav-cat")!.querySelector(".nav-trigger")!.getAttribute("data-category"));
    await page.locator(`.nav-trigger[data-category="${cat}"]`).click();
  }
  await item.click();
}
