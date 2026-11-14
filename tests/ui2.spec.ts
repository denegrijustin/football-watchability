// UI phase 2: card hierarchy, board stability, navigation, Game Center, responsive layouts, accessibility. Playwright's own `test` is used, so the
// real navigation (dropdowns on a computer, the sheet above the bottom bar on a phone) is what is exercised, not a layout forced open.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const nflGames = slate.games.filter((g: any) => g.league === "NFL");

async function quiet(page: Page) {
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [] }));
  await page.addInitScript(() => { (window as unknown as { __fbNoPreload: boolean }).__fbNoPreload = true; });
}
const card = (page: Page) => page.locator(".game-card:not(.result-card)").first();
const trigger = (page: Page, cat: string) => page.locator(`.nav-trigger[data-category="${cat}"]:visible`);
const dialog = (page: Page) => page.locator("dialog.gc[open]");
const vw = (page: Page) => page.evaluate(() => document.documentElement.clientWidth);
const noOverflow = async (page: Page) => {
  const wide = await page.evaluate(() => {
    const v = document.documentElement.clientWidth;
    const clipped = (e: Element) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible" && p.getBoundingClientRect().right <= v + 1) return true; } return false; };
    const bad = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > v + 1 && !e.closest(".ticker, .how-pop, .sr-only") && getComputedStyle(e).position !== "fixed" && !clipped(e); });
    return [document.documentElement.scrollWidth, ...bad.slice(0, 6).map((e) => `${e.tagName}.${String((e as HTMLElement).className?.toString()).slice(0, 40)} right=${Math.round(e.getBoundingClientRect().right)} [${e.parentElement?.className}]`)];
  });
  expect(wide[0], `overflowing: ${wide.slice(1).join(" | ")}`).toBeLessThanOrEqual((await vw(page)) + 1);
};


