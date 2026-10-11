import { expect, test } from "@playwright/test";

test("a persistent strip of final scores sits at the very top and stays there while scrolling", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  await expect(ticker).toBeVisible();
  await expect(ticker.locator(".ticker-item").first()).toBeAttached();
  expect(await ticker.evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBe(0);
  await page.mouse.wheel(0, 2500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  expect(await ticker.evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBe(0);
  // It never makes the page wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
});

test("it scrolls, stops under the pointer or on request, and each score says where it leads", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  const track = ticker.locator(".ticker-track");
  await expect(track).toBeVisible();
  const state = () => track.evaluate((e) => getComputedStyle(e).animationPlayState);
  await page.mouse.move(0, 400); // off the strip: a pointer resting over it would hold it still
  expect(await state()).toBe("running");
  await ticker.hover();
  expect(await state()).toBe("paused");
  await page.mouse.move(0, 400);
  expect(await state()).toBe("running");
  const pause = ticker.getByRole("button", { name: "Pause" });
  await pause.click();
  await page.mouse.move(0, 400);
  expect(await state()).toBe("paused");
  await expect(ticker.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "true");
  // Real scores, each labeled for assistive tech, and the looped copy is hidden from it.
  const labels = await ticker.locator(".ticker-track > li:not([aria-hidden]) .ticker-item").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labels.length).toBeGreaterThan(0);
  for (const l of labels) expect(l).toMatch(/\d+, .* \d+, final(\/ot)?\.( FPI rank: [^.]*\.)?( Upset: .*\.)? Open the postgame summary\.$/);
  expect(await ticker.locator(".ticker-dup").count()).toBe(labels.length);
});

test("clicking a score opens its Game Center postgame summary", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  const first = ticker.locator(".ticker-track > li:not([aria-hidden]) .ticker-item").first();
  const label = (await first.getAttribute("aria-label")) ?? "";
  await ticker.hover(); // the strip holds still under the pointer, so the click lands
  await first.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/final/i);
  // The teams in the dialog are the ones that were clicked.
  const [away] = label.split(", ");
  await expect(dialog).toContainText(away.replace(/ \d+$/, ""));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("with reduced motion the strip doesn't scroll by itself", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  await expect(ticker.locator(".ticker-item").first()).toBeAttached();
  expect(await ticker.locator(".ticker-track").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await expect(ticker.locator(".ticker-dup").first()).toBeHidden();
  await expect(ticker.getByRole("button", { name: "Pause" })).toBeHidden();
});

test("every logo in the strip loads up front, including the ones still off to the right", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  await expect(ticker.locator(".ticker-item").first()).toBeAttached();
  // Lazy-loaded images that start outside the strip's window can stay blank as they scroll in; all should be loaded now.
  await expect
    .poll(() => ticker.locator("img").evaluateAll((imgs) => imgs.filter((i) => !(i as HTMLImageElement).complete || (i as HTMLImageElement).naturalWidth === 0).length), { timeout: 10_000 })
    .toBe(0);
  expect(await ticker.locator("img").evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).loading === "eager"))).toBe(true);
});

test("each team in the strip is a rank, a logo and a score: no team names", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  const items = ticker.locator(".ticker-track > li:not([aria-hidden]) .ticker-item");
  for (const league of ["NFL", "CFB"]) {
    const item = items.filter({ has: page.locator(".ticker-league", { hasText: league }) }).first();
    await expect(item.locator(".ticker-team")).toHaveCount(2);
    for (const team of await item.locator(".ticker-team").all()) {
      await expect(team.locator(".ticker-rank")).toHaveText(/^#\d+$/); // FPI rank, written as #12
      await expect(team.locator("img")).toHaveCount(1);
      await expect(team.locator("b")).toHaveText(/^\d+$/);
      // Order: the rank, then the logo, then the score. No name or abbreviation.
      const kinds = await team.locator("> *").evaluateAll((els) => els.map((e) => e.tagName.toLowerCase()));
      expect(kinds).toEqual(["small", "img", "b"]);
      expect((await team.innerText()).replace(/\s+/g, " ").trim()).toMatch(/^#\d+ \d+$/);
    }
  }
  // The names are still there for screen readers.
  const label = (await items.first().getAttribute("aria-label")) ?? "";
  expect(label).toMatch(/FPI rank: .* \d+, .* \d+/);
  expect(await ticker.locator(".ticker-rank.pr").count()).toBe(0);
});

test("the Denver Broncos are shown as the Denver Donkeys, while the team underneath is still the Broncos", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  const item = ticker.locator(".ticker-track > li:not([aria-hidden]) .ticker-item", { has: page.locator('img[src*="denver-broncos"]') }).first();
  await expect(item).toHaveAttribute("aria-label", /Denver Donkeys \d+/);
  expect((await item.getAttribute("aria-label")) ?? "").not.toMatch(/Broncos/);
  // The logo is still the one filed under the Broncos, and the abbreviation is unchanged.
  await expect(item.locator("img").first()).toHaveAttribute("src", /denver-broncos\.webp/);
  expect(await page.locator("body").innerText()).not.toMatch(/Broncos/);
});

test("an upset final, where the lower FPI-ranked team won, has a neon outline and says so", async ({ page }) => {
  await page.goto("/?league=NFL");
  const ticker = page.getByRole("region", { name: "Final scores" });
  const items = ticker.locator(".ticker-track > li:not([aria-hidden]) .ticker-item");
  await expect(items.first()).toBeAttached(); // the strip loads with the page's data
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  let upsets = 0;
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    // Read the two teams: rank (#N) and score, in order.
    const teams = await item.locator(".ticker-team").evaluateAll((els) =>
      els.map((e) => ({ rank: Number(e.querySelector(".ticker-rank")?.textContent?.replace("#", "")), score: Number(e.querySelector("b")?.textContent) })),
    );
    const [a, b] = teams;
    const winner = a.score === b.score ? -1 : a.score > b.score ? 0 : 1;
    const upset = winner >= 0 && teams[winner].rank > teams[1 - winner].rank;
    expect(await item.evaluate((e) => e.classList.contains("upset"))).toBe(upset);
    if (upset) {
      upsets++;
      await expect(item.locator(".ticker-final")).toHaveText(/^Upset final/i);
      await expect(item).toHaveAttribute("aria-label", /Upset: .* beat /);
      expect(await item.evaluate((e) => getComputedStyle(e).boxShadow)).toContain("57, 255, 136");
    } else {
      await expect(item.locator(".ticker-final")).not.toContainText(/upset/i);
    }
  }
  expect(upsets).toBeGreaterThan(0); // this week's finals include upsets, so the outline is actually exercised
});
