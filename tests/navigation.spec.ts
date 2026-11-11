import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  CATS, CAT_LABELS, ITEMS, TABS, VIEW_URLS, trigger, panel, item, load, openCat, choose, seeView, current, search, type Cat,
} from "./helpers/nav";

// Every title carries "@nav" so tests/fixtures.ts leaves the real menu layout in place. The viewport is set by each test, so one project is
// enough: the mobile project would only repeat these tests under the same sizes.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "these tests set their own viewport; the desktop project runs them once");
});

const WIDTHS = [375, 430, 768, 1280, 1920];
const focused = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.outerHTML.slice(0, 160) ?? "");
const focusedIs = (page: Page, sel: string) => page.evaluate((s) => !!document.activeElement?.matches(s), sel);
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe("structure @nav", () => {
  for (const w of WIDTHS) {
    test(`at ${w}px wide there are five visible categories in order, fully inside the screen @nav`, async ({ page }) => {
      await load(page, w);
      const names = await page.locator("nav.site-nav .nav-trigger").allInnerTexts();
      expect(names.map((n) => n.trim())).toEqual(CAT_LABELS);
      expect(await page.locator("nav.site-nav > ul.nav-list > li.nav-cat").count()).toBe(5);
      expect(await page.locator(".view-row > nav.site-nav").count()).toBe(1);
      const vh = page.viewportSize()!.height;
      let prevX = -1;
      for (const c of CATS) {
        const t = trigger(page, c);
        await expect(t).toBeVisible();
        const b = (await t.boundingBox())!;
        expect(b.x, `${c} left edge`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${c} right edge`).toBeLessThanOrEqual(w);
        expect(b.y, `${c} top`).toBeGreaterThanOrEqual(0);
        expect(b.y + b.height, `${c} bottom`).toBeLessThanOrEqual(vh);
        expect(b.x, `${c} follows the previous category`).toBeGreaterThan(prevX);
        prevX = b.x;
        // The text itself must not be clipped.
        expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${c} label clipped`).toBe(true);
      }
      if (w <= 760) {
        const nav = (await page.locator("nav.site-nav").boundingBox())!;
        expect(Math.abs(nav.y + nav.height - vh), "bar sits at the bottom of the screen").toBeLessThanOrEqual(1);
        expect(await page.locator("nav.site-nav").evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
        for (const c of CATS) {
          const b = (await trigger(page, c).boundingBox())!;
          expect(b.width, `${c} width`).toBeGreaterThanOrEqual(44);
          expect(b.height, `${c} height`).toBeGreaterThanOrEqual(44);
        }
      } else {
        const nav = (await page.locator("nav.site-nav").boundingBox())!;
        expect(nav.y + nav.height).toBeLessThan(vh);
        expect(await page.locator("nav.site-nav").evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed");
      }
    });

    test(`at ${w}px wide the page never scrolls sideways and an open menu stays on screen @nav`, async ({ page }) => {
      await load(page, w);
      expect(await noSideways(page), "all menus closed").toBe(true);
      const vh = page.viewportSize()!.height;
      for (const c of CATS) {
        await openCat(page, c);
        expect(await noSideways(page), `${c} open`).toBe(true);
        const p = (await panel(page, c).boundingBox())!;
        const t = (await trigger(page, c).boundingBox())!;
        expect(p.x, `${c} panel left`).toBeGreaterThanOrEqual(0);
        expect(p.x + p.width, `${c} panel right`).toBeLessThanOrEqual(w);
        expect(p.y, `${c} panel top`).toBeGreaterThanOrEqual(0);
        if (w <= 760) expect(p.y + p.height, `${c} sheet sits above the bar`).toBeLessThanOrEqual(t.y + 1);
        else {
          expect(p.y, `${c} dropdown is below its button`).toBeGreaterThanOrEqual(t.y + t.height - 1);
          expect(p.y + p.height, `${c} dropdown ends inside the window`).toBeLessThanOrEqual(vh + 1);
        }
        await trigger(page, c).click();
        await expect(trigger(page, c)).toHaveAttribute("aria-expanded", "false");
      }
      expect(await noSideways(page), "closed again").toBe(true);
    });
  }

  test("on a phone an open menu shows a scrim and a click on it closes the menu @nav", async ({ page }) => {
    await load(page, 390, "/", 800);
    await openCat(page, "teams");
    await expect(page.locator(".nav-scrim")).toBeVisible();
    await page.locator(".nav-scrim").click({ position: { x: 20, y: 100 } });
    await expect(trigger(page, "teams")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".nav-scrim")).toHaveCount(0);
  });

  test("a phone sheet taller than a short screen scrolls inside itself and stays above the bar @nav", async ({ page }) => {
    await load(page, 375, "/", 520);
    await openCat(page, "more");
    const p = (await panel(page, "more").boundingBox())!;
    const t = (await trigger(page, "more").boundingBox())!;
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y + p.height).toBeLessThanOrEqual(t.y + 1);
    expect(await noSideways(page)).toBe(true);
  });

  test("the page has exactly one navigation landmark named Primary and no other one repeats it @nav", async ({ page }) => {
    await load(page, 1280);
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(1);
    const names = await page.evaluate(() =>
      [...document.querySelectorAll("nav, [role=navigation]")].map((n) => n.getAttribute("aria-label") ?? n.getAttribute("aria-labelledby") ?? ""),
    );
    expect(names.filter((n) => n === "Primary")).toHaveLength(1);
    expect(await page.locator("nav.site-nav").count()).toBe(1);
    // the old tab bar and the More sheet are gone
    expect(await page.locator(".view-switch, .tab-more, #more-sheet, .more-export, .export-btns").count()).toBe(0);
  });
});

