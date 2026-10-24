import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));

test("the small card is laid out like the NHL's: one top row with the channel and the Game Center, the record beside the name", async ({ page }) => {
  await page.goto("/?league=NFL");
  const card = page.locator(".game-card.compact").first();
  await expect(card).toBeVisible();
  const top = card.locator(".cc-top");
  await expect(top.locator(".cc-network")).toBeVisible();
  await expect(top.locator(".cc-gc")).toBeVisible(); // GC sits in the top row, beside the channel
  await expect(card.locator(".cc-actions .cc-gc")).toHaveCount(0);
  const [net, gc, when] = await Promise.all([top.locator(".cc-network").boundingBox(), top.locator(".cc-gc").boundingBox(), top.locator(".cc-when").boundingBox()]);
  expect(Math.abs(net!.y + net!.height / 2 - (gc!.y + gc!.height / 2))).toBeLessThan(14); // on the same line
  expect(when!.x).toBeLessThan(net!.x);
  expect(gc!.x).toBeGreaterThan(net!.x);
  // A team's record sits on the line with its name when there is room, so each team is one or two short lines.
  const teams = card.locator(".cc-team");
  await expect(teams).toHaveCount(2);
  const first = await teams.first().locator("h4").boundingBox();
  const record = await teams.first().locator("p").boundingBox();
  expect(record!.y).toBeLessThan(first!.y + first!.height + 10); // (the score ring takes a little width, so a long name can push the record a few pixels down)
  // The card is short: it used to be well over 500px tall.
  expect((await card.boundingBox())!.height).toBeLessThan(490);
  // The details are still one tap away.
  await expect(card.locator(".card-toggle")).toHaveCount(1);
  await expect(card.locator(".rank-line, .booth")).toHaveCount(0);
});

test("before kickoff the small card shows the line, the projected score and a win-probability bar instead of an empty momentum plot", async ({ page }) => {
  await page.goto("/?league=NFL");
  const card = page.locator(".game-card.compact").first();
  await expect(card.locator(".cl")).toBeVisible();
  await expect(card.locator(".cl-chip").first()).toContainText(/O\/U|PK|\+|-/);
  await expect(card.locator(".cl-bar")).toHaveAttribute("aria-label", /Win probability: .* favored/);
  await expect(card.locator(".momentum-flow")).toHaveCount(0);
});

test("the Game Center is a scoreboard with tabs; only the open tab is drawn, and the arrow keys move between them", async ({ page }) => {
  await page.goto("/?league=NFL");
  await page.locator(".game-card.compact .cc-gc").first().click();
  const gc = page.locator("dialog.gc");
  await expect(gc.locator(".gc-head")).toBeVisible();
  const tabs = gc.getByRole("tab");
  // Before kickoff: the overview, and the matchup and season analysis.
  await expect(tabs).toHaveText(["Overview", "Matchup & season"]);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(gc.getByRole("tabpanel")).toContainText("Projection");
  await expect(gc.locator(".matchup-engine")).toHaveCount(0); // not drawn until its tab is open
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(gc.locator(".matchup-engine")).toBeVisible();
  await expect(gc.locator(".gc-livefield, .gc-panel h3").filter({ hasText: /^Projection$/ })).toHaveCount(0);
  await page.keyboard.press("Home");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  // Opening another game starts on its overview.
  await tabs.nth(1).click();
  await page.keyboard.press("Escape");
  await page.locator(".game-card.compact .cc-gc").nth(1).click();
  await expect(gc.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
  void slate;
});

test("a game under way gets Team stats, Plays & drives and Players tabs, each holding its own panels", async ({ page }) => {
  const fx = readFileSync("tests/fixtures/game-nfl-log.json", "utf8");
  const lastKickoff = Math.max(...slate.games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: lastKickoff + 6 * 3600e3 });
  await page.route("**/api/game**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: fx }));
  await page.route("https://site.api.espn.com/**", (r) => r.abort());
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "Show completed games", exact: true }).click();
  await page.locator(".game-card .card-toggle").first().click();
  await page.locator(".game-card .gc-open").first().click();
  const gc = page.locator("dialog.gc");
  const tabs = gc.getByRole("tab");
  await expect(tabs.first()).toBeVisible();
  const names = await tabs.allInnerTexts();
  expect(names.slice(0, 4)).toEqual(["Overview", "Team stats", "Plays & drives", "Players"]);
  const open = async (name: string) => {
    await gc.getByRole("tab", { name }).click();
    return gc.getByRole("tabpanel");
  };
  await expect(await open("Team stats")).toContainText(/Team stats|Who's tilting the field/);
  await expect(gc.locator(".gc-top")).toHaveCount(0);
  await expect(await open("Plays & drives")).toContainText(/Drive chart/);
  await expect(await open("Players")).toContainText(/Top 3 \/ bottom 3/);
  await expect(gc.locator(".gc-drives")).toHaveCount(0); // the drive chart is on another tab now
  await expect(await open("Overview")).toContainText(/Projection|Game flow/);
});
