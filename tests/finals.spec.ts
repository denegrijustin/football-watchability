import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
import { buildLite } from "../src/spplus/liteBuild";
import { buildModel } from "../src/spplus/data/model";
import { atsGames, recordText, tally } from "../src/spplus/data/ats";
import { liveResults } from "../src/spplus/data/finals";
import { withNflFinals } from "../src/nfl/finals";
import { atsGames as nflAtsGames } from "../src/nfl/model";
import type { NflData } from "../src/nfl/types";
import { finalFromEvent, mergeFinals, type Final } from "../src/finals";
import { parseFinal, mergeFinals as mergeLib } from "../scripts/finals-lib.mjs";
import { stubFinals } from "./helpers/finals";

const snapshot = JSON.parse(readFileSync("src/data/spplus.json", "utf8"));
const lite = buildLite(snapshot, JSON.parse(readFileSync("src/data/team-ids.json", "utf8")));
const model = buildModel(snapshot);
const nfl: NflData = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));
const espnOf = (sheetName: string) => Object.entries(lite.espn).find(([, n]) => n === sheetName)?.[0];

/** A final for a graded SP+ pick, as ESPN would report it (ids from the sheet-to-ESPN map), with the pick covering by `cover`. */
function finalFor(g: ReturnType<typeof atsGames>[number], cover: number, id = "9000001"): Final {
  const pickIsAway = g.pick === g.away;
  const line = g.spreadPts === 0 ? 0 : g.pickIsFavorite ? g.spreadPts : -g.spreadPts;
  const margin = Math.round(line + cover);
  const pickPts = 30 + Math.max(0, margin), otherPts = 30 + Math.max(0, -margin);
  const side = (name: string, s: number) => ({ id: espnOf(name)!, n: name, ab: name.slice(0, 4).toUpperCase(), s });
  const [a, h] = pickIsAway ? [side(g.away, pickPts), side(g.home, otherPts)] : [side(g.away, otherPts), side(g.home, pickPts)];
  return { l: "cfb", id, date: `${g.date}T20:00Z`, week: g.week, ot: 0, neutral: g.neutral ? 1 : 0, a, h };
}
const sheetWithout = (g: { date: string; away: string; home: string }) => ({
  ...model,
  results: model.results.filter((r) => !(Math.abs(Date.parse(r.date) - Date.parse(g.date)) <= 864e5 && ((r.team === g.away && r.opp === g.home) || (r.team === g.home && r.opp === g.away)))),
});
const gradedFbs = atsGames(model).filter((g) => g.group === "fbs" && espnOf(g.away) && espnOf(g.home));

test.describe("finals fill in the SP+ ATS record before the sheet does", () => {
  const target = gradedFbs.find((g) => g.coverBy > 1.5)!;

  test("a final for a pick the sheet has not recorded is graded, and the record moves by one", () => {
    const sheet = sheetWithout(target);
    const before = tally(atsGames(sheet));
    expect(atsGames(sheet).some((g) => g.id === target.id)).toBe(false);
    const extra = liveResults(sheet, [finalFor(target, target.coverBy)], lite.espn);
    expect(extra).toHaveLength(2);
    const after = atsGames({ ...sheet, liveResults: extra });
    const graded = after.find((g) => g.id === target.id)!;
    expect(graded.result).toBe(target.result);
    expect(graded.coverBy).toBeCloseTo(target.coverBy, 0);
    expect(after.length).toBe(before.n + 1);
    expect(tally(after)).toEqual(tally(atsGames(model)));
  });

  test("the result follows the score: the same game covered, then missed", () => {
    const sheet = sheetWithout(target);
    const covered = atsGames({ ...sheet, liveResults: liveResults(sheet, [finalFor(target, 3)], lite.espn) }).find((g) => g.id === target.id)!;
    const missed = atsGames({ ...sheet, liveResults: liveResults(sheet, [finalFor(target, -3)], lite.espn) }).find((g) => g.id === target.id)!;
    expect(covered.result).toBe("win");
    expect(missed.result).toBe("loss");
  });

  test("a game the sheet already has is not counted twice", () => {
    expect(liveResults(model, [finalFor(target, target.coverBy)], lite.espn)).toEqual([]);
    expect(tally(atsGames({ ...model, liveResults: liveResults(model, [finalFor(target, target.coverBy)], lite.espn) }))).toEqual(tally(atsGames(model)));
  });

  test("NFL finals and games without a pick change nothing", () => {
    const nflFinal: Final = { l: "nfl", id: "1", date: "2026-10-04T17:00Z", week: 4, ot: 0, neutral: 0, a: { id: "1", n: "A", ab: "A", s: 1 }, h: { id: "2", n: "B", ab: "B", s: 2 } };
    expect(liveResults(model, [nflFinal], lite.espn)).toEqual([]);
  });

  test("an FCS opponent is matched by name to the sheet's own schedule", () => {
    const small = atsGames(model).find((g) => g.group === "fcs");
    test.skip(!small, "no FBS-vs-FCS pick graded yet");
    const fbs = [small!.away, small!.home].find((t) => espnOf(t))!;
    const fcs = small!.away === fbs ? small!.home : small!.away;
    const pickIsFbs = small!.pick === fbs;
    const sheet = sheetWithout(small!);
    const fbsWins = pickIsFbs ? small!.margin > 0 : small!.margin < 0;
    const f: Final = {
      l: "cfb", id: "9000002", date: `${small!.date}T20:00Z`, week: small!.week, ot: 0, neutral: 0,
      a: small!.away === fbs ? { id: espnOf(fbs)!, n: fbs, ab: "F", s: fbsWins ? 40 : 10 } : { id: "99999", n: fcs, ab: "X", s: fbsWins ? 10 : 40 },
      h: small!.home === fbs ? { id: espnOf(fbs)!, n: fbs, ab: "F", s: fbsWins ? 40 : 10 } : { id: "99999", n: fcs, ab: "X", s: fbsWins ? 10 : 40 },
    };
    const rows = liveResults(sheet, [f], lite.espn);
    expect(rows.map((r) => r.opp).sort()).toEqual([fbs, fcs].sort());
  });
});

