import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
// Slate cards (not archived result cards, which also carry .game-card). The board lists every
// slate game whatever its status, so these counts hold at any time of day.
const CARD = ".game-card:not(.result-card)";
// Filters are pop-down menus: choose an option by its label.
const pick = (page: import("@playwright/test").Page, menu: string, option: string) =>
  page.getByLabel(menu, { exact: true }).selectOption({ label: option });
const league = (page: import("@playwright/test").Page, l: "NFL" | "CFB") => pick(page, "League", l === "CFB" ? "College" : "NFL");
// The old Final tab is now the Completed status on the main board.
const completed = (page: import("@playwright/test").Page) => pick(page, "Status", "Completed");
const searchBox = (page: import("@playwright/test").Page) => page.getByLabel("Search teams, channels or locations");
// Cards open as a compact strip (logos, scores, rating); these open them to the full card.
const expand = async (card: import("@playwright/test").Locator) => {
  const t = card.locator('.card-toggle[aria-expanded="false"]');
  if (await t.count()) await t.click();
};
const expandAll = async (page: import("@playwright/test").Page) => {
  const closed = page.locator('.game-card:visible .card-toggle[aria-expanded="false"]');
  while (await closed.count()) await closed.first().click();
};
test("@smoke all games, conferences, history and logos remain available", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/?league=NFL");
  await expect(page.locator(CARD)).toHaveCount(
    slate.games.filter((g: any) => g.league === "NFL").length,
  );
  await expect(page.locator(".game-details details[open]")).toHaveCount(0);
  await league(page, "CFB");
  await expect(page.locator(CARD)).toHaveCount(
    slate.games.filter((g: any) => g.league === "CFB").length,
  );
  for (const conf of slate.conferences) {
    await pick(page, "Conference", conf.id === "all-fbs" ? "All conferences" : conf.label);
    await expect(page.locator(CARD)).toHaveCount(
      slate.games.filter(
        (g: any) =>
          g.league === "CFB" &&
          (conf.id === "all-fbs" || g.conferences.includes(conf.id)),
      ).length,
    );
  }
  await pick(page, "Conference", "All conferences");
  await expandAll(page);
  const first = page.locator(CARD).first();
  await first
    .locator("summary")
    .filter({ hasText: "History + key players" }).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).click(); });
  await expect(first.locator(".history-content")).toBeVisible();
  await first
    .locator("summary")
    .filter({ hasText: "Why watch / skip" }).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).click(); });
  await expect(first.locator(".tag-list")).toBeVisible();
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/expanded-${test.info().project.name}.png`,
  });
  await page.locator(CARD).last().scrollIntoViewIfNeeded();
  const loaded = await page
    .locator(".team-heading img, .cc-team img")
    .evaluateAll(async (imgs) => {
      return Promise.all(
        imgs.map(async (img) => {
          try {
            (img as HTMLImageElement).loading = "eager";
            await (img as HTMLImageElement).decode();
            return (img as HTMLImageElement).naturalWidth > 0;
          } catch {
            return false;
          }
        }),
      );
    });
  expect(loaded.every(Boolean)).toBe(true);
  expect(errors).toEqual([]);
});
test("search, empty state, league switch and responsive layout", async ({
  page,
}, testInfo) => {
  await page.goto("/?league=NFL");
  const search = page.getByRole("searchbox");
  await search.fill("Ravens");
  await expect(page.locator(CARD)).toHaveCount(1);
  await search.fill("definitely-no-such-team");
  await expect(page.getByText("No games found.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(CARD)).toHaveCount(
    slate.games.filter((g: any) => g.league === "NFL").length,
  );
  const columns = await page
    .locator(".game-grid")
    .first()
    .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(testInfo.project.name === "mobile" ? 1 : 3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (testInfo.project.name === "mobile") {
    await page.evaluate(() => scrollTo(0, 650));
    expect(
      Math.round((await page.locator(".filter-dock").boundingBox())!.y),
    ).toBe(0);
    expect((await page.locator(".card-toggle").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expand(page.locator(CARD).first());
    expect(
      (await page.locator(".game-details summary").first().boundingBox())!
        .height,
    ).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${testInfo.project.name}.png`,
    fullPage: false,
  });
});

test("narrow phone has no page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?league=NFL");
  await league(page, "CFB");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("day and watchability filters narrow the board", async ({ page }) => {
  await page.clock.install({ time: Math.min(...slate.games.map((g: any) => Date.parse(g.date))) - 3600e3 });
  await page.route("**/api/scores**", (route) => route.fulfill({ json: [] }));
  await page.goto("/?league=NFL");
  const nfl = slate.games.filter((g: any) => g.league === "NFL");
  const sunday = nfl.filter((g: any) => g.meta.startsWith("Sun ")).length;
  await pick(page, "Day", "Sunday");
  await expect(page.locator(CARD)).toHaveCount(sunday);
  await pick(page, "Day", "All days");
  await pick(page, "Watchability", "Must watch");
  await expect(page.locator(CARD)).toHaveCount(
    nfl.filter((g: any) => g.score >= 90).length,
  );
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(CARD)).toHaveCount(nfl.length);
  // Each kickoff slot runs from most to least watchable.
  const sections = await page
    .locator(".kickoff-slot, .just-final")
    .evaluateAll((els) => els.map((el) => [...el.querySelectorAll(":scope > .game-grid > .game-card:not(.result-card) .cc-rate strong, :scope.just-final > .game-card:not(.result-card) .cc-rate strong")].map((e) => Number(e.textContent))));
  for (const scores of sections) expect(scores).toEqual([...scores].sort((a, b) => b - a));
  expect(sections.flat().length).toBeGreaterThan(0);
  const slots = await page.locator(".upcoming .kickoff-slot").evaluateAll(els => els.map(el => ({
    date: el.getAttribute("data-kickoff")!,
    ids: [...el.querySelectorAll(".game-card")].map(card => card.getAttribute("data-game-id")),
  })));
  expect(slots.length).toBeGreaterThan(0);
  expect(slots.map(s => s.date)).toEqual(slots.map(s => s.date).sort());
  for (const slot of slots) {
    const expected = nfl.filter((g: any) => new Date(new Date(g.date).setUTCMinutes(0, 0, 0)).toISOString() === slot.date)
      .sort((a: any, b: any) => b.score - a.score || a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map((g: any) => g.id);
    expect(slot.ids).toEqual(expected);
  }
  await page.getByLabel("Time zone", { exact: true }).selectOption("America/Los_Angeles");
  await expect(page.locator(".kickoff-slot h4").first()).toContainText("PT");

});