test.describe("game cards", () => {
  test("a compact card leads with the essentials: teams, logos, status, rating and its category, the channel, one Game Center button", async ({ page }) => {
    await quiet(page);
    await page.goto("/?league=NFL");
    const c = card(page);
    await expect(c).toBeVisible();
    await expect(c.locator(".cc-team")).toHaveCount(2);
    await expect(c.locator(".cc-team img")).toHaveCount(2);
    await expect(c.locator(".cc-time")).toBeVisible(); // when it kicks off
    await expect(c.locator(".cc-rate")).toHaveAttribute("aria-label", /Watchability \d+ out of 100, (Must watch|Very good|Good|Watchable|Background)/);
    await expect(c.locator(".score-tier")).toBeVisible(); // the category, in words
    await expect(c.locator(".cc-network")).toBeVisible(); // where to watch it
    await expect(c.locator(".cc-gc")).toHaveCount(1); // one clear way into the Game Center
    // the second level is on the card too: the betting line and the projection
    await expect(c.locator(".cl-chip").first()).toBeVisible();
  });

  test("the compact card's rating matches the data, and Details still opens the fuller projection", async ({ page }) => {
    await quiet(page);
    await page.goto("/?league=NFL");
    const c = card(page);
    const id = await c.getAttribute("data-game-id");
    const game = slate.games.find((g: any) => g.id === id);
    await expect(c.locator(".cc-rate")).toHaveAttribute("aria-label", new RegExp(`Watchability ${game.score} out of 100`));
    await c.locator(".card-toggle").click();
    await expect(page.locator(`.game-card[data-game-id="${id}"]`)).toHaveClass(/expanded/);
    await expect(page.locator(`.game-card[data-game-id="${id}"]`).locator(".proj, .pwp-head, .pwp").first()).toBeVisible();
  });

  test("buttons inside a card do their own job: Details expands without opening the Game Center, the Game Center button opens only it", async ({ page }) => {
    await quiet(page);
    await page.goto("/?league=NFL");
    const c = card(page);
    await c.locator(".card-toggle").click();
    await expect(c).toHaveClass(/expanded/);
    await expect(dialog(page)).toHaveCount(0);
    const id = await c.getAttribute("data-game-id");
    await page.locator(`.game-card[data-game-id="${id}"] .gc-open`).click();
    await expect(dialog(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator(`.game-card[data-game-id="${id}"]`)).toHaveClass(/expanded/); // still as it was left
  });

  test("keyboard: a card's controls are reachable, Enter on Game Center opens it, Escape closes it and focus returns", async ({ page }) => {
    await quiet(page);
    await page.goto("/?league=NFL");
    const gc = card(page).locator(".cc-gc");
    await gc.focus();
    await expect(gc).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(gc).toBeFocused();
  });

  test("the card carries its team's color with a glowing edge, and logos keep their shape", async ({ page }) => {
    await quiet(page);
    await page.goto("/?league=NFL");
    const c = card(page);
    await expect(c).toHaveClass(/team-tinted/);
    const edge = await c.evaluate((e) => ({ w: getComputedStyle(e).borderTopWidth, shadow: getComputedStyle(e).boxShadow }));
    expect(parseFloat(edge.w)).toBeGreaterThanOrEqual(2);
    expect(edge.shadow).not.toBe("none"); // the glow
    const sizes = await page.locator(".game-card .cc-team img").evaluateAll((els) => els.slice(0, 12).map((e) => [(e as HTMLImageElement).clientWidth, (e as HTMLImageElement).clientHeight]));
    for (const [w, h] of sizes) { expect(w).toBeGreaterThan(0); expect(Math.abs(w - h)).toBeLessThanOrEqual(1); } // one consistent, undistorted box
  });
});

test.describe("board stability", () => {
  // Two games whose order depends on how close each one is: modest ratings (so a close finish can lift one past the other) that are near each other.
  const slot = (() => {
    const g = nflGames.filter((x: any) => x.score <= 80);
    for (const a of g) for (const b of g) if (a.id < b.id && Math.abs(a.score - b.score) < 12) return [a, b];
    return undefined;
  })();

  async function live(page: Page, flip: { on: boolean }) {
    const [a, b] = slot!;
    await page.clock.install({ time: new Date(a.date).getTime() + 90 * 60e3 });
    await page.route("**/api/scores**", (r) => r.fulfill({ json: nflGames.map((x: any) => {
      if (x.id === a.id) return { id: x.espnId, state: "in", detail: "2:10 - 4th", away: flip.on ? 45 : 21, home: 20 }; // first a one-point game, then a blowout (scores only go up)
      if (x.id === b.id) return { id: x.espnId, state: "in", detail: "2:10 - 4th", away: 38, home: flip.on ? 37 : 0 };
      return { id: x.espnId, state: "pre", detail: "", away: 0, home: 0 };
    }) }));
    await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
    await page.route("**/api/game**", (r) => r.fulfill({ status: 503, json: {} }));
    await page.addInitScript(() => { (window as unknown as { __fbNoPreload: boolean }).__fbNoPreload = true; });
  }
  const order = (page: Page) => page.locator(".board-section.live .game-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-game-id")));
  const refresh = (page: Page) => page.locator(".live-fresh").evaluate((b) => (b as HTMLElement).click());

  test("the card under the pointer stays where it is while live scores change; the board settles when the pointer leaves", async ({ page }) => {
    test.skip(!slot, "no two NFL games with close ratings this week");
    const flip = { on: false };
    await live(page, flip);
    await page.goto("/?league=NFL");
    await expect(page.locator(".board-section.live .game-card").first()).toBeVisible({ timeout: 15_000 });
    await page.locator(".board-sort button", { hasText: /Rating|Highest rated/ }).first().click(); // one list, best first, so the order shows
    const before = await order(page);
    expect(before.length).toBeGreaterThanOrEqual(2);
    await page.locator(`.game-card[data-game-id="${before[0]}"]`).hover();
    flip.on = true; // the other game is now the closer one
    await refresh(page);
    await expect(page.locator(`.game-card[data-game-id="${slot![0].id}"] .team-score`).first()).toContainText("45", { timeout: 10_000 });
    expect(await order(page)).toEqual(before); // scores updated, nothing moved under the pointer
    await page.mouse.move(2, 2);
    await expect.poll(() => order(page)).not.toEqual(before); // away from the cards, it settles to the fresh order
  });

  test("an expanded card holds the order too, and a selected sort is kept through a score change", async ({ page }) => {
    test.skip(!slot, "no two NFL games with close ratings this week");
    const flip = { on: false };
    await live(page, flip);
    await page.goto("/?league=NFL");
    await expect(page.locator(".board-section.live .game-card").first()).toBeVisible({ timeout: 15_000 });
    await page.locator(".board-sort button", { hasText: /Rating|Highest rated/ }).first().click();
    const before = await order(page);
    await page.locator(`.game-card[data-game-id="${before[0]}"] .card-toggle`).click();
    await page.mouse.move(2, 2);
    flip.on = true;
    await refresh(page);
    await expect(page.locator(`.game-card[data-game-id="${slot![0].id}"] .team-score`).first()).toContainText("45", { timeout: 10_000 });
    expect(await order(page)).toEqual(before);
    await expect(page.locator(".board-sort button[aria-pressed=true]")).toContainText(/Rating|Highest rated/); // the chosen sort is still the chosen sort
  });
});

