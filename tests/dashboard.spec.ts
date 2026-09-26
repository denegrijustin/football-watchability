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