test("season form chart, trends panel and network logos render", async ({ page }) => {
  await page.goto("/?league=NFL");
  await league(page, "CFB");
  const card = page.locator(CARD).first();
  await expand(card);
  await expect(card.locator(".form-row")).toHaveCount(2);
  await card.locator(".form .mb-svg rect").first().focus();
  await expect(card.locator(".mb-tip")).toBeVisible();
  await card.locator("summary", { hasText: "Season trends" }).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).click(); });
  await expect(card.locator(".trend-team")).toHaveCount(2);
  await expect(card.locator(".tiles dd").first()).not.toBeEmpty();
  const logos = await page.locator(".net-chip img").evaluateAll((imgs) =>
    Promise.all(imgs.slice(0, 6).map(async (img) => {
      (img as HTMLImageElement).loading = "eager";
      await (img as HTMLImageElement).decode().catch(() => {});
      return (img as HTMLImageElement).naturalWidth > 0;
    })),
  );
  expect(logos.length).toBeGreaterThan(0);
  expect(logos.every(Boolean)).toBe(true);
});

const results = JSON.parse(readFileSync("src/data/results.json", "utf8"));
test("final view compares forecast with actual and explains the score", async ({ page }) => {
  test.skip(!results.games.length, "no finished games in this build");
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/?league=NFL");
  const league = results.games.some((r: any) => r.league === "NFL") ? "NFL" : "CFB";
  if (league === "CFB") await league(page, "CFB");
  await completed(page);
  await expandAll(page);
  const expected = results.games.filter((r: any) => r.league === league);
  await expect(page.locator(".result-card")).toHaveCount(expected.length);
  // Cards group by week, newest week first, best game first within a week.
  const newest = expected[0].week;
  const top = expected.filter((r: any) => r.week === newest).sort((a: any, b: any) => b.actual.score - a.actual.score)[0];
  const card = page.locator(".result-card").first();
  await expect(card.locator(".fva-box.actual strong")).toHaveText(String(top.actual.score));
  await expect(card.locator(".fva-box").first().locator("strong")).toHaveText(String(top.forecast.score));
  await expect(card.locator(".readout-head")).toHaveText(top.readout.headline);
  await expect(card.locator(".ls-total").first()).toHaveText(String(top.teams[0].score));
  if (top.scoreCheck) {
    await expect(card.locator(".sc-head")).toHaveText(top.scoreCheck.headline);
    await expect(card.locator(".sc-box").first()).toContainText(`${top.scoreCheck.projected.away}–${top.scoreCheck.projected.home}`);
  }
  await card.locator("summary").filter({ hasText: "Why it scored" }).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).click(); }); });
  // Only the actual-score breakdown: a card with forecast parts carries a second table for the forecast.
  const rows = card
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Why it scored" }) })
    .locator(".breakdown tbody tr");
  await expect(rows).toHaveCount(top.actual.parts.length + 2);
  if (top.wp.length >= 8) {
    await expect(card.locator(".wp svg")).toBeVisible();
    await card.locator(".wp svg rect[tabindex='0']").first().focus();
    await expect(card.locator(".wp-tip")).toBeVisible();
  }
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  // Back to the whole board: every card explains its forecast.
  await pick(page, "Status", "All status");
  await expandAll(page);
  const g = page.locator(CARD).first();
  await expect(page.locator(`${CARD} .proj`)).toHaveCount(
    slate.games.filter((x: any) => x.league === league && x.projected).length,
  );
  const withWp = slate.games.filter((x: any) => x.league === league && x.winProb).length;
  await expect(page.locator(`${CARD} .pwp`)).toHaveCount(withWp);
  await expect(page.locator(".pwp-bar").first()).toBeVisible();
  await g.locator("summary").filter({ hasText: "Why it's a" }).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).click(); }); });
  await expect(g.locator(".breakdown .bd-total td")).toHaveText(await g.locator(".score strong").innerText());
  expect(errors).toEqual([]);
});

test("TV grid lays out every game by network and time, highlighting good games and marking lower-priority ones", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "TV grid" }).click();
  const dayButtons = page.locator(".tv-toolbar [aria-label='Day'] button");
  const days = await dayButtons.count();
  let total = 0;
  for (let i = 0; i < days; i++) {
    await dayButtons.nth(i).click();
    total += await page.locator(".tv-game").count();
  }
  const live = slate.games.length;
  const finals = results.games.filter((r: any) => r.week === slate.period).length;
  expect(total).toBe(live + finals);
  // Tier styling matches scores.
  for (let i = 0; i < days; i++) {
    await dayButtons.nth(i).click();
    for (const g of await page.locator(".tv-game").all()) {
      const score = Number((await g.locator(".tv-score").innerText()).replace("↓", "").trim());
      const cls = (await g.getAttribute("class")) ?? "";
      if (score >= 74) expect(cls).toContain("hl");
      if (score < 64) {
        expect(cls).toContain("dim");
        await expect(g.locator(".tv-score")).toContainText("↓");
        await expect(g).toHaveCSS("opacity", "1");
        await expect(g).toHaveCSS("border-top-style", "dashed");
      }
    }
  }
  // A block opens the same card as the main board, in a dialog.
  await dayButtons.first().click();
  await page.locator(".tv-game").first().click();
  const dialog = page.locator("dialog.tv-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".game-card, .result-card")).toHaveCount(1);
  await expect(dialog.locator(".game-details summary").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".tv-key")).toContainText("Entertaining");
  await expect(page.locator(".tv-key")).not.toContainText("Lit");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);
});

