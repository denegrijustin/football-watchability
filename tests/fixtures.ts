import { test as base } from "@playwright/test";
export * from "@playwright/test";

// On a phone the app puts the less-used tabs in a More sheet and the filters in a Filters sheet. Most tests are about
// what the tabs and filters do, not where they sit, so by default the mobile project lays them out inline; a test
// that is about the phone layout itself carries "@phone" in its title and sees the real thing.
const INLINE = `@media (max-width: 760px) {
  .view-row, .filter-dock { position: static !important; }
  .view-switch { position: static !important; display: flex !important; flex-wrap: wrap !important; }
  .view-switch .more-sheet { position: static !important; display: contents !important; opacity: 1 !important; visibility: visible !important; transform: none !important; }
  .view-switch .tab-more { display: none !important; }
  .filter-sheet { position: static !important; display: contents !important; transform: none !important; visibility: visible !important; opacity: 1 !important; }
  .filter-bar { flex-wrap: wrap !important; overflow: visible !important; max-width: 100% !important; }
  .filter-toggle, .sheet-head { display: none !important; }
}`;

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (testInfo.project.name === "mobile" && !testInfo.title.includes("@phone")) {
      await page.addInitScript((css) => {
        const add = () => {
          const s = document.createElement("style");
          s.textContent = css;
          document.documentElement.appendChild(s);
        };
        if (document.documentElement) add();
        else document.addEventListener("DOMContentLoaded", add);
      }, INLINE);
    }
    await use(page);
  },
});
