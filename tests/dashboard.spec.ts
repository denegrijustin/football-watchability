import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
test("all games, conferences, history and logos remain available", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/");
  await expect(page.locator(".game-card")).toHaveCount(
    slate.games.filter((g: any) => g.league === "NFL").length,
  );
  await expect(page.locator(".game-details details[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "College football" }).click();
  await expect(page.locator(".game-card")).toHaveCount(
    slate.games.filter((g: any) => g.league === "CFB").length,
  );
  for (const conf of slate.conferences) {
    await page.getByRole("button", { name: conf.label, exact: true }).click();
    await expect(page.locator(".game-card")).toHaveCount(
      slate.games.filter(
        (g: any) =>
          g.league === "CFB" &&
          (conf.id === "all-fbs" || g.conferences.includes(conf.id)),
      ).length,
    );
  }
  await page.getByRole("button", { name: "All FBS", exact: true }).click();
  const first = page.locator(".game-card").first();
  await first
    .locator("summary")
    .filter({ hasText: "History + key players" })
    .click();
  await expect(first.locator(".history-content")).toBeVisible();
  await first
    .locator("summary")
    .filter({ hasText: "Why watch / skip" })
    .click();
  await expect(first.locator(".tag-list")).toBeVisible();
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/expanded-${test.info().project.name}.png`,
  });
  await page.locator(".game-card").last().scrollIntoViewIfNeeded();
  const loaded = await page
    .locator(".team-heading img")
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
  await page.goto("/");
  const search = page.getByRole("searchbox");
  await search.fill("Ravens");
  await expect(page.locator(".game-card")).toHaveCount(1);
  await search.fill("definitely-no-such-team");
  await expect(page.getByText("No matchups found.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".game-card")).toHaveCount(
    slate.games.filter((g: any) => g.league === "NFL").length,
  );
  const columns = await page
    .locator(".game-grid")
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
  await page.goto("/");
  await page.getByRole("button", { name: "College football" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("day and watchability filters narrow the board", async ({ page }) => {
  await page.goto("/");
  const nfl = slate.games.filter((g: any) => g.league === "NFL");
  const sunday = nfl.filter((g: any) => g.meta.startsWith("Sun ")).length;
  await page.getByRole("button", { name: "Sunday", exact: true }).click();
  await expect(page.locator(".game-card")).toHaveCount(sunday);
  await page.getByRole("button", { name: "All days", exact: true }).click();
  await page.getByRole("button", { name: "Must watch", exact: true }).click();
  await expect(page.locator(".game-card")).toHaveCount(
    nfl.filter((g: any) => g.score >= 90).length,
  );
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(".game-card")).toHaveCount(nfl.length);
  const scores = await page
    .locator(".score strong")
    .evaluateAll((els) => els.map((e) => Number(e.textContent)));
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
});

test("season form chart, trends panel and network logos render", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /College football/ }).click();
  const card = page.locator(".game-card").first();
  await expect(card.locator(".form-row")).toHaveCount(2);
  await card.locator(".form .mb-svg rect").first().focus();
  await expect(card.locator(".mb-tip")).toBeVisible();
  await card.locator("summary", { hasText: "Season trends" }).click();
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
  await page.goto("/");
  const league = results.games.some((r: any) => r.league === "NFL") ? "NFL" : "CFB";
  if (league === "CFB") await page.getByRole("button", { name: /^College football/ }).click();
  await page.getByRole("button", { name: /^Final/ }).click();
  const expected = results.games.filter((r: any) => r.league === league);
  await expect(page.locator(".result-card")).toHaveCount(expected.length);
  const top = [...expected].sort((a: any, b: any) => b.actual.score - a.actual.score)[0];
  const card = page.locator(".result-card").first();
  await expect(card.locator(".fva-box.actual strong")).toHaveText(String(top.actual.score));
  await expect(card.locator(".fva-box").first().locator("strong")).toHaveText(String(top.forecast.score));
  await expect(card.locator(".readout-head")).toHaveText(top.readout.headline);
  await expect(card.locator(".ls-total").first()).toHaveText(String(top.teams[0].score));
  if (top.scoreCheck) {
    await expect(card.locator(".sc-head")).toHaveText(top.scoreCheck.headline);
    await expect(card.locator(".sc-box").first()).toContainText(`${top.scoreCheck.projected.away}–${top.scoreCheck.projected.home}`);
  }
  await card.locator("summary").filter({ hasText: "Why it scored" }).click();
  const rows = card.locator(".breakdown tbody tr");
  await expect(rows).toHaveCount(top.actual.parts.length + 2);
  if (top.wp.length >= 8) {
    await expect(card.locator(".wp svg")).toBeVisible();
    await card.locator(".wp svg rect[tabindex='0']").first().focus();
    await expect(card.locator(".wp-tip")).toBeVisible();
  }
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  // Back to upcoming: every card explains its forecast.
  await page.getByRole("button", { name: /^Upcoming/ }).click();
  const g = page.locator(".game-card").first();
  await expect(page.locator(".game-card .proj")).toHaveCount(
    slate.games.filter((x: any) => x.league === league && x.projected).length,
  );
  const withWp = slate.games.filter((x: any) => x.league === league && x.winProb).length;
  await expect(page.locator(".game-card .pwp")).toHaveCount(withWp);
  await expect(page.locator(".pwp-bar").first()).toBeVisible();
  await g.locator("summary").filter({ hasText: "Why it's a" }).click();
  await expect(g.locator(".breakdown .bd-total td")).toHaveText(await g.locator(".score strong").innerText());
  expect(errors).toEqual([]);
});

test("TV grid lays out every game by network and time, lighting good games and dimming bad ones", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/");
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
      const score = Number(await g.locator(".tv-score").innerText());
      const cls = (await g.getAttribute("class")) ?? "";
      if (score >= 74) expect(cls).toContain("hl");
      if (score < 64) expect(cls).toContain("dim");
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
  await page.goto("/");
  await page.locator(".export summary").click();
  await expect(page.locator(".export-menu a[href='/exports/watch-slate.csv']")).toBeVisible();
  await expect(page.getByRole("button", { name: /Download.*JPG/ })).toHaveCount(0);
  const card = page.locator(".game-card").first();
  const adv = card.locator("summary").filter({ hasText: "Advanced stats" });
  if (await adv.count()) {
    await adv.click();
    await expect(card.locator(".adv-table tbody tr").first()).toBeVisible();
  }
});

test("times default to Central, follow the chosen zone, and the TV grid JPG downloads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".kickoff").first()).toContainText("CT");
  await page.selectOption(".tz-pick select", "America/New_York");
  await expect(page.locator(".kickoff").first()).toContainText("ET");
  await page.reload();
  await expect(page.locator(".kickoff").first()).toContainText("ET");
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
  await page.goto("/");
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
  await page.goto("/");
  // Upcoming game: pregame view
  await page.locator(".game-card .gc-open").first().click();
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
    await page.getByRole("button", { name: /^Final/ }).click();
    await page.getByPlaceholder("Search teams, TV…").fill("Bills");
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
  await page.goto("/");
  await page.getByRole("button", { name: /^Final/ }).click();
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
  await page.goto("/");
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
  await page.goto("/");
  await page.getByRole("button", { name: /^Insanity/ }).click();
  const rows = page.locator(".ib-row");
  await expect(rows.first()).toBeVisible();
  // Ranked most insane first, with scores in range.
  const scoresOf = async () => (await page.locator(".ib-row .ib-score strong").allInnerTexts()).map(Number);
  const nfl = await scoresOf();
  expect(nfl.length).toBeGreaterThan(0);
  expect(nfl).toEqual([...nfl].sort((a, b) => b - a));
  expect(Math.max(...nfl)).toBeLessThanOrEqual(100);
  // The week-by-week list names the wildest game of each week.
  await expect(page.locator(".ib-weeks li").first()).toContainText("wildest:");
  // College is ranked separately and the season scope works.
  await page.locator(".ib [aria-label='League'] button", { hasText: "College" }).click();
  await expect(page.locator(".ib-row").first()).toBeVisible();
  const cfb = await scoresOf();
  expect(cfb).toEqual([...cfb].sort((a, b) => b - a));
  await page.locator(".ib [aria-label='Ranking'] button", { hasText: "Season" }).click();
  await expect(page.locator(".ib-heading, .tv-heading h2")).toContainText("season ranking");
  await expect(page.locator(".ib-row").first()).toContainText("Sept.");
  // Filters bar is not shown here, and the page does not scroll sideways.
  await expect(page.locator(".filter-dock")).toHaveCount(0);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);
});