test("weekend export files and advanced stats are available", async ({ page, request }) => {
  const csv = await (await request.get("/exports/watch-slate.csv")).text();
  const lines = csv.trim().split(/\r?\n/);
  expect(lines[0]).toContain("Watchability");
  expect(lines.length - 1).toBe(slate.games.length + results.games.filter((r: any) => r.week === slate.period).length);
  const ics = await (await request.get("/exports/entertaining.ics")).text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(slate.games.filter((g: any) => g.score >= 74).length);
  await page.goto("/?league=NFL");
  await page.locator(".export summary").click();
  await expect(page.locator(".export-menu a[href='/exports/watch-slate.csv']")).toBeVisible();
  await expect(page.getByRole("button", { name: /Download.*JPG/ })).toHaveCount(0);
  const card = page.locator(CARD).first();
  await expand(card);
  const adv = card.locator("summary").filter({ hasText: "Advanced stats" });
  if (await adv.count()) {
    if (!(await adv.locator("..").getAttribute("open") !== null)) await adv.click();
    await expect(card.locator(".adv-table tbody tr").first()).toBeVisible();
  }
});

test("times default to Central, follow the chosen zone, and the TV grid JPG downloads", async ({ page }) => {
  await page.goto("/?league=NFL");
  await expect(page.locator(".cc-time").first()).toContainText("CT");
  await page.selectOption(".tz-pick select", "America/New_York");
  await expect(page.locator(".cc-time").first()).toContainText("ET");
  await page.reload();
  await expect(page.locator(".cc-time").first()).toContainText("ET");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  await page.getByRole("button", { name: "TV grid" }).click();
  for (const [item, name] of [
    [/This day/, /^tv-grid-(?!weekend).*\.jpg$/],
    [/Full weekend/, /^tv-grid-weekend-.*\.jpg$/],
  ] as const) {
    await page.locator(".export-jpg-menu summary").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".export-jpg-menu .export-menu button").filter({ hasText: item }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(name);
  }
});

test("TV grid conference filter narrows college games and All conferences restores them", async ({ page }) => {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "TV grid" }).click();
  // The conference picker only appears for College.
  await expect(page.getByLabel("Conference")).toHaveCount(0);
  await page.locator(".tv-toolbar [aria-label='League'] button", { hasText: "College" }).click();
  const pick = page.getByLabel("Conference");
  await expect(pick).toHaveValue("all-fbs");
  const days = page.locator(".tv-toolbar [aria-label='Day'] button");
  const countAll = async () => {
    let n = 0;
    for (let i = 0; i < (await days.count()); i++) {
      await days.nth(i).click();
      n += await page.locator(".tv-game").count();
    }
    return n;
  };
  const all = await countAll();
  await pick.selectOption("sec");
  const sec = await countAll();
  const expected = [...slate.games, ...results.games.filter((r: any) => r.week === slate.period)].filter(
    (g: any) => g.league === "CFB" && g.conferences.includes("sec"),
  ).length;
  expect(sec).toBe(expected);
  expect(sec).toBeGreaterThan(0);
  expect(sec).toBeLessThan(all);
  await pick.selectOption("all-fbs");
  expect(await countAll()).toBe(all);
  // Leaving College clears the picker.
  await page.locator(".tv-toolbar [aria-label='League'] button", { hasText: "NFL" }).click();
  await expect(page.getByLabel("Conference")).toHaveCount(0);
});