test.describe("completeness @nav", () => {
  test("every one of the 12 views has exactly one entry and every category lists exactly its own entries @nav", async ({ page }) => {
    await load(page, 1280);
    for (const tab of Object.keys(TABS)) await expect(page.locator(`nav.site-nav [data-tab="${tab}"]`), tab).toHaveCount(1);
    await expect(page.locator("nav.site-nav [data-tab]")).toHaveCount(12);
    for (const c of CATS) {
      // the visible label names the entry (no separate aria-label), so the name is the label and nothing else
      expect(await panel(page, c).locator(".nav-item[aria-label]").count(), `${c} entries with an aria-label`).toBe(0);
      const its = await panel(page, c).locator(".nav-item").all();
      // (the entries are hidden here, so read the name the way the browser builds it: from the element aria-labelledby points at)
      const named = await panel(page, c).locator(".nav-item").evaluateAll((els) => els.map((e) => document.getElementById(e.getAttribute("aria-labelledby")!)?.textContent?.trim()));
      expect(named, `${c} names`).toEqual(ITEMS[c]);
      expect(its.length).toBe(ITEMS[c].length);
      const shown = await panel(page, c).locator(".nav-item-label").evaluateAll((els) => els.map((e) => e.textContent ?? ""));
      expect(shown.map((s) => s.trim()), `${c} visible labels`).toEqual(ITEMS[c]);
      // each entry is inside the panel of the category its data-tab belongs to
      for (const tab of await panel(page, c).locator("[data-tab]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tab!))) expect(TABS[tab]).toBe(c);
    }
    await expect(page.locator('nav.site-nav [data-status]')).toHaveCount(3);
    await expect(page.locator('nav.site-nav [data-action]')).toHaveCount(4);
  });

  for (const w of [1280, 390]) {
    for (const [tab, cat] of Object.entries(TABS)) {
      test(`at ${w}px wide ${cat} then ${tab} shows that destination with the right entry and category current @nav`, async ({ page }) => {
        await load(page, w, tab === "board" ? "/?view=injuries" : "/");
        await choose(page, cat, `[data-tab="${tab}"]`);
        await seeView(page, tab);
        // the menu closed and the entry is current, alone
        await expect(trigger(page, cat)).toHaveAttribute("aria-expanded", "false");
        expect(await current(page)).toEqual({ cats: [cat], items: [tab], currentValues: ["true", "page"] });
        expect(search(page).get("view")).toBe(tab === "board" ? null : tab);
      });
    }
  }

  test("every destination is reachable from the board with two clicks: the category, then the entry @nav", async ({ page }) => {
    await load(page, 1280);
    for (const [tab, cat] of Object.entries(TABS)) {
      if (tab === "board") continue;
      await page.evaluate(() => {
        (window as any).__clicks = [];
        if (!(window as any).__spy) {
          (window as any).__spy = true;
          document.addEventListener("click", (e) => (window as any).__clicks.push((e.target as HTMLElement).closest("button,a")?.className ?? "?"), true);
        }
      });
      await trigger(page, cat).click();
      await item(page, `[data-tab="${tab}"]`).click();
      const clicks = await page.evaluate(() => (window as any).__clicks as string[]);
      expect(clicks, tab).toHaveLength(2);
      expect(clicks[0]).toContain("nav-trigger");
      expect(clicks[1]).toContain("nav-item");
      await expect(item(page, `[data-tab="${tab}"]`)).toHaveAttribute("aria-current", "page");
      await choose(page, "games", '[data-tab="board"]');
    }
  });
});

test.describe("active states @nav", () => {
  test("the dashboard is current at first and nothing else is @nav", async ({ page }) => {
    await load(page, 1280);
    expect(await current(page)).toEqual({ cats: ["games"], items: ["board"], currentValues: ["true", "page"] });
    await expect(item(page, '[data-tab="board"]')).toHaveAttribute("aria-current", "page");
  });

  test("moving around leaves exactly one current category and one current entry each time @nav", async ({ page }) => {
    await load(page, 1280);
    for (const [tab, cat] of [["standings", "rankings"], ["empire", "analytics"], ["injuries", "teams"], ["grid", "games"], ["board", "games"]] as [string, Cat][]) {
      await choose(page, cat, `[data-tab="${tab}"]`);
      expect(await current(page)).toEqual({ cats: [cat], items: [tab], currentValues: ["true", "page"] });
    }
  });

  test("More is never current because none of its entries is a section @nav", async ({ page }) => {
    await load(page, 1280, "/?view=trades");
    await expect(trigger(page, "more")).not.toHaveAttribute("aria-current", /.*/);
    await expect(trigger(page, "teams")).toHaveAttribute("aria-current", "true");
  });
});

test.describe("menu behaviour @nav", () => {
  for (const w of [1280, 390]) {
    test(`at ${w}px wide opening one menu closes the other and only one is ever open @nav`, async ({ page }) => {
      await load(page, w);
      await openCat(page, "games");
      await trigger(page, "rankings").click();
      await expect(trigger(page, "games")).toHaveAttribute("aria-expanded", "false");
      await expect(trigger(page, "rankings")).toHaveAttribute("aria-expanded", "true");
      await expect(panel(page, "games")).toBeHidden();
      await expect(page.locator('.nav-trigger[aria-expanded="true"]')).toHaveCount(1);
      await trigger(page, "rankings").click();
      await expect(page.locator('.nav-trigger[aria-expanded="true"]')).toHaveCount(0);
    });

    test(`at ${w}px wide pressing outside closes the menu and selecting an entry closes it and refocuses its button @nav`, async ({ page }) => {
      await load(page, w);
      await openCat(page, "teams");
      await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
      await expect(trigger(page, "teams")).toHaveAttribute("aria-expanded", "false");
      await expect(panel(page, "teams")).toBeHidden();
      await openCat(page, "teams");
      await item(page, '[data-tab="injuries"]').click();
      await expect(trigger(page, "teams")).toHaveAttribute("aria-expanded", "false");
      await expect(panel(page, "teams")).toBeHidden();
      expect(await focusedIs(page, '.nav-trigger[data-category="teams"]'), await focused(page)).toBe(true);
    });
  }

  test("Escape closes the open menu and puts focus back on its button @nav", async ({ page }) => {
    await load(page, 1280);
    await trigger(page, "analytics").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(item(page, '[data-tab="insanity"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(page, '[data-tab="empire"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger(page, "analytics")).toHaveAttribute("aria-expanded", "false");
    await expect(trigger(page, "analytics")).toBeFocused();
    // Escape on a button whose menu was opened by a click works too
    await openCat(page, "more");
    await page.keyboard.press("Escape");
    await expect(trigger(page, "more")).toHaveAttribute("aria-expanded", "false");
    await expect(trigger(page, "more")).toBeFocused();
  });

  test("Tab walks the five buttons in order and Tab out of an open menu closes it @nav", async ({ page }) => {
    await load(page, 1280);
    await trigger(page, "games").focus();
    for (const c of CATS.slice(1)) {
      await page.keyboard.press("Tab");
      await expect(trigger(page, c), `closed menus have no tab stops, so Tab goes to ${c}`).toBeFocused();
    }
    await trigger(page, "teams").focus();
    await page.keyboard.press("Enter");
    await expect(trigger(page, "teams")).toHaveAttribute("aria-expanded", "true");
    for (const t of ["teams", "injuries", "trades"]) {
      await page.keyboard.press("Tab");
      await expect(item(page, `[data-tab="${t}"]`), `Tab reaches ${t}`).toBeFocused();
    }
    await page.keyboard.press("Tab");
    await expect(trigger(page, "rankings")).toBeFocused();
    await expect(trigger(page, "teams")).toHaveAttribute("aria-expanded", "false");
    await expect(panel(page, "teams")).toBeHidden();
  });

  test("each button states whether it is open and controls a panel that exists, and every entry has an accessible name @nav", async ({ page }) => {
    await load(page, 1280);
    for (const c of CATS) {
      const t = trigger(page, c);
      await expect(t).toHaveAttribute("aria-expanded", "false");
      await expect(t).toHaveAttribute("aria-controls", `nav-panel-${c}`);
      await expect(page.locator(`#nav-panel-${c}`)).toHaveCount(1);
      await expect(panel(page, c)).toHaveAttribute("role", "group");
      await expect(panel(page, c)).toHaveAttribute("aria-label", `${CAT_LABELS[CATS.indexOf(c)]} menu`);
      await t.click();
      await expect(t).toHaveAttribute("aria-expanded", "true");
      await expect(panel(page, c)).toBeVisible();
      for (const it of await panel(page, c).locator(".nav-item").all()) {
        await expect(it).toHaveAccessibleName(/\S/);
        const d = await it.getAttribute("aria-describedby");
        expect(d, "description id").toBeTruthy();
        for (const id of d!.split(/\s+/)) await expect(page.locator(`#${id}`)).toHaveCount(1);
      }
      await t.click();
      await expect(t).toHaveAttribute("aria-expanded", "false");
    }
    expect(await page.getByRole("button", { name: "Live Games", includeHidden: true }).count()).toBe(1);
  });

  test("hovering a button does not open its menu, a click does @nav", async ({ page }) => {
    await load(page, 1280);
    await trigger(page, "games").hover();
    await page.waitForTimeout(300);
    await expect(trigger(page, "games")).toHaveAttribute("aria-expanded", "false");
    await expect(panel(page, "games")).toBeHidden();
    await trigger(page, "games").click();
    await expect(panel(page, "games")).toBeVisible();
  });

  test("a closed menu is out of the tab order and the accessibility tree but stays in the page @nav", async ({ page }) => {
    await load(page, 1280);
    await expect(panel(page, "analytics")).toBeHidden();
    await expect(panel(page, "analytics").locator(".nav-item")).toHaveCount(3);
    expect(await panel(page, "analytics").evaluate((el) => getComputedStyle(el).visibility)).toBe("hidden");
    await expect(page.getByRole("button", { name: "Insanity" })).toHaveCount(0);
  });
});

test.describe("keyboard @nav", () => {
  // (Regression guard: onTrigger() once called focus() before React had made the hidden panel visible, so focus stayed on the button.)
  test("ArrowDown on a closed button opens the menu and focuses the first entry, ArrowUp the last @nav", async ({ page }) => {
    await load(page, 1280);
    for (const c of CATS) {
      const all = panel(page, c).locator(".nav-item");
      await trigger(page, c).focus();
      await page.keyboard.press("ArrowDown");
      await expect(trigger(page, c)).toHaveAttribute("aria-expanded", "true");
      await expect(all.first(), `${c} first`).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger(page, c)).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(trigger(page, c)).toHaveAttribute("aria-expanded", "true");
      await expect(all.last(), `${c} last`).toBeFocused();
      await page.keyboard.press("Escape");
    }
  });

  test("with a menu already open, ArrowDown or ArrowUp from its button reaches the first or last entry @nav", async ({ page }) => {
    await load(page, 1280);
    for (const c of CATS) {
      const all = panel(page, c).locator(".nav-item");
      await openCat(page, c);
      await trigger(page, c).focus();
      await page.keyboard.press("ArrowDown");
      await expect(all.first(), `${c} first`).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger(page, c)).toBeFocused();
      await expect(trigger(page, c)).toHaveAttribute("aria-expanded", "false");
      await openCat(page, c);
      await trigger(page, c).focus();
      await page.keyboard.press("ArrowUp");
      await expect(all.last(), `${c} last`).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger(page, c)).toBeFocused();
    }
  });

  test("Arrow keys, Home and End move among the entries and wrap around @nav", async ({ page }) => {
    await load(page, 1280);
    const all = panel(page, "rankings").locator(".nav-item");
    await trigger(page, "rankings").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(all.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(all.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(all.nth(3)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(all.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(all.nth(3)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(all.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(all.nth(3)).toBeFocused();
    await expect(trigger(page, "rankings")).toHaveAttribute("aria-expanded", "true");
  });

  test("Left, Right, Home and End move among the five buttons and an open menu moves with them @nav", async ({ page }) => {
    await load(page, 1280);
    await trigger(page, "games").focus();
    await page.keyboard.press("ArrowRight");
    await expect(trigger(page, "teams")).toBeFocused();
    await page.keyboard.press("End");
    await expect(trigger(page, "more")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(trigger(page, "games")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(trigger(page, "more")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(trigger(page, "games")).toBeFocused();
    await expect(page.locator('.nav-trigger[aria-expanded="true"]')).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(trigger(page, "games")).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowRight");
    await expect(trigger(page, "teams")).toBeFocused();
    await expect(trigger(page, "teams")).toHaveAttribute("aria-expanded", "true");
    await expect(trigger(page, "games")).toHaveAttribute("aria-expanded", "false");
  });

  test("Enter and Space open a menu from its button and activate an entry @nav", async ({ page }) => {
    await load(page, 1280);
    await trigger(page, "analytics").focus();
    await page.keyboard.press("Enter");
    await expect(panel(page, "analytics")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(panel(page, "analytics")).toBeHidden();
    await page.keyboard.press("Space");
    await expect(panel(page, "analytics")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(item(page, '[data-tab="insanity"]')).toBeFocused();
    await page.keyboard.press("Space");
    await seeView(page, "insanity");
    await expect(item(page, '[data-tab="insanity"]')).toHaveAttribute("aria-current", "page");
    await expect(trigger(page, "analytics")).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.press("End");
    await expect(item(page, '[data-tab="picks"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await seeView(page, "picks");
    expect(search(page).get("view")).toBe("picks");
  });
});

test.describe("history and deep links @nav", () => {
  test("Back and Forward restore the section and the status filter that each step showed @nav", async ({ page }) => {
    await load(page, 1280);
    await choose(page, "teams", '[data-tab="injuries"]');
    await seeView(page, "injuries");
    await choose(page, "rankings", '[data-tab="standings"]');
    await seeView(page, "standings");
    await choose(page, "games", '[data-status="live"]');
    await seeView(page, "board");
    expect(search(page).get("status")).toBe("live");
    await choose(page, "games", '[data-tab="grid"]');
    await seeView(page, "grid");
    const at = async (view: string | null, status: string | null, tab: string) => {
      await expect.poll(() => [search(page).get("view"), search(page).get("status")]).toEqual([view, status]);
      await seeView(page, tab);
    };
    await page.goBack();
    await at(null, "live", "board");
    await expect(item(page, '[data-status="live"]')).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await at("standings", null, "standings");
    await expect(item(page, '[data-tab="standings"]')).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await at("injuries", null, "injuries");
    await expect(trigger(page, "teams")).toHaveAttribute("aria-current", "true");
    await page.goBack();
    await at(null, null, "board");
    await expect(item(page, '[data-tab="board"]')).toHaveAttribute("aria-current", "page");
    await page.goForward();
    await at("injuries", null, "injuries");
    await page.goForward();
    await page.goForward();
    await at(null, "live", "board");
    await page.goForward();
    await at("grid", null, "grid");
  });

  for (const status of ["live", "upcoming", "final"]) {
    test(`Games then the ${status} entry then Back restores the unfiltered board @nav`, async ({ page }) => {
      await load(page, 1280);
      await choose(page, "games", `[data-status="${status}"]`);
      await expect.poll(() => search(page).get("status")).toBe(status);
      await page.goBack();
      await expect.poll(() => search(page).get("status")).toBeNull();
      await expect(item(page, '[data-tab="board"]')).toHaveAttribute("aria-current", "page");
      await expect(item(page, `[data-status="${status}"]`)).not.toHaveAttribute("aria-current", /.*/);
    });
  }

  for (const [view, { entry, cat }] of Object.entries(VIEW_URLS)) {
    test(`loading /?view=${view} opens that section and lights its entry without errors @nav`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await load(page, 1280, `/?view=${view}`);
      await seeView(page, view);
      expect(await current(page)).toEqual({ cats: [cat], items: [entry], currentValues: ["true", "page"] });
      if (view === "sim") await expect(page.locator("#games .view-in h2", { hasText: "Game simulator" })).toBeVisible();
      if (view === "upset") await expect(page.locator("#games .view-in h2", { hasText: "Upset Alert Meter" })).toBeVisible();
      if (view === "outlook") await expect(page.locator("#games .view-in .sh")).toContainText(/playoff/i);
      if (view === "picks") await expect(page.locator("#games .view-in")).toContainText(/picks|parlays|simulator|upset alert/i); // the hub's own wording; this week's headings come and go with the data
      if (view === "trades") await expect(page.locator("#games .view-in h2", { hasText: "Trade finder" })).toBeVisible();
      if (view === "resumes") await expect(page.locator("#games .view-in h2", { hasText: "Team resumés" })).toBeVisible();
      expect(search(page).get("view")).toBe(view === "board" ? null : view);
      expect(errors).toEqual([]);
    });
  }

  test("an unknown view opens the board and the address is cleaned, keeping other parameters @nav", async ({ page }) => {
    await load(page, 1280, "/?view=bogus&league=NFL");
    await seeView(page, "board");
    expect(await current(page)).toEqual({ cats: ["games"], items: ["board"], currentValues: ["true", "page"] });
    await expect.poll(() => page.url()).not.toContain("view=bogus");
    expect(search(page).get("league")).toBe("NFL");
    await load(page, 1280, "/?view=bogus");
    await expect.poll(() => page.url()).not.toContain("view=");
    await expect.poll(() => page.url()).not.toContain("bogus");
  });

  test("an unknown status is ignored and cleaned from the address @nav", async ({ page }) => {
    await load(page, 1280, "/?status=zzz");
    await expect.poll(() => page.url()).not.toContain("status=");
    await expect(item(page, '[data-tab="board"]')).toHaveAttribute("aria-current", "page");
  });

  for (const league of ["NFL", "CFB"]) {
    test(`?league=${league} still selects the league together with a view @nav`, async ({ page }) => {
      await load(page, 1280, `/?league=${league}&view=standings`);
      await seeView(page, "standings");
      expect(search(page).get("league")).toBe(league);
      expect(search(page).get("view")).toBe("standings");
      expect(await current(page)).toEqual({ cats: ["rankings"], items: ["standings"], currentValues: ["true", "page"] });
      // the board's league filter follows the address
      await choose(page, "games", '[data-tab="board"]');
      await seeView(page, "board");
      expect(search(page).get("league")).toBe(league);
      await expect(page.locator('.filter-bar select[aria-label="League"]')).toHaveValue(league);
    });
  }

  test("?status=final marks Completed Games current and the chip is pressed @nav", async ({ page }) => {
    await load(page, 1280, "/?status=final");
    await expect(item(page, '[data-status="final"]')).toHaveAttribute("aria-current", "page");
    await expect(item(page, '[data-tab="board"]')).not.toHaveAttribute("aria-current", /.*/);
    await expect(page.locator('.status-chip[data-short="final"]')).toHaveAttribute("aria-pressed", "true");
    expect(await current(page)).toEqual({ cats: ["games"], items: ["final"], currentValues: ["true", "page"] });
  });

  test("other parameters survive navigation and the first load adds no history entry @nav", async ({ page }) => {
    await load(page, 1280, "/?league=NFL&utm=keep&view=grid");
    const before = await page.evaluate(() => history.length);
    await choose(page, "teams", '[data-tab="teams"]');
    await seeView(page, "teams");
    expect(search(page).get("utm")).toBe("keep");
    expect(search(page).get("league")).toBe("NFL");
    await choose(page, "games", '[data-status="upcoming"]');
    expect(search(page).get("utm")).toBe("keep");
    expect(search(page).get("league")).toBe("NFL");
    expect(search(page).get("status")).toBe("upcoming");
    expect(search(page).get("view")).toBeNull();
    expect(await page.evaluate(() => history.length)).toBe(before + 2);
  });

  test("a board filter changed with the board's own chip rewrites the address without a new history entry @nav", async ({ page }) => {
    await load(page, 1280);
    const before = await page.evaluate(() => history.length);
    await page.locator('.status-chip[data-short="final"]').click();
    await expect.poll(() => search(page).get("status")).toBe("final");
    expect(await page.evaluate(() => history.length)).toBe(before);
    await expect(item(page, '[data-status="final"]')).toHaveAttribute("aria-current", "page");
  });

  test("a reload stays on the current section @nav", async ({ page }) => {
    await load(page, 1280);
    await choose(page, "rankings", '[data-tab="resumes"]');
    await seeView(page, "resumes");
    await page.reload();
    await seeView(page, "resumes");
    expect(await current(page)).toEqual({ cats: ["rankings"], items: ["resumes"], currentValues: ["true", "page"] });
    await choose(page, "games", '[data-status="upcoming"]');
    await page.reload();
    await expect(item(page, '[data-status="upcoming"]')).toHaveAttribute("aria-current", "page");
  });

  test("the fbwatch:open-view event switches views and ignores values that are not views @nav", async ({ page }) => {
    await load(page, 1280);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: "injuries" })));
    await seeView(page, "injuries");
    expect(search(page).get("view")).toBe("injuries");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: "sim" })));
    await seeView(page, "sim");
    expect(await current(page)).toEqual({ cats: ["analytics"], items: ["picks"], currentValues: ["true", "page"] });
    for (const detail of ["bogus", "", null, undefined, 42, { a: 1 }, ["board"], "__proto__", "constructor"]) {
      await page.evaluate((d) => window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: d })), detail as never);
    }
    await page.evaluate(() => window.dispatchEvent(new Event("fbwatch:open-view")));
    await page.waitForTimeout(200);
    expect(search(page).get("view")).toBe("sim");
    await seeView(page, "sim");
    expect(errors).toEqual([]);
  });
});

test.describe("Games entries @nav", () => {
  for (const status of ["live", "upcoming", "final"]) {
    test(`Games then ${status} sets the board status filter and choosing it again clears it @nav`, async ({ page }) => {
      await load(page, 1280, "/?view=trades");
      await choose(page, "games", `[data-status="${status}"]`);
      await seeView(page, "board");
      expect(search(page).get("view")).toBeNull();
      expect(search(page).get("status")).toBe(status);
      await expect(page.locator(`.status-chip[data-short="${status === "upcoming" ? "soon" : status}"]`)).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".status-chip[aria-pressed=true]")).toHaveCount(1);
      await expect(item(page, `[data-status="${status}"]`)).toHaveAttribute("aria-current", "page");
      await expect(item(page, '[data-tab="board"]')).not.toHaveAttribute("aria-current", /.*/);
      // the board's own Status control shows it too
      await expect(page.locator('.filter-bar select[aria-label="Status"]')).toHaveValue(status);
      // every game card still shown matches (or the board is empty): none contradicts the filter
      await choose(page, "games", `[data-status="${status}"]`);
      expect(search(page).get("status")).toBeNull();
      await expect(page.locator(".status-chip[aria-pressed=true]")).toHaveCount(0);
    });
  }

  test("Watchability Dashboard on a filtered board clears the filter @nav", async ({ page }) => {
    await load(page, 1280, "/?status=live&league=NFL");
    await choose(page, "games", '[data-tab="board"]');
    expect(search(page).get("status")).toBeNull();
    expect(search(page).get("league")).toBe("NFL");
    await expect(page.locator(".status-chip[aria-pressed=true]")).toHaveCount(0);
    await expect(item(page, '[data-tab="board"]')).toHaveAttribute("aria-current", "page");
    await expect(item(page, '[data-status="live"]')).not.toHaveAttribute("aria-current", /.*/);
  });

  test("a status entry shows how many games it holds and the numbers match the board's chips @nav", async ({ page }) => {
    await load(page, 1280);
    for (const [s, chip] of [["live", "live"], ["upcoming", "soon"], ["final", "final"]]) {
      const n = (await item(page, `[data-status="${s}"] .nav-count`).textContent())!.trim();
      const c = (await page.locator(`.status-chip[data-short="${chip}"] b`).textContent())!.trim();
      expect(n).toBe(c);
    }
  });

  test("Games then Game Center opens the Game Center for a game, or says there is none @nav", async ({ page }) => {
    await load(page, 1280);
    await openCat(page, "games");
    await item(page, '[data-action="game-center"]').click();
    const dialog = page.locator("dialog.gc[open]");
    const hint = page.locator(".nav-hint").filter({ hasText: /\S/ });
    await expect(dialog.or(hint).first()).toBeVisible({ timeout: 8000 });
    if (await dialog.count()) {
      await expect(dialog).toBeVisible();
      await expect(trigger(page, "games")).toHaveAttribute("aria-expanded", "false");
      expect(search(page).get("view")).toBeNull();
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog.gc[open]")).toHaveCount(0);
    } else {
      await expect(hint).toHaveAttribute("role", "status");
      await expect(trigger(page, "games")).toHaveAttribute("aria-expanded", "true");
      await expect(hint).toContainText(/No game/);
    }
  });

  test("Game Center from another section returns to the dashboard first @nav", async ({ page }) => {
    await load(page, 1280, "/?view=injuries");
    await openCat(page, "games");
    await item(page, '[data-action="game-center"]').click();
    const dialog = page.locator("dialog.gc[open]");
    const hint = page.locator(".nav-hint").filter({ hasText: /\S/ });
    await expect(dialog.or(hint).first()).toBeVisible({ timeout: 8000 });
    if (await dialog.count()) {
      expect(search(page).get("view")).toBeNull();
      await seeView(page, "board");
    } else test.skip(true, "this week's board has no game, so Game Center only shows the hint");
  });
});