test.describe("finals fill in the NFL+ ATS record before nflverse does", () => {
  const played = nflAtsGames(nfl);
  const target = played.find((g) => Math.abs(g.coverBy) > 1)!;
  const gameOf = (id: string) => nfl.games.find((g) => g.id === id)!;
  const blank = (id: string): NflData => ({ ...nfl, games: nfl.games.map((g) => (g.id === id ? { ...g, aS: null, hS: null, ot: 0 } : g)) });
  const finalOf = (id: string): Final => {
    const g = gameOf(id);
    return { l: "nfl", id: g.espn!, date: `${g.date}T20:00Z`, week: g.week, ot: g.ot, neutral: g.neutral, a: { id: "1", n: g.away, ab: g.away, s: g.aS! }, h: { id: "2", n: g.home, ab: g.home, s: g.hS! } };
  };

  test("the score comes from ESPN's final and the pick is graded", () => {
    const withoutScore = blank(target.id);
    expect(nflAtsGames(withoutScore).some((g) => g.id === target.id)).toBe(false);
    const filled = withNflFinals(withoutScore, [finalOf(target.id)]);
    expect(nflAtsGames(filled).find((g) => g.id === target.id)?.result).toBe(target.result);
    expect(tally(nflAtsGames(filled))).toEqual(tally(played));
  });

  test("nflverse's own score is never overwritten, and with nothing new the same object comes back", () => {
    const changed: Final = { ...finalOf(target.id), a: { id: "1", n: "x", ab: "x", s: 0 }, h: { id: "2", n: "y", ab: "y", s: 99 } };
    expect(withNflFinals(nfl, [changed])).toBe(nfl);
    expect(withNflFinals(nfl, [])).toBe(nfl);
    expect(withNflFinals(blank(target.id), [{ ...finalOf(target.id), l: "cfb" }]).games.find((g) => g.id === target.id)?.aS).toBeNull();
  });

  test("overtime is carried over", () => {
    const withoutScore = blank(target.id);
    const f = { ...finalOf(target.id), ot: 1 };
    expect(withNflFinals(withoutScore, [f]).games.find((g) => g.id === target.id)?.ot).toBe(1);
  });
});

test.describe("reading ESPN's events", () => {
  const event = (over: Record<string, unknown> = {}, state = "post") => ({
    id: "401", date: "2026-10-10T19:30Z", week: { number: 6 },
    status: { type: { state, completed: state === "post", shortDetail: "Final/OT" } },
    competitions: [{ neutralSite: true, competitors: [
      { homeAway: "home", score: "27", team: { id: "201", location: "Oklahoma", abbreviation: "OU" } },
      { homeAway: "away", score: "24", team: { id: "251", location: "Texas", abbreviation: "TEX" } },
    ] }],
    ...over,
  });
  test("a final becomes one record; the browser and the refresh script read it the same way", () => {
    const g = finalFromEvent("cfb", event())!;
    expect(g).toEqual({ l: "cfb", id: "401", date: "2026-10-10T19:30Z", week: 6, ot: 1, neutral: 1, a: { id: "251", n: "Texas", ab: "TEX", s: 24 }, h: { id: "201", n: "Oklahoma", ab: "OU", s: 27 } });
    expect(parseFinal("cfb", event())).toEqual(g);
  });
  test("games not over, or without a score, are not finals", () => {
    expect(finalFromEvent("cfb", event({}, "in"))).toBeNull();
    expect(finalFromEvent("cfb", event({}, "pre"))).toBeNull();
    const noScore = event();
    (noScore.competitions[0].competitors[0] as { score: string }).score = "";
    expect(finalFromEvent("cfb", noScore)).toBeNull();
    expect(parseFinal("cfb", noScore)).toBeNull();
  });
  test("the newest copy of a game wins, in both places that merge", () => {
    const a = finalFromEvent("cfb", event())!;
    const b = { ...a, a: { ...a.a, s: 31 } };
    expect(mergeFinals([a], [b])[0].a.s).toBe(31);
    expect(mergeLib([a], [b])).toHaveLength(1);
    expect(mergeFinals([a], [{ ...a, l: "nfl" as const }])).toHaveLength(2);
  });
});

