// Startup, optional data, error recovery and Game Center loading. These use Playwright's own `test` (not ./fixtures), so the real navigation,
// the real mobile sheets and the real startup run: nothing here lays menus out inline.
import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

const SLATE = readFileSync("src/data/slate.json", "utf8");
const RESULTS = readFileSync("src/data/results.json", "utf8");
const ok = (route: Route, body: string) => route.fulfill({ status: 200, contentType: "application/json", body });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function quiet(page: Page) {
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
  await page.addInitScript(() => { (window as unknown as { __fbNoPreload: boolean }).__fbNoPreload = true; });
}
/** Counts how many times the document itself is loaded: a startup reload would make it 2. */
function loads(page: Page) {
  const n = { count: 0 };
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) n.count++; });
  return n;
}
const boot = (page: Page) => page.locator("html");
const card = (page: Page) => page.locator(".game-card:not(.result-card)").first();

test.describe("startup", () => {
  test("normal startup draws the shell, then the board, and ends ready", async ({ page }) => {
    await quiet(page);
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    await expect(page.getByTestId("boot-shell")).toHaveCount(0);
    await expect(boot(page)).toHaveAttribute("data-fb-boot", /^(ready|degraded)$/);
  });

  test("a slow slate (13.5 s) shows progress, says it is slow, and never reloads the page", async ({ page }) => {
    test.setTimeout(60_000);
    await quiet(page);
    const nav = loads(page);
    await page.route("**/data/slate.json", async (r) => { await sleep(13_500); await ok(r, SLATE); });
    await page.goto("/?league=NFL", { waitUntil: "commit" });
    await expect(page.getByText("Loading this week's games…").first()).toBeVisible();
    await expect(page.getByTestId("boot-shell").getByText("Football Watchability")).toBeVisible(); // the branding and navigation are up already
    await expect(page.getByText("Still connecting. This is taking longer than usual.")).toBeVisible({ timeout: 12_000 });
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    expect(nav.count).toBe(1); // one document load, ever: no timeout-driven reload
  });

  test("missing broadcast checks leave the board up, with the slate's own channels", async ({ page }) => {
    await quiet(page);
    let hits = 0;
    await page.route("**/data/broadcast-checks.json", (r) => { hits++; return r.fulfill({ status: 404, body: "nope" }); });
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    await expect(boot(page)).toHaveAttribute("data-fb-boot", "degraded"); // usable, with one optional dataset missing
    expect(hits).toBe(1); // a 404 is not retried
  });

  test("malformed broadcast checks are a controlled degraded state, tried once", async ({ page }) => {
    await quiet(page);
    let hits = 0;
    await page.route("**/data/broadcast-checks.json", (r) => { hits++; return r.fulfill({ status: 200, contentType: "application/json", body: "{not json" }); });
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    await expect(boot(page)).toHaveAttribute("data-fb-boot", "degraded");
    expect(hits).toBe(1); // an invalid answer is never retried
  });

  test("missing results do not block current games; asking for completed games says unavailable and Retry recovers", async ({ page }) => {
    await quiet(page);
    await page.route("**/data/results.json", (r) => r.fulfill({ status: 404, body: "nope" }));
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    await expect(page.getByText("Past results could not be loaded.")).toBeVisible();
    await page.locator('[data-status-chip="final"]').click();
    const unavailable = page.getByRole("alert").filter({ hasText: "Past results are unavailable right now." });
    await expect(unavailable).toBeVisible(); // not an empty archive passed off as "no completed games"
    await page.unroute("**/data/results.json");
    await page.route("**/data/results.json", (r) => ok(r, RESULTS));
    await unavailable.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Past results are unavailable right now.")).toHaveCount(0);
    await expect(page.getByText("Past results could not be loaded.")).toHaveCount(0);
    await expect(boot(page)).toHaveAttribute("data-fb-boot", "ready");
  });

  test("results with the wrong shape are a degraded state, not a crash", async ({ page }) => {
    await quiet(page);
    await page.route("**/data/results.json", (r) => ok(r, '{"games":"x"}'));
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    await expect(page.getByText("Past results could not be loaded.")).toBeVisible();
    await expect(boot(page)).toHaveAttribute("data-fb-boot", "degraded");
  });

  test("a malformed slate shows a recoverable failure with Retry, and Retry loads the board", async ({ page }) => {
    await quiet(page);
    const nav = loads(page);
    await page.route("**/data/slate.json", (r) => ok(r, '{"nothing":true}'));
    await page.goto("/?league=NFL");
    const failed = page.getByRole("alert").filter({ hasText: "We couldn't load this week's games." });
    await expect(failed).toBeVisible();
    await expect(boot(page)).toHaveAttribute("data-fb-boot", "failed");
    await expect(page.getByTestId("boot-shell").getByText("Football Watchability")).toBeVisible(); // the shell stays
    await page.unroute("**/data/slate.json");
    await page.route("**/data/slate.json", (r) => ok(r, SLATE));
    await failed.getByRole("button", { name: "Retry" }).click();
    await expect(card(page)).toBeVisible();
    expect(nav.count).toBe(1);
  });

  test("an essential request that times out ends in Retry (bounded tries), and Retry recovers", async ({ page }) => {
    await quiet(page);
    await page.addInitScript(() => { (window as unknown as { __fbPolicy: unknown }).__fbPolicy = { essential: { attempts: 2, timeoutMs: 700, baseDelayMs: 50, maxDelayMs: 100 } }; });
    let hits = 0;
    await page.route("**/data/slate.json", () => { hits++; /* never answered */ });
    await page.goto("/?league=NFL");
    const failed = page.getByRole("alert").filter({ hasText: "We couldn't load this week's games." });
    await expect(failed).toBeVisible({ timeout: 10_000 });
    expect(hits).toBeLessThanOrEqual(3); // two tries (plus the page's own preload), then it stops
    await page.unroute("**/data/slate.json");
    await page.route("**/data/slate.json", (r) => ok(r, SLATE));
    await failed.getByRole("button", { name: "Retry" }).click();
    await expect(card(page)).toBeVisible();
  });

  test("a transient failure on the essential slate recovers by itself", async ({ page }) => {
    await quiet(page);
    let hits = 0;
    await page.route("**/data/slate.json", (r) => (++hits <= 2 ? r.fulfill({ status: 503, body: "busy" }) : ok(r, SLATE)));
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  });
});

