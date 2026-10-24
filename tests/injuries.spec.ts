import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
import { impactScore, impactTier, nameKey, parseTimeline, percentile, returnInfo, severityOf, typeWeeks } from "../scripts/injuries-lib.mjs";
import { stubFinals } from "./helpers/finals";

const NOW = Date.parse("2026-10-24T18:00:00Z");

test("a timeline in a note is read: season, a range of weeks, week to week, day to day", () => {
  expect(parseTimeline("He is out for the season after tearing his ACL.")?.season).toBe(true);
  expect(parseTimeline("Expected to miss 4-6 weeks.")?.weeks).toEqual([4, 6]);
  expect(parseTimeline("Will miss two weeks with the sprain.")?.weeks).toEqual([2, 2]);
  expect(parseTimeline("He is week-to-week.")?.weeks).toEqual([1, 3]);
  expect(parseTimeline("Day-to-day.")?.weeks).toEqual([0, 1]);
  expect(parseTimeline("Practiced in full on Friday.")).toBeNull();
});

test("when a player is likely back: ESPN's date first, then the note, then what is typical for the injury", () => {
  const espn = returnInfo({ status: "Out", returnDate: "2026-11-07", type: "Knee", now: NOW });
  expect(espn.source).toBe("ESPN");
  expect(espn.weeks[0]).toBeGreaterThanOrEqual(1);
  expect(espn.label).toContain("Nov 7");
  expect(returnInfo({ status: "Questionable", returnDate: "2026-10-25", now: NOW }).label).toBe("Could play this weekend");
  const note = returnInfo({ status: "Out", type: "Shoulder", note: "He will miss 3-5 weeks.", now: NOW });
  expect([note.source, note.weeks]).toEqual(["reported", [3, 5]]);
  const typical = returnInfo({ status: "Out", type: "Hamstring", now: NOW });
  expect([typical.source, typical.weeks]).toEqual(["estimate", [2, 4]]);
  expect(returnInfo({ status: "Injured Reserve", type: "Ankle", now: NOW }).weeks[0]).toBeGreaterThanOrEqual(4); // IR is at least four games
  expect(returnInfo({ status: "Injured Reserve", type: "ACL", now: NOW, weeksLeft: 11 }).season).toBe(true);
  expect(typeWeeks("Undisclosed", null)).toEqual([1, 4]);
});

test("severity follows the longest the player could miss", () => {
  const sev = (status: string, o: object) => severityOf({ status, ret: returnInfo({ status, now: NOW, ...o }) });
  expect(sev("Injured Reserve", { type: "ACL", weeksLeft: 11 })).toBe("Season-ending");
  expect(sev("Injured Reserve", { type: "Ankle" })).toBe("Long-term");
  expect(sev("Out", { type: "Hamstring" })).toBe("Short-term");
  expect(sev("Questionable", { type: "Groin" })).toBe("Game-time");
  expect(sev("Out", { returnDate: "2026-10-25" })).toBe("Game-time");
});

test("impact is how much the team leaned on the player: snaps and where his production ranks, with a position weight", () => {
  expect(percentile([1, 2, 3, 4], 4)).toBeCloseTo(0.875, 3);
  expect(percentile([], 1)).toBeNull();
  const star = impactScore({ group: "QB", usage: 1, prod: 0.95 }), backup = impactScore({ group: "WR", usage: 0.2, prod: 0.3 });
  expect(star).toBeGreaterThan(90);
  expect(backup).toBeLessThan(30);
  expect(impactScore({ group: "OL", usage: 1, prod: null })).toBeLessThan(70); // linemen: snaps only, never rated High on snaps alone
  expect(impactScore({ group: "ST", usage: 1, prod: 1 })).toBeLessThan(70);
  expect([impactTier(75), impactTier(50), impactTier(25), impactTier(5), impactTier(null)]).toEqual(["High", "Medium", "Low", "Minimal", "Unknown"]);
  expect(nameKey("Jon Gaines II")).toBe(nameKey("Jon Gaines"));
});

test("the saved report: every NFL player has an injury, a severity, a return and an impact with the season it is based on", () => {
  const d = JSON.parse(readFileSync("src/data/injuries.json", "utf8"));
  expect(d.nfl.players.length).toBeGreaterThan(50);
  for (const p of d.nfl.players) {
    expect(["Season-ending", "Long-term", "Short-term", "Game-time"]).toContain(p.severity);
    expect(p.ret.label.length).toBeGreaterThan(3);
    expect(["High", "Medium", "Low", "Minimal", "Unknown"]).toContain(p.impact.tier);
    expect(p.impact.basis.length).toBeGreaterThan(3);
    if (p.impact.score != null) expect(p.impact.basis).toMatch(/^(\d{4}) season/);
  }
  // last season fills in when a player has no games this season
  expect(d.nfl.players.some((p: any) => p.impact.basis.startsWith(String(d.nfl.season - 1)))).toBe(true);
});

