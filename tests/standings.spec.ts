import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
import { byConference, parseCfb, parseNfl, share, teamRow } from "../scripts/standings-lib.mjs";
import { stubFinals } from "./helpers/finals";

const ctx = { logoFor: () => ({ id: "x" }) };
const entry = (name: string, stats: Record<string, string>) => ({ team: { id: name, displayName: name, shortDisplayName: name, abbreviation: name.slice(0, 3).toUpperCase() }, stats: Object.entries(stats).map(([type, displayValue]) => ({ type, displayValue })) });

test("a team row reads the overall and conference records, points and streak from ESPN's stats", () => {
  const r = teamRow(entry("Ohio State", { total: "7-1", vsconf: "4-1", pointsfor: "260", pointsagainst: "120", pointdifferential: "+140", streak: "W3", playoffseed: "2", leaguewinpercent: "0.800" }), ctx);
  expect([r.w, r.l, r.overall, r.conf, r.pf, r.pa, r.diff, r.streak, r.seed]).toEqual([7, 1, "7-1", "4-1", 260, 120, 140, "W3", 2]);
  expect(teamRow(entry("Idle", { total: "0-0", streak: "-" }), ctx).streak).toBeNull();
});

test("college teams are ordered by conference record, then overall, then point differential", () => {
  const a = teamRow(entry("A", { total: "6-0", vsconf: "2-1", leaguewinpercent: "1", pointdifferential: "+90" }), ctx);
  const b = teamRow(entry("B", { total: "5-2", vsconf: "3-0", leaguewinpercent: ".714", pointdifferential: "+20" }), ctx);
  const c = teamRow(entry("C", { total: "5-2", vsconf: "3-0", leaguewinpercent: ".714", pointdifferential: "+50" }), ctx);
  expect([a, b, c].sort(byConference).map((t) => t.name)).toEqual(["C", "B", "A"]);
  expect(share("3-1-1")).toBeCloseTo(3.5 / 5, 5);
});

test("a conference split into divisions (the Sun Belt) is one conference whose teams carry their division", () => {
  const leaf = (n: string, short: string, teams: string[]) => ({ name: n, shortName: short, standings: { entries: teams.map((t) => entry(t, { total: "3-1", vsconf: "2-0" })) } });
  const out = parseCfb({ season: { year: 2026 }, children: [{ name: "FBS", children: [] }, { name: "Sun Belt Conference", shortName: "Sun Belt", children: [leaf("Sun Belt - East", "Sun Belt - East", ["JMU"]), leaf("Sun Belt - West", "Sun Belt - West", ["Troy"])] }, leaf("Southeastern Conference", "SEC", ["Georgia"])] }, ctx);
  expect(out.conferences.map((c: any) => c.name).sort()).toEqual(["SEC", "Sun Belt"]);
  expect(out.conferences.find((c: any) => c.name === "Sun Belt").teams.map((t: any) => t.division).sort()).toEqual(["East", "West"]);
  const nfl = parseNfl({ season: { year: 2026 }, children: [{ name: "American Football Conference", abbreviation: "AFC", children: [{ name: "AFC East", standings: { entries: [entry("Buffalo", { total: "5-1" })] } }] }] }, ctx);
  expect(nfl.conferences[0].divisions[0].teams[0].name).toBe("Buffalo");
});

test("the saved standings cover every NFL team in four divisions a side and the college conferences", () => {
  const d = JSON.parse(readFileSync("src/data/standings.json", "utf8"));
  expect(d.nfl.conferences.map((c: any) => c.name)).toEqual(["AFC", "NFC"]);
  for (const c of d.nfl.conferences) { expect(c.divisions).toHaveLength(4); for (const dv of c.divisions) expect(dv.teams).toHaveLength(4); }
  expect(d.cfb.conferences.length).toBeGreaterThanOrEqual(10);
  expect(d.cfb.conferences.some((c: any) => c.name === "SEC")).toBe(true);
});

test.describe("the Standings tab", () => {
  test.beforeEach(async ({ page }) => { await stubFinals(page); });

  test("it is on the menu: NFL by division with seeds, college by conference, and a conference picker", async ({ page }) => {
    await page.goto("/?league=NFL");
    await page.locator('.view-switch [data-tab="standings"]').evaluate((b) => (b as HTMLElement).click());
    await expect(page.locator(".sd-block").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".sd-table")).toHaveCount(4); // the four divisions of the conference shown
    await expect(page.locator(".sd-seeds li").first()).toContainText(/\d-\d/); // the playoff picture
    await expect(page.locator(".sd-table tbody tr")).toHaveCount(16);
    await page.getByRole("group", { name: "Conference" }).getByRole("button", { name: "NFC" }).click();
    await expect(page.locator(".sd-block h3").nth(1)).toContainText("NFC");
    await page.getByRole("group", { name: "League" }).getByRole("button", { name: "College" }).click();
    await expect(page.locator(".sd-leaders .sd-block").first()).toBeVisible(); // every conference's leaders
    await page.getByRole("group", { name: "Conference" }).getByRole("button", { name: "SEC" }).click();
    const rows = page.locator(".sd-table tbody tr");
    expect(await rows.count()).toBeGreaterThanOrEqual(14);
    await expect(page.locator(".sd-table thead")).toContainText("Conf");
    await expect(rows.first().locator(".sd-conf")).toContainText(/\d-\d/);
  });
});
