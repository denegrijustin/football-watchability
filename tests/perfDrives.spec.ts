import { test, expect, type Page } from "./fixtures";
import { readFileSync, existsSync } from "node:fs";
import { stubFinals } from "./helpers/finals";
import type { PerfData } from "../src/perf/types";
import { DEFAULT_SELECTION } from "../src/perf/types";
import { driveStats, drivesOf, gamesFor, leagueAverage, summarize } from "../src/perf/engine";
import {
  NO_FILTER, bigPlaysByDrive, buildGameDrives, driveCards, driveSlot, drivesTakeaway, filterDrives, kindOf, optionCounts, oppRowOf, parseDriveSlot,
  playsForDrive, poss, resolveTeamId, type LogPlay,
} from "../src/perf/drivesCalc";
import { goPerf } from "./helpers/perf";

const data: PerfData = JSON.parse(readFileSync("src/data/perf-nfl.json", "utf8"));
const SEL = { ...DEFAULT_SELECTION, team: "SEA" };
const rowsOf = (team: string) => data.rows.filter((r) => r.t === team).sort((a, b) => a.w - b.w);

test.beforeEach(async ({ page }) => { await stubFinals(page); });

test.describe("Drives: the numbers", () => {
  test("drive counts and points reconcile with a recomputation straight from the JSON", () => {
    for (const team of ["SEA", "KC", "DEN"]) {
      let n = 0, pts = 0, td = 0, fg = 0, threeOut = 0;
      for (const r of rowsOf(team)) for (const d of r.d) {
        if (d[6] === 7) continue; // kneel-downs at the end of a half or game are not drives
        n++; pts += d[7]; if (d[6] === 0) td++; if (d[6] === 1) fg++; if (d[3] <= 3 && d[6] === 2) threeOut++;
      }
      const s = driveStats(rowsOf(team), "all");
      expect(s.drives).toBe(n);
      expect(s.td).toBe(td);
      expect(s.fg).toBe(fg);
      expect(s.threeAndOuts).toBe(threeOut);
      expect(s.pointsPerDrive).toBeCloseTo(pts / n, 10);
      // the game-by-game field lists add up to the same season figures, for the team and (as the defense) for its opponents
      const games = gamesFor(data, team, { ...DEFAULT_SELECTION, team });
      const own = games.flatMap((g) => buildGameDrives(data, g, "all").filter((d) => d.side === "team"));
      const theirs = games.flatMap((g) => buildGameDrives(data, g, "all").filter((d) => d.side === "opp"));
      expect(own.length).toBe(s.drives);
      expect(own.reduce((a, d) => a + d.tuple[7], 0)).toBe(pts);
      expect(theirs.length).toBe(summarize(data, team, { ...DEFAULT_SELECTION, team }).drivesAgainst.drives);
    }
  });

  test("skipping garbage time removes drives, and the list agrees with the engine", () => {
    const all = drivesOf(data.rows, "all").length, skip = drivesOf(data.rows, "skip").length;
    expect(skip).toBeLessThan(all);
    const team = data.rows.find((r) => r.d.some((d) => d[10] === 1))!;
    expect(buildGameDrives(data, team, "skip").length).toBeLessThan(buildGameDrives(data, team, "all").length);
    expect(buildGameDrives(data, team, "skip").every((d) => d.tuple[10] === 0)).toBe(true);
  });

  test("filters by team, half, quarter and outcome narrow the list exactly", () => {
    const row = rowsOf("SEA").at(-1)!;
    const all = buildGameDrives(data, row, "all");
    const indep = (f: (p: number, res: number, side: string) => boolean) => all.filter((d) => f(d.tuple[0], d.tuple[6], d.side)).length;
    expect(filterDrives(all, { ...NO_FILTER, team: "opp" }).length).toBe(indep((_p, _r, s) => s === "opp"));
    expect(filterDrives(all, { ...NO_FILTER, half: "1" }).length).toBe(indep((p) => p <= 2));
    expect(filterDrives(all, { ...NO_FILTER, half: "2" }).length).toBe(indep((p) => p === 3 || p === 4));
    expect(filterDrives(all, { ...NO_FILTER, quarter: "3" }).length).toBe(indep((p) => p === 3));
    expect(filterDrives(all, { ...NO_FILTER, outcome: "td" }).length).toBe(indep((_p, r) => r === 0));
    expect(filterDrives(all, { ...NO_FILTER, outcome: "turnover" }).length).toBe(indep((_p, r) => r === 3 || r === 4));
    // combined filters are an intersection, and a contradictory pair is empty
    expect(filterDrives(all, { team: "team", half: "2", quarter: "4", outcome: "punt" }).length).toBe(indep((p, r, s) => s === "team" && p === 4 && r === 2));
    expect(filterDrives(all, { ...NO_FILTER, half: "1", quarter: "3" })).toEqual([]);
    // option counts promise exactly what the list would show
    const counts = optionCounts(all, { ...NO_FILTER, half: "2" }, "quarter");
    expect(counts.get("3")).toBe(filterDrives(all, { ...NO_FILTER, half: "2", quarter: "3" }).length);
    expect(counts.get("1") ?? 0).toBe(0);
  });

  test("defensive scores and safeties are kept apart from offensive touchdowns", () => {
    expect(kindOf(0)).toBe("td");
    expect(kindOf(8)).toBe("against");
    expect(kindOf(9)).toBe("against");
    expect(kindOf(9)).not.toBe(kindOf(0));
    expect(data.rows.some((r) => r.d.some((d) => d[6] === 9))).toBe(true);
    const row = data.rows.find((r) => r.d.some((d) => d[6] === 9))!;
    const against = buildGameDrives(data, row, "all").filter((d) => d.kind === "against");
    expect(against.length).toBeGreaterThan(0);
    expect(against.every((d) => d.tuple[7] === 0)).toBe(true);
  });

  test("the drives are placed on one field: the team goes right, the opponent goes left", () => {
    const row = rowsOf("SEA")[0];
    for (const d of buildGameDrives(data, row, "all")) {
      expect(d.x0).toBeGreaterThanOrEqual(0); expect(d.x0).toBeLessThanOrEqual(100);
      if (d.side === "team") { expect(d.x1).toBeGreaterThanOrEqual(d.x0); expect(d.x0).toBe(100 - d.tuple[2]); }
      else { expect(d.x1).toBeLessThanOrEqual(d.x0); expect(d.x0).toBe(d.tuple[2]); }
    }
  });

  test("big plays are matched to drives by the clock and stay with the right team", () => {
    let total = 0, matched = 0;
    for (const row of data.rows.filter((r) => r.w <= 3)) {
      const opp = oppRowOf(data, row);
      if (!opp || row.t > opp.t) continue;
      const m = bigPlaysByDrive(data, row);
      for (const [key, plays] of m) {
        const [team, idx] = key.split(":");
        expect(row.t === team || opp.t === team).toBe(true);
        const r = row.t === team ? row : opp;
        expect(r.d[Number(idx)]).toBeTruthy();
        matched += plays.length;
      }
      total += row.k.length + opp.k.length;
    }
    expect(total).toBeGreaterThan(50);
    expect(matched / total).toBeGreaterThan(0.95);
  });

  test("the sentence follows fixed rules and hedges small samples", () => {
    const s = summarize(data, "SEA", SEL), l = leagueAverage(data, SEL);
    const t = drivesTakeaway({ name: "Seahawks", benchName: "the league average", stats: s.drives, bench: l.drives, game: null });
    expect(t.text).toContain(`${s.drives.drives} drives`);
    expect(t.text).toContain((s.drives.pointsPerDrive as number).toFixed(2));
    expect(t.small).toBeUndefined();
    const hi = { ...l.drives, pointsPerDrive: (s.drives.pointsPerDrive as number) - 0.5 };
    const lo = { ...l.drives, pointsPerDrive: (s.drives.pointsPerDrive as number) + 0.5 };
    const mid = { ...l.drives, pointsPerDrive: (s.drives.pointsPerDrive as number) + 0.05 };
    expect(drivesTakeaway({ name: "A", benchName: "B", stats: s.drives, bench: hi, game: null }).text).toContain("better than B");
    expect(drivesTakeaway({ name: "A", benchName: "B", stats: s.drives, bench: lo, game: null }).text).toContain("behind B");
    expect(drivesTakeaway({ name: "A", benchName: "B", stats: s.drives, bench: mid, game: null }).text).toContain("about the same as B");
    // for the defense, giving up fewer points is the better result
    expect(drivesTakeaway({ side: "def", name: "A", benchName: "B", stats: s.drives, bench: lo, game: null }).text).toContain("better than B");
    const one = summarize(data, "SEA", { ...SEL, window: "recent", recentN: 1 });
    expect(drivesTakeaway({ name: "A", benchName: null, stats: one.drives, bench: null, game: null }).small).toContain("early read");
    expect(drivesTakeaway({ name: "A", benchName: null, stats: driveStats([], "all"), bench: null, game: null }).text).toContain("no drives");
    const cards = driveCards(s.drives, l.drives);
    expect(cards.map((c) => c.id)).toEqual(["ppd", "scoring", "td", "threeOut", "start"]);
    expect(cards[0].value).toBe(s.drives.pointsPerDrive);
    expect(poss("Seahawks")).toBe("Seahawks'");
    expect(poss("Bama")).toBe("Bama's");
  });

  test("the selection slot only carries a drive to its own game", () => {
    expect(parseDriveSlot(driveSlot("2026_01_NE_SEA", "SEA:4"))).toEqual({ game: "2026_01_NE_SEA", key: "SEA:4" });
    expect(parseDriveSlot("passOff")).toBeNull();
    expect(parseDriveSlot(null)).toBeNull();
  });

  test("plays are matched to a drive by team and clock, and an honest no-match comes back when they cannot be", () => {
    const row = rowsOf("SEA").find((r) => r.d.some((d) => d[0] === 2 && d[3] > 3))!;
    const d = buildGameDrives(data, row, "all").find((x) => x.side === "team" && x.period === 2 && x.tuple[3] > 3)!;
    const mk = (id: string, team: string, secsIntoDrive: number): LogPlay => {
      const left = 2 * 900 - (d.tuple[1] + secsIntoDrive);
      return { id, team, period: 2, clock: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, text: id, kind: "Rush", yards: 3, score: false, turnover: false };
    };
    const log = [mk("a", "10", 0), mk("b", "10", 20), mk("other-team", "20", 10), { ...mk("late", "10", d.tuple[5] + 200), period: 2 }];
    const m = playsForDrive(log, "10", d, 0);
    expect(m.ok && m.plays.map((p) => p.id)).toEqual(["a", "b"]);
    const none = playsForDrive([mk("x", "20", 5)], "10", d, 0);
    expect(none.ok).toBe(false);
    const teams = [{ id: "10", abbr: "SEA", homeAway: "home", score: 20 }, { id: "20", abbr: "DEN", homeAway: "away", score: 14 }];
    expect(resolveTeamId(teams, { team: "SEA", abbr: "SEA", pf: 1, pa: 2, home: false })).toBe("10");
    expect(resolveTeamId([{ id: "1", abbr: "X", homeAway: "home", score: 20 }, { id: "2", abbr: "Y", homeAway: "away", score: 14 }], { team: "SEA", abbr: "SEA", pf: 14, pa: 20, home: true })).toBe("2");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
const openDrives = async (page: Page) => {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "NFL+" }).click();
  await goPerf(page, "Drives");
  await expect(page.locator(".dv-lane > button").first()).toBeVisible({ timeout: 15_000 });
};
const latest = rowsOf("SEA").at(-1)!;
const expectedLane = (f: (d: ReturnType<typeof buildGameDrives>[number]) => boolean = () => true) => buildGameDrives(data, latest, "all").filter(f).length;

test.describe("Drives: the tab", () => {
  test("@smoke it opens on the team's latest game with one lane per drive and the season cards", async ({ page }) => {
    await openDrives(page);
    await expect(page.locator(".dv-lane > button")).toHaveCount(expectedLane());
    await expect(page.locator(".dv-card")).toHaveCount(5);
    await expect(page.locator(".ptake")).toContainText("points per drive");
    await expect(page.locator(".dv-gsel")).toHaveValue(latest.g);
    await expect(page.locator(".dv-count")).toContainText(`Showing ${expectedLane()} of ${expectedLane()} drives`);
  });

  test("outcome, team, half and quarter filters narrow the lanes by the same counts as the data", async ({ page }) => {
    await openDrives(page);
    const lanes = page.locator(".dv-lane > button");
    const tds = expectedLane((d) => d.kind === "td");
    await page.locator(".dv-chip", { hasText: /^TD/ }).click();
    await expect(lanes).toHaveCount(tds);
    await expect(page.locator(".dv-count")).toContainText(`Showing ${tds} of ${expectedLane()}`);
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(lanes).toHaveCount(expectedLane());
    const oppName = await page.locator(".dv-filters .seg").first().getByRole("button").nth(2).innerText();
    await page.locator(".dv-filters .seg").first().getByRole("button").nth(2).click();
    await expect(lanes).toHaveCount(expectedLane((d) => d.side === "opp"));
    expect(oppName).toContain("Donkeys");
    await page.locator(".dv-filters .seg").first().getByRole("button").first().click();
    await page.locator(".dv-filters [aria-label=Half]").getByRole("button", { name: /^1st/ }).click();
    await expect(lanes).toHaveCount(expectedLane((d) => d.period <= 2));
    await page.locator(".dv-filters [aria-label=Quarter]").getByRole("button", { name: /^Q2/ }).click();
    await expect(lanes).toHaveCount(expectedLane((d) => d.period === 2));
    // a quarter with no drives in the chosen half cannot be picked
    await expect(page.locator(".dv-filters [aria-label=Quarter]").getByRole("button", { name: /^Q3/ })).toBeDisabled();
  });

  test("garbage time can be skipped and the lane count follows", async ({ page }) => {
    await openDrives(page);
    const withGarbage = data.rows.filter((r) => rowsOf("SEA").includes(r)).find((r) => buildGameDrives(data, r, "skip").length < buildGameDrives(data, r, "all").length);
    test.skip(!withGarbage, "no SEA game has garbage time in this data");
    await page.locator(".dv-gsel").selectOption(withGarbage!.g);
    await expect(page.locator(".dv-lane > button")).toHaveCount(buildGameDrives(data, withGarbage!, "all").length);
    await page.getByRole("button", { name: /Included/ }).click();
    await expect(page.locator(".dv-lane > button")).toHaveCount(buildGameDrives(data, withGarbage!, "skip").length);
  });

  test("selecting a drive opens its details, and Escape and the keyboard work", async ({ page }) => {
    await openDrives(page);
    const lanes = page.locator(".dv-lane > button");
    await lanes.nth(2).focus();
    await page.keyboard.press("ArrowDown");
    await expect(lanes.nth(3)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(lanes.nth(2)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(lanes.nth(2)).toHaveAttribute("aria-expanded", "true");
    const detail = page.locator(".dv-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("started at");
    await expect(detail.locator(".kv")).toContainText("Plays");
    await expect(detail.getByRole("button", { name: "Show the plays" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
    await expect(lanes.nth(2)).toHaveAttribute("aria-expanded", "false");
    // tapping another lane moves the detail
    await lanes.nth(5).click();
    await expect(lanes.nth(5)).toHaveAttribute("aria-expanded", "true");
    await expect(detail).toHaveCount(1);
  });

  test("Show the plays loads the Game Center list and shows only that drive's plays; a game it cannot match says so", async ({ page }) => {
    const ours = buildGameDrives(data, latest, "all").filter((d) => d.side === "team" && d.period < 5 && d.tuple[3] >= 3 && d.period * 900 - (d.tuple[1] + 14) > 0 && d.tuple[5] > 20)[0];
    const clock = (secs: number) => { const left = ours.period * 900 - (ours.tuple[1] + secs); return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; };
    let calls = 0;
    await page.route("**/api/game?**", (r) => {
      calls++;
      return r.fulfill({
        json: {
          teams: [{ id: "11", abbr: "SEA", homeAway: latest.h === 1 ? "home" : "away", score: latest.pf }, { id: "22", abbr: "OPP", homeAway: latest.h === 1 ? "away" : "home", score: latest.pa }],
          log: [
            { id: "p1", team: "11", period: ours.period, clock: clock(2), text: "FIRST PLAY OF THE DRIVE", kind: "Rush", yards: 4, score: false, turnover: false },
            { id: "p2", team: "11", period: ours.period, clock: clock(14), text: "SECOND PLAY OF THE DRIVE", kind: "Pass Reception", yards: 9, score: false, turnover: false },
            { id: "px", team: "22", period: ours.period, clock: clock(10), text: "OTHER TEAM PLAY", kind: "Rush", yards: 1, score: false, turnover: false },
          ],
        },
      });
    });
    await openDrives(page);
    const idx = buildGameDrives(data, latest, "all").findIndex((d) => d.key === ours.key);
    await page.locator(".dv-lane > button").nth(idx).click();
    await page.getByRole("button", { name: "Show the plays" }).click();
    const box = page.locator(".dv-playbox");
    await expect(box).toContainText("FIRST PLAY OF THE DRIVE");
    await expect(box).toContainText("SECOND PLAY OF THE DRIVE");
    await expect(box).not.toContainText("OTHER TEAM PLAY");
    expect(calls).toBe(1);
    // an opponent drive in a game whose log has no plays for that side: honest message, no invented plays
    const theirs = buildGameDrives(data, latest, "all").findIndex((d) => d.side === "opp" && d.period < 5);
    await page.locator(".dv-lane > button").nth(theirs).click();
    await page.getByRole("button", { name: "Show the plays" }).click();
    await expect(page.locator(".dv-playbox")).toContainText("could not tell which plays");
    await expect(page.locator(".dv-playbox").getByRole("link", { name: /ESPN/ })).toBeVisible();
    expect(calls).toBe(1);
  });

  test("a failed play-list request explains itself and can be retried", async ({ page }) => {
    await page.route("**/api/game?**", (r) => r.fulfill({ status: 502, json: { error: "ESPN 502" } }));
    await page.route("https://site.api.espn.com/**", (r) => r.fulfill({ status: 503, body: "no" }));
    await openDrives(page);
    await page.locator(".dv-lane > button").first().click();
    await page.getByRole("button", { name: "Show the plays" }).click();
    await expect(page.locator(".dv-playbox [role=alert]")).toContainText("could not be loaded");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("the game and the selected drive persist across tabs", async ({ page }) => {
    await openDrives(page);
    const earlier = rowsOf("SEA")[1];
    await page.locator(".dv-gsel").selectOption(earlier.g);
    await expect(page.locator(".dv-lane > button")).toHaveCount(buildGameDrives(data, earlier, "all").length);
    await page.locator(".dv-lane > button").nth(1).click();
    await goPerf(page, "Team Profile");
    await expect(page.locator(".phd h1")).toHaveText("Team Profile");
    await goPerf(page, "Drives");
    await expect(page.locator(".dv-gsel")).toHaveValue(earlier.g);
    await expect(page.locator(".dv-lane > button").nth(1)).toHaveAttribute("aria-expanded", "true");
    // changing the team clears the game
    await page.locator(".pcontrols").getByLabel("Team").selectOption("DEN");
    await expect(page.locator(".dv-gsel")).toHaveValue(rowsOf("DEN").at(-1)!.g);
  });

  test("the defense side and the benchmark control change the cards", async ({ page }) => {
    await openDrives(page);
    await expect(page.locator(".dv-h")).toContainText("Seahawks' drives");
    await page.locator(".pcontrols").getByRole("button", { name: "Defense" }).click();
    await expect(page.locator(".dv-h")).toContainText("Opponents' drives against Seahawks");
    await expect(page.locator(".ptake p").first()).toContainText("Opponents scored on");
    await page.locator(".pcontrols").getByRole("button", { name: "None" }).click();
    await expect(page.locator(".dv-card small").first()).not.toContainText("league");
  });

  test("every mark has a text label, and the page does not scroll sideways", async ({ page }) => {
    await openDrives(page);
    const n = await page.locator(".dv-lane > button").count();
    expect(n).toBeGreaterThan(5);
    for (let i = 0; i < n; i++) await expect(page.locator(".dv-lane > button .dv-res span:last-child").nth(i)).not.toBeEmpty();
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw + 1);
  });

  test("on a 390px phone nothing overflows, even with a drive open", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "the mobile project is the 390px phone");
    await openDrives(page);
    await page.locator(".dv-lane > button").nth(3).click();
    await page.getByRole("button", { name: "Show the plays" }).click();
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw + 1);
    const box = await page.locator(".dv-field").boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    const lane = await page.locator(".dv-lane > button").first().boundingBox();
    expect(lane!.height).toBeGreaterThanOrEqual(36);
  });

  test("the tooltip appears on hover and Escape closes it", async ({ page }) => {
    test.skip(test.info().project.name === "mobile", "hover is a desktop interaction");
    await openDrives(page);
    await page.locator(".dv-lane > button").nth(1).hover();
    await expect(page.locator(".dv-field .tip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".dv-field .tip")).toHaveCount(0);
  });

  test("a team with no games under the settings gets an explanation, not a blank", async ({ page }) => {
    await page.route("**/data/perf-nfl.json*", (r) => r.fulfill({ json: { ...data, rows: [] } }));
    await page.goto("/?league=NFL");
    await page.getByRole("button", { name: "NFL+" }).click();
    await goPerf(page, "Drives");
    await expect(page.locator(".empty")).toContainText("No games with play-by-play data yet");
  });
});

test("college: the Drives tab opens when the college file exists", async ({ page }) => {
  test.skip(!existsSync("src/data/perf-cfb.json"), "perf-cfb.json is not in this checkout");
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await goPerf(page, "Drives");
  await expect(page.locator(".dv-card").first()).toBeVisible({ timeout: 20_000 });
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw + 1);
});