test("Game Center overlay opens from a card with projection, momentum, field tilt, drives and players", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const fx = readFileSync("tests/fixtures/game-nfl.json", "utf8");
  await page.route("**/api/game**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: fx }));
  await page.route("https://site.api.espn.com/**", (r) => r.abort());
  await page.goto("/?league=NFL");
  // Upcoming game: pregame view
  // Compact card: first click expands it, a click on the matchup opens the Game Center.
  const first = page.locator(CARD).first();
  await expect(first.locator(".card-more")).toHaveCount(0);
  await expect(first.locator(".matchup")).toHaveCount(0); // just the strip until it is opened
  await first.locator(".cc-main").click();
  await expect(first.locator(".card-more .take")).toBeVisible();
  await first.locator(".matchup").click();
  const gc = page.locator("dialog.gc");
  await expect(gc).toBeVisible();
  await expect(gc.locator(".gc-proj")).toContainText("Projected score");
  await expect(gc.locator(".gc-ball")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(gc).toBeHidden();
  // Finished game with the live-data fixture (Chargers at Bills)
  const final = results.games.find((r: any) => r.espnId === "401872953");
  test.skip(!final, "fixture game not in results");
  if (final.league === "NFL") {
    await completed(page);
    await searchBox(page).fill("Bills");
    await expandAll(page);
    await page.locator(".result-card .gc-open").first().click();
    await expect(gc.locator(".gc-score").first()).toHaveText("16");
    await expect(gc.getByText("Who's tilting the field")).toBeVisible();
    await expect(gc.getByText("Momentum")).toBeVisible();
    await expect(gc.locator(".gc-drives li")).toHaveCount(22);
    await expect(gc.locator(".gc-top li")).toHaveCount(6);
    // Player cards show the team (logo, abbreviation, team color) and a position.
    const card = gc.locator(".gc-top li.gc-pcard").first();
    await expect(card.locator(".gc-plogo")).toBeVisible();
    await expect(card.locator(".gc-pteam")).toContainText(/LAC|BUF/);
    await expect(card.locator(".gc-pos")).not.toBeEmpty();
    await expect(gc.locator(".gc-tracker li").first()).toBeVisible();
    // Win-probability panel carries the insanity meter, with the witching hour shaded.
    await expect(gc.locator(".insanity [role=meter]")).toBeVisible();
    const w = await gc.locator(".gc-body").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(w).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test("insanity meter looks back on every final and ranks wild games above blowouts", async ({ page }) => {
  await page.goto("/?league=NFL");
  await completed(page);
  await expandAll(page);
  const cards = page.locator(".result-card");
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  const scores: number[] = [];
  for (let i = 0; i < n; i++) {
    const meter = cards.nth(i).locator(".insanity");
    await expect(meter).toHaveCount(1);
    const now = Number(await meter.locator("[role=meter]").getAttribute("aria-valuenow"));
    expect(now).toBeGreaterThanOrEqual(0);
    expect(now).toBeLessThanOrEqual(100);
    await expect(meter.locator(".ins-score")).toHaveText(String(now));
    scores.push(now);
  }
  // Not every game reads the same: some calm, some not.
  expect(Math.max(...scores)).toBeGreaterThan(Math.min(...scores) + 20);
  // Overtime finals are never Calm.
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    if ((await card.locator("text=went to overtime").count()) > 0) {
      await expect(card.locator(".insanity")).not.toHaveClass(/calm/);
    }
  }
});

test("insanity meter updates live from the flow feed", async ({ page }) => {
  const games = slate.games.filter((g: any) => g.league === "NFL");
  const start = Math.min(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({
      json: games.map((g: any) => ({ id: g.espnId, state: "in", detail: "Q3 5:12", away: 14, home: 17 })),
    }),
  );
  // A wild game: lead changes, big swings, tight late.
  const wp = Array.from({ length: 120 }, (_, i) => [50 + 40 * Math.sin(i / 6) * (i < 100 ? 1 : 0.1), Math.min(4, 1 + Math.floor(i / 30))]);
  let flowCalls = 0;
  await page.route("**/api/flow**", (route) => {
    flowCalls++;
    return route.fulfill({ json: { wp } });
  });
  await page.goto("/?league=NFL");
  await expand(page.locator(CARD).first()); // the meter lives in the expanded card
  const meter = page.locator(".game-card .insanity.live").first();
  await expect(meter).toBeVisible();
  await expect(meter).toContainText("Insanity meter · live");
  const val = Number(await meter.locator("[role=meter]").getAttribute("aria-valuenow"));
  expect(val).toBeGreaterThan(40);
  expect(flowCalls).toBeGreaterThan(0);
});

test("Insanity tab ranks the week and season for NFL and college", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: /^Insanity/ }).click();
  const rows = page.locator(".ic");
  await expect(rows.first()).toBeVisible();
  // Each card: both logos, a narrative, and the game's MVP with a position.
  await expect(rows.first().locator(".ic-team img")).toHaveCount(2);
  await expect(rows.first().locator(".ic-story")).not.toBeEmpty();
  await expect(rows.first().locator(".ic-mvp strong")).not.toBeEmpty();
  await expect(rows.first().locator(".ic-pos")).not.toBeEmpty();
  // Ranked most insane first, with scores in range.
  const scoresOf = async () => (await page.locator(".ic .ic-ins strong").allInnerTexts()).map(Number);
  const nfl = await scoresOf();
  expect(nfl.length).toBeGreaterThan(0);
  expect(nfl).toEqual([...nfl].sort((a, b) => b - a));
  expect(Math.max(...nfl)).toBeLessThanOrEqual(100);
  // The week-by-week list names the wildest game of each week.
  await expect(page.locator(".ib-weeks li").first()).toContainText("wildest:");
  // College is ranked separately and the season scope works.
  await page.locator(".ib [aria-label='League'] button", { hasText: "College" }).click();
  await expect(page.locator(".ic").first()).toBeVisible();
  const cfb = await scoresOf();
  expect(cfb).toEqual([...cfb].sort((a, b) => b - a));
  await page.locator(".ib [aria-label='Ranking'] button", { hasText: "Season" }).click();
  await expect(page.locator(".ib-heading, .tv-heading h2")).toContainText("season ranking");
  await expect(page.locator(".ic").first()).toContainText(/(Aug|Sept|Oct|Nov|Dec|Jan)\./); // a date range, whichever week holds the wildest game
  // A card opens the Game Center.
  await page.locator(".ic button.ic-inner").first().click();
  await expect(page.locator("dialog.gc")).toBeVisible();
  await page.keyboard.press("Escape");
  // Filters bar is not shown here, and the page does not scroll sideways.
  await expect(page.locator(".filter-dock")).toHaveCount(0);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);
});

test("Key players show photo, name, position and team for every upcoming game", async ({ page }) => {
  for (const g of slate.games) {
    const players = g.history.boxes.find((b: any) => /Key players/.test(b.label))?.players ?? [];
    expect(players.length, g.matchup).toBeGreaterThan(0);
    for (const p of players) {
      expect(p.name, g.matchup).toBeTruthy();
      expect(p.logoId, g.matchup).toBeTruthy();
    }
  }
  await page.goto("/?league=NFL");
  const card = page.locator(CARD).first();
  await expand(card);
  await card.locator("summary").filter({ hasText: "History + key players" }).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).click(); }); });
  const kp = card.locator(".kp-card");
  await expect(kp.first()).toBeVisible();
  await expect(kp.first().locator(".kp-pos")).not.toBeEmpty();
  await expect(kp.first().locator(".kp-logo")).toBeVisible();
  await expect(kp.first().locator("img, .headshot-fallback").first()).toBeVisible();
});

test("NFL cards carry an injury report with Out / Doubtful / Questionable and the injury", async ({ page }) => {
  const nfl = slate.games.filter((g: any) => g.league === "NFL" && g.teams.some((t: any) => (t.injuries ?? []).length));
  test.skip(!nfl.length, "no injury data in this build");
  for (const g of nfl) for (const t of g.teams) for (const i of t.injuries ?? []) expect(i.status).toBeTruthy();
  await page.goto("/?league=NFL");
  await expandAll(page);
  const card = page.locator(".game-card").filter({ has: page.locator("summary", { hasText: "Injury report" }) }).first();
  await card.locator("summary").filter({ hasText: "Injury report" }).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).click(); }); });
  await expect(card.locator(".inj-team")).toHaveCount(2);
  const status = card.locator(".inj-status").first();
  if (await status.count()) await expect(status).toHaveText(/Out|Doubtful|Questionable/i);
  const rot = await card.locator(".inj-title").evaluate((el) => getComputedStyle(el).transform);
  expect(rot === "none" || rot === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
});

