import { expect, type Page } from "@playwright/test";

export type Cat = "games" | "teams" | "rankings" | "analytics" | "more";
export const CATS: Cat[] = ["games", "teams", "rankings", "analytics", "more"];
export const CAT_LABELS = ["Games", "Teams", "Rankings", "Analytics", "More"];

/** The labels each category lists, in order (docs/navigation-phase1.md). */
export const ITEMS: Record<Cat, string[]> = {
  games: ["Watchability Dashboard", "Live Games", "Upcoming Games", "Completed Games", "TV Grid", "Game Center"],
  teams: ["Team Profiles", "Injuries", "Trade Finder"],
  rankings: ["Standings", "Team Resumés", "CFB SP+", "NFL+"],
  analytics: ["Insanity", "Empire", "ATS & Parlays"],
  more: ["Spreadsheet (CSV)", "Calendar (.ics)", "Change Time Zone", "How to Read a Card", "About & Methodology", "ESPN", "nflverse"],
};

/** The 12 views that have a menu entry, and the category each one lives in. */
export const TABS: Record<string, Cat> = {
  board: "games", grid: "games", teams: "teams", injuries: "teams", trades: "teams", standings: "rankings", resumes: "rankings",
  spplus: "rankings", nfl: "rankings", insanity: "analytics", empire: "analytics", picks: "analytics",
};

/** Every View id the address bar accepts, the entry it lights (data-tab) and the category. */
export const VIEW_URLS: Record<string, { entry: string; cat: Cat }> = {
  board: { entry: "board", cat: "games" }, picks: { entry: "picks", cat: "analytics" }, grid: { entry: "grid", cat: "games" },
  insanity: { entry: "insanity", cat: "analytics" }, outlook: { entry: "standings", cat: "rankings" }, empire: { entry: "empire", cat: "analytics" },
  spplus: { entry: "spplus", cat: "rankings" }, nfl: { entry: "nfl", cat: "rankings" }, sim: { entry: "picks", cat: "analytics" },
  upset: { entry: "picks", cat: "analytics" }, injuries: { entry: "injuries", cat: "teams" }, standings: { entry: "standings", cat: "rankings" },
  resumes: { entry: "resumes", cat: "rankings" }, teams: { entry: "teams", cat: "teams" }, trades: { entry: "trades", cat: "teams" },
};

/** A stable marker for each view's own content (the root element of its component, or its first heading). */
export const MARKER: Record<string, string> = {
  board: ".board-heading", picks: ".ph", grid: ".tvgrid", insanity: ".ib", outlook: ".sh", empire: ".imp", spplus: ".spp-host", nfl: ".nfl-host",
  sim: ".ph", upset: ".ph", injuries: ".ij", standings: ".sh", resumes: ".rs", teams: ".tm", trades: ".tf",
};

export const trigger = (page: Page, cat: Cat) => page.locator(`nav.site-nav[aria-label="Primary"] .nav-trigger[data-category="${cat}"]`);
export const panel = (page: Page, cat: Cat) => page.locator(`#nav-panel-${cat}`);
export const item = (page: Page, sel: string) => page.locator(`nav.site-nav .nav-item${sel}`);
export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 760;

/** Sizes the window and loads the app; the nav is ready when its five buttons exist. */
export async function load(page: Page, width: number, url = "/", height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await expect(page.locator("nav.site-nav .nav-trigger")).toHaveCount(5);
}

/** Opens a category menu with a click (does nothing when it is already open). */
export async function openCat(page: Page, cat: Cat) {
  const t = trigger(page, cat);
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await expect(t).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page, cat)).toBeVisible();
}

/** The real two-click path: open the category, then press the entry. `selector` is e.g. `[data-tab="grid"]`. */
export async function choose(page: Page, cat: Cat, selector: string) {
  await openCat(page, cat);
  await item(page, selector).click();
}

/** Waits for a view's own content to show. */
export async function seeView(page: Page, view: string) {
  await expect(page.locator(`#games .view-in ${MARKER[view]}`).first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#games .view-in .ol-note[role=alert]")).toHaveCount(0);
}

/** Which categories/entries are current right now. */
export async function current(page: Page) {
  return page.evaluate(() => ({
    cats: [...document.querySelectorAll<HTMLElement>(".nav-trigger[aria-current]")].map((e) => e.dataset.category!),
    items: [...document.querySelectorAll<HTMLElement>(".nav-item[aria-current]")].map((e) => e.dataset.tab ?? e.dataset.status ?? e.dataset.action ?? ""),
    currentValues: [...document.querySelectorAll<HTMLElement>("[aria-current]")].map((e) => e.getAttribute("aria-current")),
  }));
}

export const search = (page: Page) => new URL(page.url()).searchParams;
