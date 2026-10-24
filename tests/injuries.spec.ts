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
    const card = page.locator(".ij-card").first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator(".ij-injury")).not.toBeEmpty();
    await expect(card.locator(".ij-sev")).toBeVisible();
    await expect(card.locator(".ij-back")).not.toBeEmpty();
    await expect(card.locator(".ij-imp-head")).toContainText("Impact of the absence");
    await expect(card.locator(".ij-basis")).toContainText("Based on:");
    // filters and sort
    await page.getByLabel("Severity", { exact: true }).selectOption("Season-ending");
    await expect(page.locator(".ij-sev:not(.seasonending)")).toHaveCount(0);
    await page.getByLabel("Severity", { exact: true }).selectOption("all");
    await page.getByLabel("Impact", { exact: true }).selectOption("high");
    await expect(page.locator(".ij-imp-head .tier-medium, .ij-imp-head .tier-low")).toHaveCount(0);
    await page.getByRole("group", { name: "Sort by" }).getByRole("button", { name: "Back soonest" }).click();
    await expect(page.locator(".ij-asof")).toContainText("back soonest first");
    await page.getByRole("group", { name: "League" }).getByRole("button", { name: "College" }).click();
    await expect(page.locator(".ij-asof")).toContainText("Conference availability");
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
    const sec = card.locator(".gi");
    await expect(sec).toBeVisible();
    await expect(sec.locator(".gi-team")).toHaveCount(2);
    await sec.locator(".gi-row summary").first().click();
    await expect(sec.locator(".gi-more").first()).toContainText("Based on:");
    await expect(sec.locator(".gi-sev").first()).toBeVisible();
    await sec.getByRole("button", { name: /Full injury report/ }).click();
    await expect(page.locator(".ij").first()).toBeVisible({ timeout: 15_000 });
  });

  test("college cards carry the week's availability the same way", async ({ page }) => {
    await page.goto("/?league=CFB");
    await expect(page.locator(".game-card .gi-strip, .game-card .gi").first()).toBeAttached({ timeout: 15_000 });
  });
});