test("college conference games carry the conference availability report", async ({ page }) => {
  const games = slate.games.filter((g: any) => g.league === "CFB" && g.availability);
  test.skip(!games.length, "no conference availability reports in this build");
  for (const g of games) {
    expect(["SEC", "ACC", "Big Ten", "Big 12"]).toContain(g.availability.conf);
    for (const t of g.teams) for (const i of t.injuries ?? []) expect(i.status).not.toBe("Available");
  }
  const g = games.find((x: any) => !x.availability.pending) ?? games[0];
  await page.goto("/?league=NFL");
  await league(page, "CFB");
  await expandAll(page);
  const card = page
    .locator(`${CARD}[data-game-id="${g.id}"]`)
    .filter({ has: page.locator("summary", { hasText: "Injury report" }) })
    .first();
  await card.scrollIntoViewIfNeeded();
  await card.locator("summary").filter({ hasText: "Injury report" }).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).evaluate(el => { if (!(el.parentElement as HTMLDetailsElement).open) (el as HTMLElement).click(); }); });
  if (g.availability.pending) {
    await expect(card.locator(".inj-pending")).toContainText(`${g.availability.conf} posts its first availability report`);
  } else {
    await expect(card.locator(".inj-team")).toHaveCount(2);
    await expect(card.locator(".inj .source-note")).toContainText(`${g.availability.conf} availability report`);
    const status = card.locator(".inj-status").first();
    if (await status.count()) await expect(status).toHaveText(/Out|Doubtful|Questionable|Probable|Game-time/i);
  }
});

test("cards show the broadcast crew when the announcing schedule lists the game", async ({ page }) => {
  const games = slate.games.filter((g: any) => g.league === "NFL" && g.announcers?.length);
  test.skip(!games.length, "no announcer data in this build");
  for (const g of games) for (const c of g.announcers) expect(c.name && c.role).toBeTruthy();
  await page.goto("/?league=NFL");
  const g = games[0];
  const card = page.locator(".game-card").filter({ hasText: g.teams[0].name }).filter({ hasText: g.teams[1].name }).first();
  // On the opened card, with play-by-play first.
  await expand(card);
  await expect(card.locator(".booth")).toContainText(g.announcers[0].name);
  // Each announcer has a small photo, or initials when there's no free one.
  await expect(card.locator(".booth-person").first().locator("img, .headshot-fallback")).toBeVisible();
  const box = await card.locator(".booth-person").first().locator("img, .headshot-fallback").boundingBox();
  expect(box!.height).toBeLessThanOrEqual(22);
});