test.describe("More entries @nav", () => {
  test("the CSV and calendar entries are download links with real addresses and do not change the section @nav", async ({ page }) => {
    await load(page, 1280);
    const csv = item(page, "[href$='.csv']");
    const ics = item(page, "[href$='.ics']");
    await expect(csv).toHaveJSProperty("tagName", "A");
    await expect(ics).toHaveJSProperty("tagName", "A");
    await expect(csv).toHaveAttribute("href", /\.csv$/);
    await expect(ics).toHaveAttribute("href", /\.ics$/);
    await expect(csv).toHaveAttribute("download", /\.csv$/);
    await expect(ics).toHaveAttribute("download", /\.ics$/);
    expect(await csv.evaluate((a) => (a as HTMLAnchorElement).origin)).toBe(new URL(page.url()).origin);
    expect(await csv.getAttribute("target")).toBeNull();
    // a click starts a download or the file answers; the page stays where it is either way
    await openCat(page, "more");
    const res = await page.request.get((await csv.getAttribute("href"))!);
    expect(res.status()).toBeLessThan(500);
    const dl = page.waitForEvent("download", { timeout: 4000 }).catch(() => null);
    await csv.click();
    const d = await dl;
    if (d) expect(d.suggestedFilename()).toMatch(/\.csv$/);
    expect(search(page).get("view")).toBeNull();
    await expect(trigger(page, "more")).toHaveAttribute("aria-expanded", "false");
  });

  test("ESPN and nflverse are links that open in a new tab with rel noopener @nav", async ({ page }) => {
    await load(page, 1280);
    for (const [label, host] of [["ESPN", "espn.com"], ["nflverse", "nflverse"]]) {
      const a = item(page, `[href*='${host}']`);
      await expect(a).toHaveJSProperty("tagName", "A");
      await expect(a).toHaveAttribute("target", "_blank");
      await expect(a).toHaveAttribute("rel", /noopener/);
      await expect(a).toHaveAttribute("href", new RegExp(`^https://[^/]*${host}`));
      expect(await a.getAttribute("data-tab")).toBeNull();
    }
  });

  test("Change Time Zone moves focus to the time zone select @nav", async ({ page }) => {
    await load(page, 1280);
    await openCat(page, "more");
    await item(page, '[data-action="time-zone"]').click();
    await expect(page.locator(".tz-pick select")).toBeFocused();
    await expect(trigger(page, "more")).toHaveAttribute("aria-expanded", "false");
  });

  test("How to Read a Card opens the card guide and focuses its summary @nav", async ({ page }) => {
    await load(page, 1280);
    await openCat(page, "more");
    await item(page, '[data-action="how-to"]').click();
    await expect(page.locator("details#how-to-read")).toHaveJSProperty("open", true);
    await expect(page.locator("details#how-to-read .how-pop")).toBeVisible();
    await expect(page.locator("details#how-to-read summary")).toBeFocused();
  });

  test("About & Methodology opens the footer details and focuses its summary @nav", async ({ page }) => {
    await load(page, 1280);
    await openCat(page, "more");
    await item(page, '[data-action="about"]').click();
    await expect(page.locator("details#about-slate")).toHaveJSProperty("open", true);
    await expect(page.locator("details#about-slate > summary")).toBeVisible();
    await expect(page.locator("details#about-slate > summary")).toBeFocused();
    expect(search(page).get("view")).toBeNull();
  });

  test("on a phone the Time zone and About entries bring their controls into view above the bar @nav", async ({ page }) => {
    await load(page, 390, "/", 800);
    await openCat(page, "more");
    await item(page, '[data-action="about"]').click();
    await expect(page.locator("details#about-slate > summary").first()).toBeFocused();
    await expect(page.locator("details#about-slate > summary").first()).toBeInViewport();
    expect(await noSideways(page)).toBe(true);
  });
});