test.describe("the Injuries tab", () => {
  test.beforeEach(async ({ page }) => { await stubFinals(page); });

  test("it is on the menu and lists each injury, how serious it is, when the player is back and the impact of his absence", async ({ page }) => {
    await page.goto("/?league=NFL");
    await page.locator('.view-switch [data-tab="injuries"]').evaluate((b) => (b as HTMLElement).click());
    const card = page.locator(".jc").first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    // a few words each: injury, status, back; an animated figure of the injured area; the impact with a bar
    await expect(card.locator(".jc-facts dd")).toHaveCount(3);
    await expect(card.locator(".jc-sev")).toBeVisible();
    await expect(card.locator(".jc-facts div").nth(2)).toContainText("Back");
    await expect(card.locator(".ifig svg")).toBeVisible();
    await expect(card.locator(".jc-top b")).toContainText(/impact/i);
    await expect(card.locator(".jc-head, .headshot-fallback").first()).toBeVisible();
    // filters and sort
    await page.getByLabel("Severity", { exact: true }).selectOption("Season-ending");
    await expect(page.locator(".jc-sev:not(.seasonending)")).toHaveCount(0);
    await page.getByLabel("Severity", { exact: true }).selectOption("all");
    await page.getByLabel("Impact", { exact: true }).selectOption("high");
    await expect(page.locator(".jc-impact.tier-medium, .jc-impact.tier-low")).toHaveCount(0);
    await page.getByRole("group", { name: "Sort by" }).getByRole("button", { name: "Back soonest" }).click();
    await expect(page.locator(".ij-asof")).toContainText("back soonest first");
    await page.getByRole("group", { name: "League" }).getByRole("button", { name: "College" }).click();
    await expect(page.locator(".ij-asof")).toContainText("Conference reports");
  });
});

test.describe("injuries on the game card", () => {
  test.beforeEach(async ({ page }) => { await stubFinals(page); });

  test("a card shows its key injuries in one line, and the expanded card lists each team's injuries with the reason for the impact", async ({ page }) => {
    await page.goto("/?league=NFL");
    const strip = page.locator(".gi-strip").first();
    await expect(strip).toBeVisible({ timeout: 15_000 });
    await expect(strip.locator(".gi-chip").first()).toContainText(/impact|High|Medium/i);
    const id = await page.locator(".game-card:has(.gi-strip)").first().getAttribute("data-game-id");
    const card = page.locator(`.game-card[data-game-id="${id}"]`);
    await card.locator(".card-toggle").first().click();
    const sec = card.locator(".gi-fold");
    await expect(sec).toBeVisible();
    await expect(sec.locator(".gi-team").first()).toBeHidden(); // an option you open, not the whole expanded card
    await sec.locator("summary").first().click();
    await expect(sec.locator(".gi-team")).toHaveCount(2);
    await expect(sec.locator(".gi-head, .headshot-fallback").first()).toBeVisible(); // the player's picture
    await expect(sec.locator(".gi-sev").first()).toBeVisible();
    await expect(sec.locator(".gi-line").first()).toContainText("·"); // the injury and when he is back, on one line
    await expect(sec.locator(".ifig svg").first()).toBeVisible(); // the figure of the injured area
    await sec.getByRole("button", { name: /All injuries/ }).click();
    await expect(page.locator(".ij").first()).toBeVisible({ timeout: 15_000 });
  });

  test("college cards carry the week's availability the same way", async ({ page }) => {
    await page.goto("/?league=CFB");
    await expect(page.locator(".game-card .gi-strip, .game-card .gi").first()).toBeAttached({ timeout: 15_000 });
  });
});

test("the Game Center's injury report is the same compact view, closed until opened", async ({ page }) => {
  await stubFinals(page);
  await page.goto("/?league=NFL");
  const id = await page.locator(".game-card:has(.gi-strip)").first().getAttribute("data-game-id");
  const card = page.locator(`.game-card[data-game-id="${id}"]`);
  await card.getByRole("button", { name: /Game Center/ }).first().click();
  const gc = page.getByRole("dialog");
  await gc.getByRole("tab", { name: /Matchup|Forecast|Season stats/ }).click();
  const opt = gc.locator("details", { has: page.locator("summary", { hasText: "Injury report" }) });
  await expect(opt).toBeVisible();
  await opt.locator("summary").first().click();
  await expect(opt.locator(".gi-team")).toHaveCount(2);
  await expect(opt.locator(".gi-head, .headshot-fallback").first()).toBeVisible();
  await expect(opt.locator(".ifig svg").first()).toBeVisible();
});

test("the injury figure lights the right spot, on the right side", async () => {
  const { bodyRegion } = await import("../src/bodyMap");
  const knee = bodyRegion("Knee", "Leg", null, "Left");
  expect(knee.key).toBe("knee");
  expect(knee.hits).toHaveLength(1);
  expect(knee.hits[0].x).toBeGreaterThan(65); // a player's left side is the right of the picture
  expect(bodyRegion("Knee", "Leg", null, "Right").hits[0].x).toBeLessThan(65);
  expect(bodyRegion("Knee", "Leg", null, null).hits).toHaveLength(2); // side not given: both, softly
  expect(bodyRegion("Concussion", "Head").effect).toBe("ripple");
  expect(bodyRegion("Hamstring").key).toBe("thigh");
  expect(bodyRegion("Illness").key).toBeNull();
  expect(bodyRegion("Undisclosed").label).toBe("Area not disclosed");
  expect(bodyRegion("Undisclosed", "Leg").key).toBe("calf"); // no type, so the broad location is the best guess
});