test.describe("error boundaries", () => {
  test("a board render failure leaves the header and navigation working; Retry brings the board back", async ({ page }) => {
    await quiet(page);
    await page.addInitScript(() => { (window as unknown as { __fbFault: string }).__fbFault = "board"; });
    await page.goto("/?league=NFL");
    const failed = page.getByRole("alert").filter({ hasText: "The game board could not load." });
    await expect(failed).toBeVisible();
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator(".site-nav")).toBeVisible();
    // another section still opens, with the real navigation
    await page.locator('.nav-trigger[data-category="teams"]:visible').click();
    await page.locator('.site-nav [data-tab="teams"]:visible').click();
    await expect(page.locator('.feature-intro[data-feature="teams"]')).toBeVisible();
    // back to the board, fix the fault, Retry
    await page.locator('.nav-trigger[data-category="games"]:visible').click();
    await page.locator('.site-nav [data-tab="board"]:visible').click();
    await expect(failed).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __fbFault: string | null }).__fbFault = null; });
    await failed.getByRole("button", { name: "Retry" }).click();
    await expect(card(page)).toBeVisible();
  });

  test("a root render failure shows the fallback, and Try again recovers", async ({ page }) => {
    await quiet(page);
    await page.addInitScript(() => { (window as unknown as { __fbFault: string }).__fbFault = "root"; });
    await page.goto("/?league=NFL");
    const failed = page.getByRole("alert").filter({ hasText: "Something went wrong loading Football Watchability." });
    await expect(failed).toBeVisible();
    await expect(failed.getByRole("button", { name: "Reload the page" })).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __fbFault: string | null }).__fbFault = null; });
    await failed.getByRole("button", { name: "Try again" }).click();
    await expect(card(page)).toBeVisible();
  });
});