test("board shows upcoming first and collapses completed games below, with working status filters", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const games = slate.games.filter((g: any) => g.league === "NFL");
  const start = Math.min(...games.map((g: any) => new Date(g.date).getTime()));
  const archived = results.games.filter((r: any) => r.league === "NFL").length;
  // Game 0 is in progress, game 1 just finished (not archived yet), everything else is still ahead.
  await page.clock.install({ time: start + 90 * 60e3 });
  await page.route("**/api/scores**", (route) =>
    route.fulfill({
      json: games.map((g: any, i: number) => ({
        id: g.espnId,
        state: i === 0 ? "in" : i === 1 ? "post" : "pre",
        detail: i === 0 ? "Q3 5:12" : "Final",
        away: 14,
        home: 17,
      })),
    }),
  );
  await page.goto("/?league=NFL");
  const sections = page.locator(".board-section");
  await expect(sections.first()).toHaveAttribute("aria-label", "Upcoming");
  expect(await sections.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Upcoming", "In progress", "Completed"]);
  await expect(page.locator(".board-section.live .game-card")).toHaveCount(1);
  await expect(page.locator(".board-section.live .game-status")).toContainText("Live");
  // Completed holds the just-finished game plus the archived finals; Upcoming holds the rest.
  await expect(page.locator(".board-section.final .section-head .count")).toHaveText(String(archived + 1));
  await expect(page.locator(".board-section.upcoming .game-card")).toHaveCount(games.length - 2);
  // The heading line carries the same counts, and the Status menu offers each status.
  const counts = page.locator(".board-heading [role=status]");
  await expect(counts).toContainText(`1 in progress · ${archived + 1} completed · ${games.length - 2} upcoming`);
  const status = (name: string) => pick(page, "Status", name);
  await expect(page.getByLabel("Status", { exact: true }).locator("option")).toHaveText(["All status", "In progress", "Completed", "Upcoming"]);
  // Completed games start collapsed below upcoming and live games.
  const toggle = page.getByRole("button", { name: "Show completed games", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#completed-games")).toBeHidden();
  await toggle.click();
  await expect(page.locator("#completed-games")).toBeVisible();
  // Expanding preserves the completed preview and its show-all control.
  if (archived + 1 > 12) {
    await expect(page.getByRole("button", { name: /Show all \d+ completed games/ })).toBeVisible();
    expect(await page.locator(".board-section.final .game-card").count()).toBe(12);
  }
  // Each status shows only its own section.
  await status("In progress");
  await expect(page.locator(".board-section")).toHaveCount(1);
  await expect(page.locator(".board-section.live")).toBeVisible();
  await status("Completed");
  await expect(page.locator(".board-section")).toHaveCount(1);
  await expect(page.locator(".board-section.final .result-card")).toHaveCount(archived);
  await expect(page.locator(".board-section.final .game-card")).toHaveCount(archived + 1);
  await status("Upcoming");
  await expect(page.locator(".board-section")).toHaveCount(1);
  await expect(page.locator(".board-section.upcoming .game-card")).toHaveCount(games.length - 2);
  await status("All status");
  await expect(page.locator(".board-section")).toHaveCount(3);
  // A status with nothing in it says so instead of showing a blank board.
  await searchBox(page).fill("zzzz-no-such-team");
  await expect(page.locator(".empty-state")).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);
});

test("game details open fixed to the screen, keep the page still, and scroll inside", async ({ page }) => {
  const fx = readFileSync("tests/fixtures/game-nfl.json", "utf8");
  await page.route("**/api/game**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: fx }));
  await page.route("https://site.api.espn.com/**", (r) => r.abort());
  await page.goto("/?league=NFL");
  const vh = page.viewportSize()!.height;
  const y = () => page.evaluate(() => Math.round(window.scrollY));
  const checkDialog = async (dialog: import("@playwright/test").Locator, body: import("@playwright/test").Locator) => {
    await expect(dialog).toBeVisible();
    // Fixed to the screen and inside it: not parked at the top of the page where it scrolls away.
    expect(await dialog.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(vh + 1);
    // Scrolling hard inside never moves the page behind it, and reaches the end of the content.
    const opened = await y();
    await page.mouse.move(page.viewportSize()!.width / 2, vh / 2);
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 500);
    await page.waitForTimeout(150);
    expect(await y()).toBe(opened);
    const [top, max] = await body.evaluate((el) => [Math.round(el.scrollTop), el.scrollHeight - el.clientHeight]);
    expect(top).toBeGreaterThanOrEqual(max - 2);
    return opened;
  };
  // Game Center, opened from far down the board.
  await page.locator(".game-card .card-toggle").first().click();
  const open = page.locator(".game-card .gc-open").first();
  await open.scrollIntoViewIfNeeded();
  const before = await y();
  await open.click();
  const gc = page.locator("dialog.gc");
  expect(await checkDialog(gc, gc.locator(".gc-body"))).toBe(before);
  await page.keyboard.press("Escape");
  await expect(gc).toBeHidden();
  expect(await y()).toBe(before); // back where they were, not at the top
  // The TV grid's game detail behaves the same.
  await page.getByRole("button", { name: "TV grid" }).click();
  await page.locator(".tv-game").first().scrollIntoViewIfNeeded();
  const gridY = await y();
  await page.locator(".tv-game").first().click();
  const tv = page.locator("dialog.tv-dialog");
  expect(await checkDialog(tv, tv.locator(".tv-dialog-body"))).toBe(gridY);
  await page.keyboard.press("Escape");
  await expect(tv).toBeHidden();
  expect(await y()).toBe(gridY);
});

test("live and completed cards show the status above the teams and the score beside each team", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const games = slate.games.filter((g: any) => g.league === "NFL");
  const start = Math.min(...games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  // Game 0 is live (Q3 5:12, 14-17), game 1 just finished (27-24).
  await page.route("**/api/scores**", (route) =>
    route.fulfill({
      json: games.map((g: any, i: number) => ({
        id: g.espnId,
        state: i === 0 ? "in" : i === 1 ? "post" : "pre",
        detail: i === 0 ? "5:12 - 3rd" : "Final",
        away: i === 0 ? 14 : 27,
        home: i === 0 ? 17 : 24,
      })),
    }),
  );
  await page.goto("/?league=NFL");
  const live = page.locator(".board-section.live .game-card").first();
  await expect(live.locator(".game-status.in")).toBeVisible();
  // The old single line is gone.
  await expect(page.locator(".live-strip")).toHaveCount(0);
  // The compact strip: quarter and clock above the teams, a score beside each logo, and the rating. Nothing else.
  await expect(live.locator(".cc-when .game-status")).toContainText("Q3");
  await expect(live.locator(".cc-when .game-status")).toContainText("5:12");
  const strip = await live.locator(".cc-when, .cc-team").evaluateAll((els) => els.map((e) => e.className.split(" ")[0]));
  expect(strip).toEqual(["cc-when", "cc-team", "cc-team"]);
  const teams = live.locator(".cc-team");
  await expect(teams.nth(0).locator(".team-score")).toHaveText("14");
  await expect(teams.nth(1).locator(".team-score")).toHaveText("17");
  await expect(teams.nth(0).locator("img")).toBeVisible();
  await expect(live.locator(".cc-rate strong")).toHaveText(String(games[0].score));
  await expect(live.locator(".facts, .team-heading, .tv")).toHaveCount(0); // detail waits behind the toggle
  expect((await live.boundingBox())!.height).toBeLessThan(180);
  // Expanded: the status sits above the team names and each score is on its team's row.
  await expand(live);
  const order = await live.locator(".game-status, .team-heading").evaluateAll((els) => els.map((e) => e.className.split(" ")[0]));
  expect(order).toEqual(["game-status", "team-heading", "team-heading"]);
  const rows = live.locator(".team-heading");
  await expect(rows.nth(0).locator(".team-score")).toHaveText("14");
  await expect(rows.nth(1).locator(".team-score")).toHaveText("17");
  const [nameBox, scoreBox] = await Promise.all([rows.nth(0).locator("h4").boundingBox(), rows.nth(0).locator(".team-score").boundingBox()]);
  expect(Math.abs((nameBox!.y + nameBox!.height / 2) - (scoreBox!.y + scoreBox!.height / 2))).toBeLessThan(60);
  expect(scoreBox!.x).toBeGreaterThan(nameBox!.x);
  // A game that just finished: FINAL, winner's score emphasized.
  const post = page.locator(".just-final .game-card").first();
  await expect(post.locator(".cc-when .game-status.post")).toContainText("Final");
  await expect(post.locator(".team-score.won")).toHaveText("27");
  await expect(post.locator(".team-score.lost")).toHaveText("24");
  // Archived completed cards: FINAL, both scores beside the logos and the rating in the strip.
  await completed(page);
  const done = page.locator(".result-card").first();
  await expect(done.locator(".cc-when .game-status.post")).toContainText("Final");
  await expect(done.locator(".cc-team .team-score")).toHaveCount(2);
  await expect(done.locator(".cc-team .team-score.won")).toHaveCount(1);
  await expect(done.locator(".cc-rate strong")).toBeVisible();
  expect((await done.boundingBox())!.height).toBeLessThan(180);
  // Expanded: FINAL above the teams, score beside each name, no separate T column.
  await expand(done);
  await expect(done.locator(".game-status.post")).toContainText("Final");
  await expect(done.locator(".ls-team .ls-total")).toHaveCount(2);
  await expect(done.locator("thead th", { hasText: /^T$/ })).toHaveCount(0);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);
  void testInfo;
});

const openGameCenter = async (page: import("@playwright/test").Page, fixtureFile: string) => {
  const fx = readFileSync(fixtureFile, "utf8");
  // Every game has kicked off, so the Game Center loads the live feed whichever card is first.
  const lastKickoff = Math.max(...slate.games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: lastKickoff + 6 * 3600e3 });
  await page.route("**/api/game**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: fx }));
  await page.route("https://site.api.espn.com/**", (r) => r.abort());
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "Show completed games", exact: true }).click();
  await page.locator(`${CARD} .card-toggle`).first().click();
  await page.locator(`${CARD} .gc-open`).first().click();
  const gc = page.locator("dialog.gc");
  await expect(gc.locator(".gc-top li").first()).toBeVisible();
  return gc;
};
const num = (s: string) => Number(s.replace("−", "-").replace("+", ""));