test.describe("the trackers update in the open tab when a game ends", () => {
  test("SP+: a final that arrives after the page loaded moves the record", async ({ page }) => {
    test.skip(test.info().project.name === "mobile", "same behaviour at any width");
    const target = gradedFbs.find((g) => g.coverBy > 1.5 && g.group === "fbs")!;
    const sheet = sheetWithout(target);
    const snap = structuredClone(snapshot);
    const results = snap.sheets.find((s: { name: string }) => s.name === "POSTGAME WIN EXPECTANCY");
    const keep = new Set(sheet.results.map((r) => r.row));
    results.rows = results.rows.map((row: unknown[], i: number) => (i === 0 || keep.has(i + 1) || !row[1] ? row : (row.slice(0, 10).map(() => null) as unknown[]).concat(row.slice(10))));
    const nothing = tally(atsGames(buildModel(snap)));
    expect(nothing.n).toBe(tally(atsGames(model)).n - 1);

    await page.route("**/data/spplus.json", (r) => r.fulfill({ json: snap }));
    await page.route("**/data/spplus-lite.json", (r) => r.fulfill({ json: lite }));
    let ended = false;
    await page.route("**/data/finals.json", (r) => r.fulfill({ json: { updated: "2026-10-14T00:00:00Z", season: 2026, games: [] } }));
    await page.route("**/api/scores**", (r) => {
      const url = r.request().url();
      if (!url.includes("full=1")) return r.fulfill({ json: [] });
      return r.fulfill({ json: ended && url.includes("league=cfb") ? [finalFor(target, target.coverBy)] : [] });
    });
    await page.route("https://site.api.espn.com/**", (r) => r.fulfill({ json: { events: [] } }));
    await page.goto("/?league=CFB");
    await page.getByRole("button", { name: "CFB SP+" }).click();
    await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible({ timeout: 15_000 });
    await page.locator(".spp").getByRole("tab", { name: "ATS tracker" }).click();
    await expect(page.locator(".spp .atshead")).toContainText(recordText(tally(atsGames(buildModel(snap)).filter((g) => g.group === "fbs"))));
    ended = true;
    // The open tab checks ESPN every two minutes and again whenever it is shown; show it now.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator(".spp .atshead")).toContainText(recordText(tally(atsGames(model).filter((g) => g.group === "fbs"))));
  });
});

test("NFL+: a final that arrives after the page loaded moves the ATS record", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "same behaviour at any width");
  const played = nflAtsGames(nfl);
  const target = played.find((g) => Math.abs(g.coverBy) > 1)!;
  const game = nfl.games.find((g) => g.id === target.id)!;
  const blanked: NflData = { ...nfl, games: nfl.games.map((g) => (g.id === target.id ? { ...g, aS: null, hS: null, ot: 0 } : g)) };
  const without = tally(nflAtsGames(blanked));
  expect(without.n).toBe(played.length - 1);
  await page.route("**/data/nfl.json", (r) => r.fulfill({ json: blanked }));
  await page.route("**/data/finals.json", (r) => r.fulfill({ json: { updated: "2026-10-14T00:00:00Z", season: 2026, games: [] } }));
  let ended = false;
  const final: Final = { l: "nfl", id: game.espn!, date: `${game.date}T20:00Z`, week: game.week, ot: game.ot, neutral: game.neutral, a: { id: "1", n: game.away, ab: game.away, s: game.aS! }, h: { id: "2", n: game.home, ab: game.home, s: game.hS! } };
  await page.route("**/api/scores**", (r) => {
    const url = r.request().url();
    return url.includes("full=1") ? r.fulfill({ json: ended && url.includes("league=nfl") ? [final] : [] }) : r.fulfill({ json: [] });
  });
  await page.route("https://site.api.espn.com/**", (r) => r.fulfill({ json: { events: [] } }));
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "NFL+" }).click();
  await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible({ timeout: 15_000 });
  await page.locator(".spp").getByRole("tab", { name: "ATS tracker" }).click();
  await expect(page.locator(".spp .atshead")).toContainText(recordText(without));
  ended = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".spp .atshead")).toContainText(recordText(tally(played)));
});