test.describe("Game Center loading", () => {
  /** Holds, fails or passes the files fetched after the board is up (the Game Center's code), without naming any hashed file. */
  async function gate(page: Page) {
    const g = { mode: "pass" as "pass" | "delay" | "abort", released: false };
    await page.route(/\/assets\/[^/]+\.js(\?.*)?$/, async (route) => {
      if (g.mode === "abort") return route.abort();
      if (g.mode === "delay") { await sleep(2_500); g.released = true; }
      return route.continue();
    });
    return g;
  }
  const dialog = (page: Page) => page.locator("dialog.gc[open]");

  test("a delayed Game Center shows an immediate loading state with a close button, then opens", async ({ page }) => {
    await quiet(page);
    const g = await gate(page);
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    g.mode = "delay";
    await card(page).click();
    await expect(page.getByText("Opening Game Center…")).toBeVisible();
    const close = dialog(page).getByRole("button", { name: "Close Game Center" });
    const box = (await close.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(dialog(page).locator(".gc-head")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Opening Game Center…")).toHaveCount(0);
  });

  test("closing while it loads closes it for good: the late arrival does not reopen it", async ({ page }) => {
    await quiet(page);
    const g = await gate(page);
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    g.mode = "delay";
    await card(page).click();
    await expect(page.getByText("Opening Game Center…")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Close Game Center" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => g.released, { timeout: 15_000 }).toBe(true);
    await expect(dialog(page)).toHaveCount(0);
    await expect(card(page)).toBeVisible();
  });

  test("Escape closes the loading state, and the Game Center opens normally afterwards", async ({ page }) => {
    await quiet(page);
    const g = await gate(page);
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    g.mode = "delay";
    await card(page).click();
    await expect(page.getByText("Opening Game Center…")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => g.released, { timeout: 15_000 }).toBe(true);
    await card(page).click();
    await expect(dialog(page).locator(".gc-head")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
  });

  test("a failed import shows Retry and Close, leaves the board alone, and Retry opens it once the network is back", async ({ page }) => {
    await quiet(page);
    const nav = loads(page);
    const g = await gate(page);
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    g.mode = "abort";
    await card(page).click();
    const failed = dialog(page).getByRole("alert").filter({ hasText: "The Game Center could not load." });
    await expect(failed).toBeVisible({ timeout: 10_000 });
    await expect(card(page)).toBeVisible(); // the board is still there behind it
    // Close works from the failure; the same game can be opened again
    await dialog(page).getByRole("button", { name: "Close Game Center" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await card(page).click();
    await expect(failed).toBeVisible({ timeout: 10_000 });
    g.mode = "pass";
    await failed.getByRole("button", { name: "Retry" }).click();
    await expect(dialog(page).locator(".gc-head")).toBeVisible({ timeout: 15_000 });
    expect(nav.count).toBe(1); // no reload at any point
  });

  test("when the site was updated, the failure says so and offers an explicit refresh (nothing refreshes by itself)", async ({ page }) => {
    await quiet(page);
    const nav = loads(page);
    const g = await gate(page);
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    // from now on the index page names a different script, as it does after a deploy
    await page.route((u) => u.pathname === "/", async (r) => {
      const res = await r.fetch();
      const html = (await res.text()).replace(/(<script[^>]+type="module"[^>]+src=")([^"]+)(")/, "$1/assets/index-updated.js$3");
      await r.fulfill({ response: res, body: html });
    });
    g.mode = "abort";
    await card(page).click();
    await expect(dialog(page).getByText("Game Center was updated. Refresh the application to load the latest version.")).toBeVisible({ timeout: 10_000 });
    await expect(dialog(page).getByRole("button", { name: "Refresh the application" })).toBeVisible();
    expect(nav.count).toBe(1);
  });

  test("a Game Center render failure shows its own fallback; the board stays; Close and Retry work", async ({ page }) => {
    await quiet(page);
    await page.addInitScript(() => { (window as unknown as { __fbFault: string }).__fbFault = "gc"; });
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    await card(page).click();
    const failed = dialog(page).getByRole("alert").filter({ hasText: "The Game Center ran into a problem." });
    await expect(failed).toBeVisible();
    await expect(card(page)).toBeVisible();
    await failed.getByRole("button", { name: "Close" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await card(page).click();
    await expect(failed).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __fbFault: string | null }).__fbFault = null; });
    await failed.getByRole("button", { name: "Retry" }).click();
    await expect(dialog(page).locator(".gc-head")).toBeVisible();
  });

  test("closing keeps the reader's place: league, status filter, scroll position and focus", async ({ page }) => {
    await quiet(page);
    await page.goto("/?league=NFL");
    await expect(card(page)).toBeVisible();
    await page.locator('[data-status-chip="upcoming"]').click();
    await expect(page.locator('[data-status-chip="upcoming"]')).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => scrollTo(0, 500));
    const before = await page.evaluate(() => scrollY);
    const target = card(page);
    await target.focus();
    await target.click();
    await expect(dialog(page).locator(".gc-head")).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByLabel("League", { exact: true })).toHaveValue("NFL");
    await expect(page.locator('[data-status-chip="upcoming"]')).toHaveAttribute("aria-pressed", "true");
    expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(12);
    await expect(target).toBeFocused();
  });
});

test.describe("real mobile journey", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("open, choose NFL, Games, a game, Game Center, close, then another section from the real sheet", async ({ page }) => {
    await quiet(page);
    await page.goto("/");
    await expect(page.locator(".site-nav")).toBeVisible(); // the usable shell
    await page.getByLabel("League", { exact: true }).selectOption({ label: "NFL" });
    await expect(page.getByLabel("League", { exact: true })).toHaveValue("NFL");
    // Games, through the bottom bar and its sheet
    await page.locator('.nav-trigger[data-category="games"]').tap();
    await page.locator('.site-nav [data-tab="board"]').tap();
    await expect(card(page)).toBeVisible();
    // a game from the board, then its Game Center
    const target = card(page);
    await target.tap();
    const dialog = page.locator("dialog.gc[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".gc-head").or(page.getByText("Opening Game Center…"))).toBeVisible();
    await expect(dialog.locator(".gc-head")).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Close Game Center" }).tap();
    await expect(dialog).toHaveCount(0);
    // the board is as it was
    await expect(page.getByLabel("League", { exact: true })).toHaveValue("NFL");
    await expect(card(page)).toBeVisible();
    // the mobile navigation sheet, to another major section
    await page.locator('.nav-trigger[data-category="rankings"]').tap();
    await page.locator('.site-nav [data-tab="standings"]').tap();
    await expect(page.locator('.feature-intro[data-feature="standings"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  });
});