test("Top 3 / bottom 3: the impact number opens the plays behind it, with play art", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const gc = await openGameCenter(page, "tests/fixtures/game-nfl-log.json");
  // Every number is a button, closed to start.
  const buttons = gc.locator(".gc-imp-btn");
  expect(await buttons.count()).toBeGreaterThanOrEqual(6);
  await expect(buttons.first()).toHaveAttribute("aria-expanded", "false");
  await expect(gc.locator(".gc-plays")).toHaveCount(0);
  // Open one quarterback's number.
  const card = gc.locator(".gc-pcard").filter({ hasText: "Josh Allen" });
  const btn = card.locator(".gc-imp-btn");
  const shown = num((await btn.innerText()).match(/[▲▼]\s*([+\-−]?\d+(?:\.\d+)?)/)![1]);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  const panel = card.locator(".gc-plays");
  await expect(panel).toBeVisible();
  // It opens as a summary: the biggest plays, then everything else rolled up, not a play-by-play.
  await expect(panel.locator(".gc-plays-head")).toContainText("biggest plays");
  const rows = panel.locator(".gc-playlist li");
  await expect(rows).toHaveCount(3);
  await expect(panel.locator(".gc-playlist li svg.play-art")).toHaveCount(3);
  await expect(rows.first()).toContainText("J.Allen left guard for 1 yard, TOUCHDOWN"); // the biggest swing
  await expect(rows.first()).toContainText("+6.1");
  await expect(rows.nth(1)).toContainText("INTERCEPTED by G.Smith");
  await expect(rows.nth(1)).toContainText("−4.5");
  const chips = panel.locator(".gc-chip");
  expect(await chips.count()).toBeGreaterThanOrEqual(3);
  await expect(panel.locator(".gc-chip", { hasText: /\d+ (sack|incompletion|rush|completion)/ }).first()).toBeVisible();
  await expect(panel.locator(".gc-chip.other")).toContainText("Other box-score credit");
  // Summary adds up to the number on the card: top plays + rolled-up groups (+ other credit).
  const sumOf = async () =>
    [...(await panel.locator(".gc-ppts b").allInnerTexts()), ...(await panel.locator(".gc-chip b").allInnerTexts())].map(num).reduce((a, b) => a + b, 0);
  expect(Math.abs((await sumOf()) - shown)).toBeLessThan(0.011);
  await expect(panel.locator(".gc-plays-head")).toContainText(`= ${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown)}`);
  // The full list is one click away: every play, in game order, with its art, quarter and points.
  const seeAll = panel.getByRole("button", { name: /See all \d+ plays/ });
  await expect(seeAll).toHaveAttribute("aria-expanded", "false");
  await seeAll.click();
  await expect(panel.locator(".gc-plays-head")).toContainText("plays");
  await expect(panel.locator(".gc-chip")).toHaveCount(0);
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(8);
  await expect(panel.locator(".gc-playlist li svg.play-art")).toHaveCount(n);
  const arts = await panel.locator("svg.play-art").evaluateAll((els) => els.map((e) => e.getAttribute("class")!.replace("play-art art-", "")));
  for (const kind of ["td", "sack", "run", "pass", "safety", "adjust", "int", "incomplete"]) expect(arts, `art for ${kind}`).toContain(kind);
  await expect(rows.filter({ hasText: "sacked at LAC 26" }).first()).toContainText("−0.7");
  await expect(rows.filter({ hasText: "sacked at LAC 26" }).first()).toContainText("Q4");
  expect(Math.abs((await sumOf()) - shown)).toBeLessThan(0.011); // still adds up in full
  // And back to the summary.
  await panel.getByRole("button", { name: /Show biggest plays only/ }).click();
  await expect(rows).toHaveCount(3);
  // A defender's number opens too, and shows different play art.
  const dcard = gc.locator(".gc-pcard").filter({ hasText: "Greg Rousseau" });
  await dcard.locator(".gc-imp-btn").click();
  await expect(dcard.locator(".gc-playlist li svg.art-sack")).toHaveCount(1);
  // Nothing spills sideways inside the overlay, and the number closes the list again.
  const overflow = await gc.locator(".gc-body").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Top 3 / bottom 3 numbers stay plain when the game feed has no play log", async ({ page }) => {
  const gc = await openGameCenter(page, "tests/fixtures/game-nfl.json");
  await expect(gc.locator(".gc-imp").first()).toBeVisible();
  await expect(gc.locator(".gc-imp-btn")).toHaveCount(0);
});

test("completed cards show attendance at the top, with a capacity bar when the stadium's capacity is known", async ({ page }) => {
  const g = results.games.find((r: any) => r.attendance > 0 && r.venueId);
  test.skip(!g, "no finished game with attendance in this build");
  const count = g.attendance.toLocaleString("en-US");
  const cap = Math.round(g.attendance / 0.8); // a stadium this game filled to 80%
  const open = async () => {
    await page.goto("/?league=NFL");
    if (g.league === "CFB") await league(page, "CFB");
    await completed(page);
    return page.locator(".result-card").filter({ hasText: g.teams[0].name }).filter({ hasText: g.teams[1].name }).first();
  };
  // Capacity known: a bar, and the share of capacity.
  await page.route("**/venues.json", (r) => r.fulfill({ json: { [g.venueId]: { name: "Test Stadium", capacity: cap } } }));
  let card = await open();
  await expand(card);
  const att = card.locator(".attendance");
  await expect(att).toBeVisible();
  await expect(att.locator(".att-line strong")).toHaveText(count);
  await expect(att.locator(".att-pct")).toContainText(`80% of ${cap.toLocaleString("en-US")} capacity`);
  const meter = att.locator("[role=meter]");
  await expect(meter).toHaveAttribute("aria-valuenow", "80");
  await expect(meter.locator("i")).toHaveAttribute("style", /width: 80%/);
  // It sits at the very top of the card, right under the header and before the score.
  const order = await card.locator(".card-top, .attendance, .game-status").evaluateAll((els) => els.map((e) => e.className.split(" ")[0]));
  expect(order.slice(0, 3)).toEqual(["card-top", "attendance", "game-status"]);
  // No capacity on file: the count still shows, with no bar and no made-up percentage.
  await page.unroute("**/venues.json");
  await page.route("**/venues.json", (r) => r.fulfill({ json: {} }));
  card = await open();
  await expand(card);
  await expect(card.locator(".attendance .att-line strong")).toHaveText(count);
  await expect(card.locator(".attendance [role=meter]")).toHaveCount(0);
  await expect(card.locator(".attendance .att-pct")).toHaveCount(0);
  // Games without an attendance don't show the row at all.
  const none = results.games.find((r: any) => !r.attendance);
  if (none && none.league === g.league) {
    await expect(page.locator(".result-card").filter({ hasText: none.teams[0].name }).filter({ hasText: none.teams[1].name }).first().locator(".attendance")).toHaveCount(0);
  }
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
});

