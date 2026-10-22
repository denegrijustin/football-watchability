import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";
import { buildModel } from "../src/spplus/data/model";
import { freshCfbModel } from "../src/spplus/data/freshLines";
import { freshNfl, lineTextFor, type Line } from "../src/lines";
import type { NflData } from "../src/nfl/types";

const model = buildModel(JSON.parse(readFileSync("src/data/spplus.json", "utf8")));
const nfl: NflData = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));

const line = (o: Partial<Line>): Line => ({ id: "1", league: "NFL", date: "2030-01-01T00:00Z", state: "pre", homeId: "h", awayId: "a", homeAbbr: "CHI", awayAbbr: "NE", homeName: "Chicago Bears", awayName: "New England Patriots", spread: -3, total: 50.5, provider: "DraftKings", ...o });

test("a fresh NFL spread replaces the saved one with nflverse's sign (positive when the home team is favored), and games already played are left alone", () => {
  const g = nfl.games.find((x) => x.type === "REG" && x.aS == null && x.espn)!;
  const played = nfl.games.find((x) => x.type === "REG" && x.aS != null && x.espn)!;
  const lines = new Map<string, Line>([[g.espn!, line({ id: g.espn!, spread: -7, total: 41 })], [played.espn!, line({ id: played.espn!, spread: -7, total: 41 })]]);
  const out = freshNfl(nfl, lines);
  expect(out.games.find((x) => x.id === g.id)).toMatchObject({ spread: 7, total: 41 });
  expect(out.games.find((x) => x.id === played.id)!.spread).toBe(played.spread);
  expect(freshNfl(nfl, new Map())).toBe(nfl);
});

test("the college picks are worked out again against a fresh line: SP+'s margin against the new spread decides the side", () => {
  const p = model.projections.find((x) => x.week === model.latest && x.projMargin != null && x.atsPick)!;
  const espn: Record<string, string> = { H: p.home, A: p.away };
  // The home team a 40-point favorite: SP+ (whatever its margin) likes the road team against that.
  const big = freshCfbModel(model, new Map([["x", line({ id: "x", league: "CFB", homeId: "H", awayId: "A", spread: -40, total: 60 })]]), espn);
  const q = big.projections.find((x) => x.id === p.id)!;
  expect(q.atsPick).toBe(p.away);
  expect(q.spreadPts).toBe(40);
  expect(q.ou).toBe(60);
  // The road team a 40-point favorite: SP+ likes the home team.
  const flip = freshCfbModel(model, new Map([["x", line({ id: "x", league: "CFB", homeId: "H", awayId: "A", spread: 40 })]]), espn);
  expect(flip.projections.find((x) => x.id === p.id)!.atsPick).toBe(p.home);
  // Nothing to match: the model comes back as it was.
  expect(freshCfbModel(model, new Map(), espn)).toBe(model);
});

test("a game card's line is written the way the board writes it", () => {
  const teams = [{ name: "New England Patriots", abbr: "NE" }, { name: "Chicago Bears", abbr: "CHI" }];
  expect(lineTextFor(line({}), teams, "NFL")).toBe("Bears -3 • O/U 50.5");
  expect(lineTextFor(line({ spread: 2.5 }), teams, "NFL")).toBe("Patriots -2.5 • O/U 50.5");
  expect(lineTextFor(line({ spread: 0, total: null }), teams, "NFL")).toBe("PK");
  expect(lineTextFor(line({ homeAbbr: "ZZZ" }), teams, "NFL")).toBeNull();
});

test("the Parlays view loads the current lines once, says when they are from, and the refresh button waits before it calls again", async ({ page }) => {
  await stubFinals(page);
  let calls = 0;
  await page.route("**/api/odds**", (r) => { calls++; return r.fulfill({ json: { at: Date.now() - 4 * 60_000, league: new URL(r.request().url()).searchParams.get("league"), week: 7, games: [] } }); });
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: /^Outlook/ }).click();
  await page.getByRole("group", { name: "Outlook section" }).getByRole("button", { name: "Parlays" }).click();
  await expect(page.locator(".lb")).toContainText("Lines from", { timeout: 20_000 });
  await expect(page.locator(".lb")).toContainText("4 min ago");
  expect(calls).toBe(2); // one call per league
  await expect(page.getByRole("button", { name: "Refresh lines" })).toBeEnabled();
});

test("when ESPN cannot be reached the page says so and keeps the saved lines", async ({ page }) => {
  await stubFinals(page);
  await page.route("**/api/odds**", (r) => r.fulfill({ status: 502, json: { error: "ESPN 503" } }));
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: /^Outlook/ }).click();
  await page.getByRole("group", { name: "Outlook section" }).getByRole("button", { name: "Parlays" }).click();
  await expect(page.locator(".lb")).toContainText("could not reach ESPN", { timeout: 20_000 });
  await expect(page.locator(".pl-slip").first()).toBeVisible();
});