test.describe("motion and focus @nav", () => {
  test("with reduced motion the menus and carets have no transition @nav", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await load(page, 1280);
    await openCat(page, "games");
    for (const sel of ["#nav-panel-games", ".nav-trigger[data-category=games] .nav-caret", ".nav-trigger[data-category=games]", "#nav-panel-games .nav-item >> nth=0"]) {
      const s = await page.locator(sel).evaluate((el) => {
        const c = getComputedStyle(el);
        return { property: c.transitionProperty, duration: c.transitionDuration, anims: el.getAnimations().length };
      });
      expect(s.property === "none" || s.duration.split(",").every((d) => parseFloat(d) === 0), `${sel} ${JSON.stringify(s)}`).toBe(true);
      expect(s.anims, sel).toBe(0);
    }
  });

  test("with the site's own motion switch off the menus have no transition @nav", async ({ page }) => {
    await load(page, 1280);
    await page.evaluate(() => (document.documentElement.dataset.motion = "off"));
    for (const sel of ["#nav-panel-games", ".nav-trigger[data-category=games] .nav-caret", ".nav-trigger[data-category=games]", "#nav-panel-games .nav-item >> nth=0"]) {
      const d = await page.locator(sel).evaluate((el) => getComputedStyle(el).transitionProperty);
      expect(d, sel).toBe("none");
    }
  });

  test("without reduced motion the menu does keep its short fade so the test above means something @nav", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await load(page, 1280);
    const d = await page.locator("#nav-panel-games").evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(d.split(",").some((x) => parseFloat(x) > 0)).toBe(true);
  });

  test("a button and an entry reached by keyboard show a visible focus indicator @nav", async ({ page }) => {
    await load(page, 1280);
    await page.keyboard.press("Shift");
    const visible = (sel: string) =>
      page.locator(sel).evaluate((el) => {
        const c = getComputedStyle(el);
        return { outline: c.outlineStyle, width: parseFloat(c.outlineWidth), shadow: c.boxShadow, focusVisible: el.matches(":focus-visible") };
      });
    await trigger(page, "games").focus();
    const t = await visible('.nav-trigger[data-category="games"]');
    expect(t.focusVisible).toBe(true);
    expect((t.outline !== "none" && t.width > 0) || t.shadow !== "none", JSON.stringify(t)).toBe(true);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(item(page, '[data-tab="board"]')).toBeFocused();
    const i = await visible('#nav-panel-games .nav-item[data-tab="board"]');
    expect(i.focusVisible).toBe(true);
    expect((i.outline !== "none" && i.width > 0) || i.shadow !== "none", JSON.stringify(i)).toBe(true);
  });
});