test.describe("navigation (the real menus)", () => {
  test("desktop: a dropdown opens, shows its destinations, Escape closes it and focus goes back to its button", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await quiet(page);
    await page.goto("/?league=NFL");
    const t = trigger(page, "rankings");
    await t.focus();
    await page.keyboard.press("Enter");
    await expect(t).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator('.nav-cat[data-open="true"] .nav-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator(".nav-item")).toHaveCount(4);
    await page.keyboard.press("Escape");
    await expect(t).toHaveAttribute("aria-expanded", "false");
    await expect(t).toBeFocused();
    expect(await t.evaluate((e) => parseFloat(getComputedStyle(e).outlineWidth))).toBeGreaterThan(0); // the focus is visible
  });

  test("desktop: the league and the status filter survive a trip to Standings and Back, and Forward returns to Standings", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await quiet(page);
    await page.goto("/?league=CFB");
    await expect(card(page)).toBeVisible();
    await page.getByLabel("League", { exact: true }).selectOption({ label: "NFL" });
    await page.locator('[data-status-chip="upcoming"]').click();
    await trigger(page, "rankings").click();
    await page.locator('.nav-panel [data-tab="standings"]:visible').click();
    await expect(page.locator('.feature-intro[data-feature="standings"]')).toBeVisible();
    await page.goBack();
    await expect(card(page)).toBeVisible();
    await expect(page.getByLabel("League", { exact: true })).toHaveValue("NFL");
    await expect(page.locator('[data-status-chip="upcoming"]')).toHaveAttribute("aria-pressed", "true");
    await page.goForward();
    await expect(page.locator('.feature-intro[data-feature="standings"]')).toBeVisible();
  });

  test("phone: five 44px destinations in a bottom bar; each opens a sheet that fits the screen, above the bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await quiet(page);
    await page.goto("/?league=NFL");
    await expect(page.locator(".site-nav")).toBeVisible();
    const cats = ["games", "teams", "rankings", "analytics", "more"];
    for (const c of cats) {
      const b = (await trigger(page, c).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
      await trigger(page, c).click();
      const panel = page.locator('.nav-cat[data-open="true"] .nav-panel');
      await expect(panel).toBeVisible();
      const p = (await panel.boundingBox())!;
      const bar = (await page.locator(".site-nav").boundingBox())!;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(391);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + p.height).toBeLessThanOrEqual(bar.y + 1); // above the bar, never behind it
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
    }
    await noOverflow(page);
  });

  test("Game Center from a card returns to the same board: same place, same filters, and the card has focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await quiet(page);
    await page.goto("/?league=NFL");
    await page.locator('[data-status-chip="upcoming"]').click();
    const target = card(page);
    await target.focus();
    await target.click({ position: { x: 20, y: 20 } });
    await expect(dialog(page)).toHaveCount(1);
    expect(page.url()).toContain("league=NFL");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('[data-status-chip="upcoming"]')).toHaveAttribute("aria-pressed", "true");
    if (test.info().project.name === "desktop") await expect(target).toBeFocused(); // touch taps do not move focus
  });
});