test("@smoke the persistent bar is slim and every filter is a pop-down menu", async ({ page }, testInfo) => {
  await page.clock.install({ time: Math.min(...slate.games.map((g: any) => Date.parse(g.date))) - 3600e3 });
  await page.route("**/api/scores**", (route) => route.fulfill({ json: [] }));
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/?league=NFL");
  const dock = page.locator(".filter-dock");
  // Every filter is a pop-down (a select), not a row of buttons.
  for (const menu of ["League", "Status", "Day", "Watchability"]) {
    await expect(page.getByLabel(menu, { exact: true })).toHaveJSProperty("tagName", "SELECT");
  }
  await expect(dock.locator("button:not(.search-clear)")).toHaveCount(0);
  await expect(page.getByLabel("Conference", { exact: true })).toHaveCount(0); // college only
  // Slim: the old bar took 171px on a phone and 183px on a desktop.
  const phone = testInfo.project.name === "mobile";
  expect((await dock.boundingBox())!.height).toBeLessThan(phone ? 100 : 60);
  // Still persistent: it stays at the top of the screen while the page scrolls.
  await page.evaluate(() => scrollTo(0, 900));
  expect(Math.round((await dock.boundingBox())!.y)).toBe(0);
  await page.evaluate(() => scrollTo(0, 0));
  // Each menu narrows the board.
  const nfl = slate.games.filter((g: any) => g.league === "NFL");
  await pick(page, "Watchability", "Must watch");
  await expect(page.locator(CARD)).toHaveCount(nfl.filter((g: any) => g.score >= 90).length);
  await pick(page, "Watchability", "Any rating");
  await pick(page, "Status", "Upcoming");
  await expect(page.locator(".board-section")).toHaveCount(1);
  await pick(page, "Status", "All status");
  // College adds a Conference menu, and the bar stays slim.
  await league(page, "CFB");
  await expect(page.getByLabel("Conference", { exact: true })).toHaveJSProperty("tagName", "SELECT");
  expect((await dock.boundingBox())!.height).toBeLessThan(phone ? 140 : 60);
  await pick(page, "Conference", "SEC");
  await expect(page.locator(CARD)).toHaveCount(slate.games.filter((g: any) => g.league === "CFB" && g.conferences.includes("sec")).length);
  // Nothing spills sideways.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);
});

test("@smoke game cards open as a minimal strip: logos, scores and the rating; the rest waits behind the toggle", async ({ page }) => {
  await page.goto("/?league=NFL");
  // An upcoming or live game.
  const card = page.locator(CARD).first();
  await expect(card).toHaveClass(/compact/);
  expect((await card.boundingBox())!.height).toBeLessThan(180);
  await expect(card.locator(".cc-team")).toHaveCount(2);
  await expect(card.locator(".cc-team img")).toHaveCount(2);
  const title = (await card.locator("h3.sr-only").innerText()).trim();
  const game = slate.games.find((g: any) => g.matchup === title)!;
  expect(game, title).toBeTruthy();
  await expect(card.locator(".cc-rate strong")).toHaveText(String(game.score));
  await expect(card.locator(".cc-network")).toContainText(game.broadcast);
  await expect(card.locator(".cc-weather")).toContainText(game.weather.title);
  await expect(card.locator(".cc-when")).toBeVisible(); // kickoff time, or LIVE with the quarter and clock
  // Everything else is hidden until it is opened.
  await expect(card.locator(".facts, .team-heading, .tv, .card-more, .attendance, .insanity")).toHaveCount(0);
  await card.locator(".card-toggle").click();
  await expect(card).toHaveClass(/expanded/);
  await expect(card.locator(".cc")).toHaveCount(0);
  await expect(card.locator(".facts")).toBeVisible();
  await expect(card.locator(".game-details details:not([open])")).toHaveCount(0);
  await expect(card.locator(".booth")).toContainText("Announcers:");
  await expect(card.locator(".tv")).toBeVisible();
  await expect(card.locator(".card-more .take")).toBeVisible();
  // "Less" puts it back to the strip.
  await card.locator(".card-toggle", { hasText: "Less" }).click();
  await expect(card).toHaveClass(/compact/);
  // A completed game is the same strip: both scores, the rating, and the detail behind the toggle.
  await completed(page);
  const done = page.locator(".result-card").first();
  await expect(done).toHaveClass(/compact/);
  expect((await done.boundingBox())!.height).toBeLessThan(180);
  await expect(done.locator(".cc-team img")).toHaveCount(2);
  await expect(done.locator(".cc-team .team-score")).toHaveCount(2);
  await expect(done.locator(".cc-rate strong")).toBeVisible();
  await expect(done.locator(".linescore, .attendance, .fva, .wp, .score-call")).toHaveCount(0);
  await done.locator(".card-toggle").click();
  await expect(done.locator(".linescore")).toBeVisible();
  await expect(done.locator(".fva")).toBeVisible();
  await done.locator(".card-toggle", { hasText: "Less" }).click();
  await expect(done).toHaveClass(/compact/);
});