test.describe("review fixes @nav", () => {
  for (const [w, h] of [[812, 375], [844, 390], [1024, 600], [1280, 720], [1366, 768]]) {
    test(`at ${w}x${h} the last entry of every menu can be scrolled to and the panel ends inside the window @nav`, async ({ page }) => {
      await load(page, w, "/", h);
      for (const c of CATS) {
        await openCat(page, c);
        const r = await page.evaluate((cat) => {
          const pn = document.getElementById(`nav-panel-${cat}`)!;
          const items = pn.querySelectorAll<HTMLElement>(".nav-item");
          const p = pn.getBoundingClientRect();
          items[items.length - 1].scrollIntoView({ block: "nearest" });
          const l = items[items.length - 1].getBoundingClientRect();
          return { panelTop: p.top, panelBottom: p.bottom, lastTop: l.top, lastBottom: l.bottom, vh: innerHeight };
        }, c);
        expect(r.panelBottom, `${c} panel bottom`).toBeLessThanOrEqual(r.vh);
        expect(r.panelTop, `${c} panel top`).toBeGreaterThanOrEqual(0);
        expect(r.lastBottom, `${c} last entry bottom`).toBeLessThanOrEqual(r.vh);
        expect(r.lastTop, `${c} last entry top`).toBeGreaterThanOrEqual(0);
        await trigger(page, c).click();
      }
    });
  }

  for (const w of [761, 900, 1024, 1280, 1920]) {
    test(`at ${w}px every menu is inside the window and attached to its button @nav`, async ({ page }) => {
      await load(page, w);
      for (const c of CATS) {
        await openCat(page, c);
        const p = (await panel(page, c).boundingBox())!;
        const t = (await trigger(page, c).boundingBox())!;
        expect(p.x, `${c} left`).toBeGreaterThanOrEqual(0);
        expect(p.x + p.width, `${c} right`).toBeLessThanOrEqual(w);
        expect(t.x + t.width / 2, `${c} button centre is within the panel's width`).toBeGreaterThanOrEqual(p.x);
        expect(t.x + t.width / 2, `${c} button centre is within the panel's width`).toBeLessThanOrEqual(p.x + p.width);
        if (w > 900) expect(Math.abs(p.x - t.x), `${c} hangs from its button's left edge`).toBeLessThanOrEqual(2);
        await trigger(page, c).click();
      }
    });
  }

  test("closing the Game Center that the menu opened returns focus to the Games button @nav", async ({ page }) => {
    await load(page, 1280);
    await openCat(page, "games");
    await item(page, '[data-action="game-center"]').click();
    const dialog = page.locator("dialog.gc[open]");
    const hint = page.locator(".nav-hint").filter({ hasText: /\S/ });
    await expect(dialog.or(hint.filter({ hasText: /\S/ })).first()).toBeVisible({ timeout: 8000 });
    if (await dialog.count()) {
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog.gc[open]")).toHaveCount(0);
      await expect(trigger(page, "games")).toBeFocused();
    } else {
      // no game: the menu stays open, the hint is in the live region and focus stays on the entry
      await expect(item(page, '[data-action="game-center"]')).toBeFocused();
      await expect(hint).toHaveAttribute("role", "status");
    }
  });

  test("the hint region and the announcement region are in the page before anything is said @nav", async ({ page }) => {
    await load(page, 1280);
    await expect(page.locator(".nav-hint[role=status]")).toHaveCount(1);
    await expect(page.locator(".nav-hint")).toHaveText("");
    const live = page.locator("nav.site-nav [aria-live=polite]");
    await expect(live).toHaveCount(1);
    await expect(live).toHaveText("");
    expect(await live.evaluate((el) => el.classList.contains("sr-only"))).toBe(true);
  });

  test("the title and a polite announcement follow the section, and focus stays on the button @nav", async ({ page }) => {
    await load(page, 1280);
    const base = await page.title();
    expect(base).toBe("Football Watchability | The weekly board");
    await choose(page, "teams", '[data-tab="injuries"]');
    await expect(page).toHaveTitle("Injuries | Football Watchability");
    await expect(page.locator("nav.site-nav [aria-live=polite]")).toHaveText("Injuries");
    await expect(trigger(page, "teams")).toBeFocused();
    await choose(page, "games", '[data-status="live"]');
    await expect(page).toHaveTitle("Live Games | Football Watchability");
    await choose(page, "games", '[data-tab="board"]');
    await expect(page).toHaveTitle(base);
    await page.goto("/?view=trades");
    await expect(page).toHaveTitle("Trade Finder | Football Watchability");
    await expect(page.locator("nav.site-nav [aria-live=polite]")).toHaveText("");
  });

  test("the entries are named by their visible label, groups are not landmarks and the panels have their own names @nav", async ({ page }) => {
    await load(page, 1280);
    expect(await page.locator("nav.site-nav section").count()).toBe(0);
    await expect(page.locator("#nav-panel-more [role=group][aria-labelledby]")).toHaveCount(3);
    await openCat(page, "games");
    const live = item(page, '[data-status="live"]');
    await expect(live).toHaveAccessibleName("Live Games");
    const n = (await live.locator(".nav-count").textContent())!.trim();
    await expect(live).toHaveAccessibleDescription(new RegExp(`In progress now ${n}$`));
    await expect(page.getByRole("group", { name: "Games menu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Games", exact: true })).toHaveCount(1);
  });

  test("the viewport allows the page under the notch and the phone bar has a mostly solid background @nav", async ({ page }) => {
    await load(page, 390, "/", 800);
    expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toContain("viewport-fit=cover");
    const a = await page.locator("nav.site-nav").evaluate((el) => getComputedStyle(el).backgroundColor);
    const alpha = a.startsWith("rgba") ? parseFloat(a.split(",")[3]) : a.includes("/") ? parseFloat(a.split("/")[1]) : 1;
    expect(alpha).toBeGreaterThanOrEqual(0.97);
  });

  test("on a phone the sheet sits flush above the bar, scrolls on its own and does not lock the page @nav", async ({ page }) => {
    await load(page, 375, "/", 812);
    await openCat(page, "more");
    const bar = (await page.locator("nav.site-nav").boundingBox())!;
    await expect.poll(async () => bar.y - (await panel(page, "more").boundingBox())!.y - (await panel(page, "more").boundingBox())!.height).toBeGreaterThanOrEqual(6);
    await expect.poll(() => panel(page, "more").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    expect(await panel(page, "more").evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe("contain");
    expect(await page.locator(".nav-scrim").evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe("contain");
    const lock = await page.evaluate(() => [document.documentElement, document.body].map((e) => getComputedStyle(e).overflowY));
    expect(lock).not.toContain("hidden");
    const y = await page.evaluate(() => (window.scrollBy(0, 300), scrollY));
    expect(y).toBeGreaterThan(0);
  });

  test("on a phone the expanded button has a fill that the current one does not, in the light theme too @nav", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await load(page, 390, "/", 800);
    const bg = (c: Cat) => trigger(page, c).evaluate((el) => getComputedStyle(el).backgroundColor);
    const closed = await bg("teams");
    await openCat(page, "teams");
    await expect.poll(() => bg("teams")).not.toBe(closed);
    expect(await bg("teams")).not.toBe("rgba(0, 0, 0, 0)");
    // the current category (Games) keeps its top bar and gets no fill
    expect(await bg("games")).toBe(closed);
    expect(await trigger(page, "games").evaluate((el) => getComputedStyle(el, "::after").height)).toBe("3px");
  });

  test("on a phone the page keeps scroll room above the bar and tabbing never leaves a focused element under it @nav", async ({ page }) => {
    await load(page, 375, "/", 812);
    expect(parseFloat(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom))).toBeGreaterThanOrEqual(84);
    const barTop = (await page.locator("nav.site-nav").boundingBox())!.y;
    await page.locator("#games").focus();
    for (let i = 0; i < 70; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement;
        if (!e || e === document.body || e.closest("nav.site-nav")) return null;
        const b = e.getBoundingClientRect();
        return { bottom: b.bottom, top: b.top, h: b.height, tag: e.outerHTML.slice(0, 80) };
      });
      if (r && r.h > 0 && r.top < barTop) expect(r.bottom, `tab ${i}: ${r.tag}`).toBeLessThanOrEqual(barTop + 1);
    }
  });

  test("on a phone More then How to Read a Card shows the card guide above the bar @nav", async ({ page }) => {
    await load(page, 375, "/", 812);
    await openCat(page, "more");
    await item(page, '[data-action="how-to"]').click();
    const pop = page.locator("details#how-to-read .how-pop");
    await expect(pop).toBeVisible();
    await expect(pop).toBeInViewport();
    await expect(page.locator("details#how-to-read summary")).toBeFocused();
    const barTop = (await page.locator("nav.site-nav").boundingBox())!.y;
    await expect.poll(async () => (await pop.boundingBox())!.y).toBeLessThan(barTop - 40);
  });
});