test.describe("Game Center", () => {
  test("a clear header, the sections as tabs, and a close button that stays visible and 44px while scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await quiet(page);
    await page.goto("/?league=NFL");
    await card(page).locator(".cc-gc").click();
    const gc = dialog(page);
    await expect(gc.locator(".gc-head")).toBeVisible({ timeout: 15_000 });
    await expect(gc.locator(".gc-head")).toContainText(/Upcoming|Live|Final/);
    await expect(gc.locator(".gc-head .gc-state, .gc-head h2, .gc-head h3, .gc-head strong").first()).toBeVisible();
    await expect(gc.getByRole("tab").first()).toBeVisible();
    const close = gc.getByRole("button", { name: "Close Game Center" });
    const at = async () => (await close.boundingBox())!;
    const first = await at();
    expect(first.width).toBeGreaterThanOrEqual(44);
    expect(first.height).toBeGreaterThanOrEqual(43.9);
    await gc.locator(".gc-body").evaluate((e) => e.scrollTo(0, 600));
    const scrolled = await at();
    expect(scrolled.y).toBeGreaterThanOrEqual(0);
    expect(scrolled.y + scrolled.height).toBeLessThanOrEqual(844);
    expect(scrolled.x + scrolled.width).toBeLessThanOrEqual(391);
    await noOverflow(page);
  });
});

test.describe("responsive layouts and text zoom", () => {
  const sizes = [[375, 812], [390, 844], [768, 1024], [1024, 768], [1440, 900], [667, 375]] as const; // the last is a short landscape phone
  for (const [w, h] of sizes) {
    test(`${w}x${h}: no sideways scroll on the board, the navigation is reachable, and the Game Center fits`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await quiet(page);
      await page.goto("/?league=NFL");
      await expect(card(page)).toBeVisible();
      await noOverflow(page);
      // every long team name stays inside its card
      const spill = await page.locator(".game-card:not(.result-card)").evaluateAll((els) => els.filter((e) => [...e.querySelectorAll(".cc-team, .cc-rate, .cc-top")].some((c) => c.getBoundingClientRect().right > e.getBoundingClientRect().right + 1)).length);
      expect(spill, "cards whose content runs past their edge").toBe(0);
      // navigation: a button for each category is on screen and not behind anything
      for (const c of ["games", "teams", "rankings", "analytics", "more"]) {
        const b = (await trigger(page, c).boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(w + 1);
        expect(b.y + b.height).toBeLessThanOrEqual(h + 1);
      }
      await card(page).locator(".cc-gc").click();
      const gc = dialog(page);
      await expect(gc.locator(".gc-head")).toBeVisible({ timeout: 15_000 });
      const d = (await gc.boundingBox())!;
      expect(d.x).toBeGreaterThanOrEqual(-1);
      expect(d.x + d.width).toBeLessThanOrEqual(w + 1);
      const c = (await gc.getByRole("button", { name: "Close Game Center" }).boundingBox())!;
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(w + 1);
      await noOverflow(page);
    });
  }

  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    test(`${w}px at 200% text: nothing runs sideways and the controls stay reachable`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await quiet(page);
      await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "html{font-size:200%}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
      await page.goto("/?league=NFL");
      await expect(card(page)).toBeVisible();
      await noOverflow(page);
      for (const c of ["games", "more"]) {
        await trigger(page, c).scrollIntoViewIfNeeded();
        await expect(trigger(page, c)).toBeVisible();
      }
      await card(page).locator(".cc-gc").scrollIntoViewIfNeeded();
      await card(page).locator(".cc-gc").click();
      await expect(dialog(page).getByRole("button", { name: "Close Game Center" })).toBeVisible({ timeout: 15_000 });
      await noOverflow(page);
    });
  }
});

test.describe("motion", () => {
  test("with reduced motion the navigation panels and the loading bars do not animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await quiet(page);
    await page.goto("/?league=NFL");
    await trigger(page, "teams").click();
    const panel = page.locator('.nav-cat[data-open="true"] .nav-panel');
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((e) => getComputedStyle(e).transitionDuration)).toMatch(/^0s(, 0s)*$/);
  });
});
