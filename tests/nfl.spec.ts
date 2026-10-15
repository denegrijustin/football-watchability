import { test, expect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import type { NflData, NflGame } from "../src/nfl/types";
import { atsGames, logoSlug, pickFor, projectGameRow, projectNfl, ratingsAt, teamRows } from "../src/nfl/model";
import { gameFacts } from "../src/nfl/context";
import { recordText, tally } from "../src/spplus/data/ats";
import { forEachRow } from "../scripts/nflverse/csv.mjs";
import { ols } from "../scripts/nflverse/calibrate.mjs";
import { solve } from "../scripts/nflverse/ratings.mjs";
import { stubFinals } from "./helpers/finals";

test.beforeEach(async ({ page }) => { await stubFinals(page); });

const nfl: NflData = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));
const logos = JSON.parse(readFileSync("src/data/logos.json", "utf8")) as Record<string, string>;
const upcoming = nfl.games.find((g) => g.type === "REG" && g.aS == null && g.spread != null && g.espn)!;

const openTab = async (page: Page) => {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "NFL+" }).click();
  await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible({ timeout: 15_000 });
};

/** Turn the first NFL game on the board into a game that is in the nflverse file, whatever week the slate is from. */
async function withNflGame(page: Page, g: NflGame, espn = g.espn) {
  const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
  const x = slate.games.find((q: { league: string }) => q.league === "NFL");
  x.espnId = espn;
  x.matchup = `${nfl.teams[g.away].name} @ ${nfl.teams[g.home].name}`;
  x.date = `${g.date}T20:00Z`;
  x.status = "pre";
  x.teams[0] = { ...x.teams[0], name: nfl.teams[g.away].name, abbr: g.away, logoId: logoSlug(nfl.teams[g.away].name) };
  x.teams[1] = { ...x.teams[1], name: nfl.teams[g.home].name, abbr: g.home, logoId: logoSlug(nfl.teams[g.home].name) };
  await page.route("**/data/slate.json", (r) => r.fulfill({ json: slate }));
  await page.route("**/data/nfl.json", (r) => r.fulfill({ json: nfl }));
  return x;
}

test.describe("the NFL+ tab", () => {
  test("@smoke it sits with the other tabs and opens on the ratings table of all 32 teams", async ({ page }) => {
    await openTab(page);
    await expect(page.getByRole("button", { name: "NFL+" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".spp .tbl tbody tr:not(.detail)")).toHaveCount(32);
    for (const name of ["Ratings", "Simulator", "ATS tracker", "Matchups", "Movement", "Team"]) await expect(page.locator(".spp").getByRole("tab", { name })).toBeVisible();
    await expect(page.locator(".spp .foot")).toContainText("nflverse");
    expect(await page.getByTestId("nfl-host").evaluate((el) => !!el.shadowRoot)).toBe(true);
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw + 1);
  });

  test("ratings are ranked, filter by conference and division, and expand to every number", async ({ page }) => {
    await openTab(page);
    const rows = page.locator(".spp .tbl tbody tr:not(.detail)");
    const top = teamRows(nfl, nfl.ratingsThroughWeek).sort((a, b) => a.rank.sp - b.rank.sp);
    await expect(rows.first()).toContainText(top[0].name.replace("Broncos", "Donkeys"));
    await page.locator(".spp").getByLabel("Group").selectOption("AFC");
    await expect(rows).toHaveCount(16);
    await page.locator(".spp").getByLabel("Group").selectOption("NFC East");
    await expect(rows).toHaveCount(4);
    await page.locator(".spp").getByLabel("Group").selectOption("");
    await page.locator(".spp").getByLabel("Search teams").fill("bears");
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole("button", { name: "Show details" }).click();
    await expect(page.locator(".spp tr.detail")).toContainText("Special teams / rank");
    await expect(page.locator(".spp tr.detail")).toContainText("of 4 in the NFC North");
  });

  test("the simulator opens on a scheduled game with expected points, and the basis can be switched", async ({ page }) => {
    await openTab(page);
    await page.locator(".spp").getByRole("tab", { name: "Simulator" }).click();
    const pts = page.locator(".spp .simpts");
    await expect(pts).toHaveCount(2);
    for (const t of await pts.allInnerTexts()) expect(Number(t)).toBeGreaterThan(8);
    const bar = page.locator('.spp [role="img"][aria-label^="Win probability"]');
    const before = await bar.getAttribute("aria-label");
    await expect(page.locator(".spp").getByText("basis: closing line")).toBeVisible();
    await page.locator(".spp").getByRole("radio", { name: "Ratings only" }).click();
    await expect(page.locator(".spp").getByText("basis: team ratings")).toBeVisible();
    expect(await bar.getAttribute("aria-label")).not.toBe(before);
    await page.locator(".spp").getByRole("radio", { name: "Neutral" }).click();
    await page.locator(".spp").getByRole("button", { name: "Swap teams" }).click();
    await expect(page.locator(".spp").getByLabel("Home team")).not.toHaveValue("");
    await expect(page.locator(".spp").getByText("How this model has done")).toBeVisible();
  });

  test("a spread and total give cover and over probabilities", async ({ page }) => {
    await openTab(page);
    await page.locator(".spp").getByRole("tab", { name: "Simulator" }).click();
    await page.locator(".spp").getByRole("button", { name: "Use the closing line" }).click();
    const lines = page.locator(".spp .panel", { hasText: "Against a line" });
    await expect(lines).toContainText("covers");
    await expect(lines).toContainText("Over");
    const pcts = (await lines.locator("td.num").allInnerTexts()).slice(0, 2).map((t) => parseFloat(t));
    expect(pcts[0] + pcts[1]).toBeGreaterThan(97);
  });

  test("the ATS tracker grades each ratings pick against the closing spread", async ({ page }) => {
    await openTab(page);
    await page.locator(".spp").getByRole("tab", { name: "ATS tracker" }).click();
    const season = tally(atsGames(nfl));
    const head = page.locator(".spp .atshead");
    await expect(head).toContainText(recordText(season));
    await expect(head).toContainText("52.4%");
    const weeks = [...new Set(atsGames(nfl).map((g) => g.week))];
    await expect(page.locator('.spp svg[aria-label^="Weekly against-the-spread"] g.pt')).toHaveCount(weeks.length);
    await expect(page.locator(".spp .panel", { hasText: "Week by week" }).locator("tbody tr")).toHaveCount(weeks.length + 1);
    await expect(page.getByText(/the same picks went \d+-\d+-\d+/)).toBeVisible();
    const list = page.locator(".spp").getByRole("region", { name: "Graded picks" });
    await list.locator("tbody tr").first().getByRole("button", { name: "Show details" }).click();
    await expect(list.locator("tr.detail").first()).toContainText("Game id (nflverse)");
  });

  test("matchups: ratings against the line, a game's setting, and a link into the simulator", async ({ page }) => {
    await openTab(page);
    await page.locator(".spp").getByRole("tab", { name: "Matchups" }).click();
    await page.locator('.spp svg[aria-label="Ratings margin and closing spread for each game"] g.pt').first().click();
    const side = page.locator(".spp .sticky-side");
    await expect(side).toContainText("Closing spread / total");
    await expect(side).toContainText("Setting");
    await side.getByRole("button", { name: "Simulate this game" }).click();
    await expect(page.locator(".spp").getByRole("tab", { name: "Simulator" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".spp .simpts")).toHaveCount(2);
  });

  test("movement and team views render for any team", async ({ page }) => {
    await openTab(page);
    await page.locator(".spp").getByRole("tab", { name: "Movement" }).click();
    const bump = page.locator('.spp svg[aria-label="Bump chart of rating rank by week"]');
    await expect(bump).toBeVisible();
    await expect(bump.locator("path")).toHaveCount(12);
    await page.locator(".spp").getByRole("tab", { name: "Team" }).click();
    await page.locator('.spp select[aria-label="Team"]').selectOption("KC");
    await expect(page.locator(".spp h2", { hasText: "Kansas City Chiefs" })).toBeVisible();
    await expect(page.locator('.spp svg[aria-label^="Kansas City Chiefs league percentile"] g.pt')).toHaveCount(4 * nfl.ratingsThroughWeek);
  });
});

test.describe("NFL Game Center", () => {
  test("shows the simulated score, the setting, and opens the simulator on the game", async ({ page }) => {
    await withNflGame(page, upcoming);
    await page.goto("/?league=NFL");
    const name = `${nfl.teams[upcoming.away].name} @ ${nfl.teams[upcoming.home].name}`.replace("Broncos", "Donkeys");
    await page.getByRole("button", { name: `Open Game Center for ${name}` }).first().click();
    const dialog = page.getByRole("dialog");
    const block = dialog.getByTestId("gc-nfl");
    await expect(block).toBeVisible();
    const p = projectGameRow(nfl, upcoming, { n: 6000 })!;
    await expect(block).toContainText("Simulated score");
    await expect(block.locator(".gc-spp-score")).toContainText(p.sim.meanA.toFixed(1));
    await expect(block.locator(".gc-spp-score")).toContainText(p.sim.meanB.toFixed(1));
    await expect(block).toContainText("Centered on the closing line");
    await expect(block).toContainText("6,000 simulated games");
    await expect(dialog.getByTestId("gc-nfl-setting")).toBeVisible();
    const facts = gameFacts(nfl, upcoming);
    if (facts.length) await expect(dialog.getByTestId("gc-nfl-setting")).toContainText(facts[0][0]);
    await block.getByRole("button", { name: /Open in NFL+/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "NFL+" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".spp").getByRole("tab", { name: "Simulator" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".spp").getByLabel("Away team")).toHaveValue(upcoming.away);
    await expect(page.locator(".spp").getByLabel("Home team")).toHaveValue(upcoming.home);
  });

  test("a game that is not in the nflverse file, or a failed load, leaves the Game Center as it was", async ({ page }) => {
    await withNflGame(page, upcoming, "999999999");
    await page.goto("/?league=NFL");
    await page.getByRole("button", { name: /Open Game Center for/ }).first().click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Projection" })).toBeVisible();
    await expect(page.getByTestId("gc-nfl")).toHaveCount(0);
    await expect(page.getByTestId("gc-nfl-setting")).toHaveCount(0);
  });
});

test.describe("NFL data and model", () => {
  test("the file has 32 teams, a full schedule, continuous weekly ratings and logos for every team", () => {
    expect(Object.keys(nfl.teams)).toHaveLength(32);
    expect(nfl.games.filter((g) => g.type === "REG")).toHaveLength(272);
    for (const [abbr, t] of Object.entries(nfl.teams)) {
      expect(Object.keys(t.r).length, abbr).toBe(nfl.ratingsThroughWeek);
      expect(logos[logoSlug(t.name)], `logo for ${t.name}`).toBeTruthy();
    }
    for (const g of nfl.games) { expect(nfl.teams[g.away], g.id).toBeTruthy(); expect(nfl.teams[g.home], g.id).toBeTruthy(); }
    const played = nfl.games.filter((g) => g.type === "REG" && g.aS != null);
    expect(played.length).toBeGreaterThan(40);
    // The league's offense and defense average out: points scored equal points allowed.
    const last = teamRows(nfl, nfl.ratingsThroughWeek);
    const m = (i: 1 | 2) => last.reduce((s, r) => s + r.r[i], 0) / last.length;
    expect(Math.abs(m(1) - m(2))).toBeLessThan(0.5 + Math.abs(nfl.params.scale.P - m(1)) * 0.1);
  });

  test("every NFL game on the board is in the nflverse file, matched by ESPN game id", () => {
    const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8")).games.filter((g: { league: string }) => g.league === "NFL");
    const ids = new Set(nfl.games.map((g) => g.espn));
    const missing = slate.filter((g: { espnId: string }) => !ids.has(g.espnId)).map((g: { matchup: string }) => g.matchup);
    expect(missing).toEqual([]);
  });

  test("the closing line wins: with a line the expected score is the line's; without one it is the ratings'", () => {
    const g = upcoming;
    const withLine = projectGameRow(nfl, g, { n: 20000 })!;
    expect(withLine.basis).toBe("market");
    expect(withLine.marginHome).toBe(g.spread);
    expect(withLine.total).toBe(g.total);
    expect(Math.abs(withLine.sim.meanMargin - -g.spread!)).toBeLessThan(0.6);
    const noLine = projectNfl(nfl, g.away, g.home, g.week, { neutral: false, spread: null, total: null, n: 20000 })!;
    expect(noLine.basis).toBe("ratings");
    expect(noLine.marginHome).toBeCloseTo(g.mm!, 0);
    // Swapping home and away flips the favorite.
    const flipped = projectNfl(nfl, g.home, g.away, g.week, { n: 20000 })!;
    expect(Math.sign(flipped.marginHome)).toBe(-Math.sign(noLine.marginHome) || Math.sign(flipped.marginHome));
    // Same inputs, same simulation.
    const again = projectGameRow(nfl, g, { n: 20000 })!;
    expect(again.sim.meanA).toBe(withLine.sim.meanA);
  });

  test("a pick is the side the ratings like more than the line; grading matches an independent recount", () => {
    let w = 0, l = 0, p = 0;
    for (const g of nfl.games) {
      if (g.type !== "REG" || g.aS == null || g.spread == null || g.mm == null) continue;
      const edge = g.mm - g.spread;
      if (edge === 0) continue;
      const cover = g.hS! - g.aS - g.spread;
      if (cover === 0) p++; else if (edge > 0 === cover > 0) w++; else l++;
      expect(pickFor(g)!.pickIsHome).toBe(edge > 0);
    }
    const t = tally(atsGames(nfl));
    expect([t.w, t.l, t.p]).toEqual([w, l, p]);
  });

  test("this season's games, scored with constants fitted on earlier seasons only", () => {
    const pl = nfl.games.filter((g) => g.type === "REG" && g.aS != null && g.mm != null && g.spread != null);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const model = mean(pl.map((g) => Math.abs(g.hS! - g.aS! - g.mm!))), market = mean(pl.map((g) => Math.abs(g.hS! - g.aS! - g.spread!)));
    expect(model).toBeLessThan(13);
    expect(market).toBeLessThan(12);
    // The calibration file says the same thing about the earlier seasons: the line is the better predictor.
    expect(nfl.backtest.calibration.leaveOneSeasonOut.margin.market).toBeLessThan(nfl.backtest.calibration.leaveOneSeasonOut.margin.model);
    expect(nfl.params.trainedOn).not.toContain(nfl.season);
    expect(ratingsAt(nfl, "SEA", 1)).toBeTruthy();
  });

  test("the CSV reader handles quoted commas, quotes and line breaks; least squares recovers a line; ratings anchor at zero", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(`${tmpdir()}/nflcsv-`);
    writeFileSync(`${dir}/a.csv`, 'a,b,c\n1,"x, y",NA\n2,"he said ""hi""","line\nbreak"\n');
    const rows: string[][] = [];
    await forEachRow(`${dir}/a.csv`, (_ix: unknown, f: string[]) => rows.push(f));
    expect(rows).toEqual([["1", "x, y", ""], ["2", 'he said "hi"', "line\nbreak"]]);
    const X = Array.from({ length: 20 }, (_, i) => [1, i]);
    const [b0, b1] = ols(X, X.map(([, x]) => 3 + 2 * x));
    expect(b0).toBeCloseTo(3, 8);
    expect(b1).toBeCloseTo(2, 8);
    const tg = [
      { team: "A", opp: "B", n: 60, epa: 6, stEpa: 0 }, { team: "B", opp: "A", n: 60, epa: -6, stEpa: 0 },
      { team: "A", opp: "C", n: 60, epa: 3, stEpa: 0 }, { team: "C", opp: "A", n: 60, epa: -3, stEpa: 0 },
      { team: "B", opp: "C", n: 60, epa: 0, stEpa: 0 }, { team: "C", opp: "B", n: 60, epa: 0, stEpa: 0 },
    ];
    const { ratings } = solve(tg, null, { L: 1 });
    const mo = (ratings.A.o + ratings.B.o + ratings.C.o) / 3;
    expect(Math.abs(mo)).toBeLessThan(1e-9);
    expect(ratings.A.o).toBeGreaterThan(ratings.B.o); // A scores more per play than the others do against the same opponents
  });

  test("a failed refresh keeps the saved NFL data", () => {
    const before = statSync("src/data/nfl.json").mtimeMs;
    const run = spawnSync("node", ["scripts/fetch-nflverse.mjs"], { encoding: "utf8", env: { ...process.env, NFLVERSE_BASE: "http://127.0.0.1:9" } });
    expect(run.status).toBe(0);
    expect(run.stdout + run.stderr).toContain("keeping the saved NFL data");
    expect(statSync("src/data/nfl.json").mtimeMs).toBe(before);
  });
});

test.describe("NFL simulator: picking a game", () => {
  const regular = nfl.games.filter((g) => g.type === "REG");
  const openWeek = regular.find((g) => g.aS == null)!.week;
  const goSim = async (page: Page) => {
    await openTab(page);
    await page.locator(".spp").getByRole("tab", { name: "Simulator" }).click();
    await expect(page.locator(".spp .simpts")).toHaveCount(2);
    return page.locator('.spp [aria-label="Pick a scheduled game"]');
  };

  test("an AFC-NFC game is listed under both conferences and under each division", async ({ page }) => {
    const inter = regular.find((g) => g.week === openWeek && nfl.teams[g.away].conf !== nfl.teams[g.home].conf)!;
    const pick = await goSim(page);
    await pick.getByLabel("Week").selectOption(String(openWeek));
    for (const grp of [nfl.teams[inter.away].conf, nfl.teams[inter.home].conf, nfl.teams[inter.away].div, nfl.teams[inter.home].div]) {
      await pick.getByLabel("Conference").selectOption(grp);
      await expect(pick.getByLabel("Game").locator("option", { hasText: `${inter.away} ${inter.neutral ? "vs." : "@"} ${inter.home}` })).toHaveCount(1);
    }
    const expected = regular.filter((g) => g.week === openWeek && (nfl.teams[g.away].conf === "AFC" || nfl.teams[g.home].conf === "AFC")).length;
    await pick.getByLabel("Conference").selectOption("AFC");
    await expect(pick.getByText(new RegExp(`^${expected} games?`))).toBeVisible();
  });

  test("choosing a game fills both teams; a played game is simulated from the ratings before it, and says how it ended", async ({ page }) => {
    const pick = await goSim(page);
    const played = regular.find((g) => g.aS != null && g.week === 1)!;
    await pick.getByLabel("Week").selectOption("1");
    await pick.getByLabel("Game").selectOption(played.id);
    await expect(page.locator(".spp").getByLabel("Away team")).toHaveValue(played.away);
    await expect(page.locator(".spp").getByLabel("Home team")).toHaveValue(played.home);
    await expect(page.locator(".spp").getByText("Played:")).toContainText(`final ${played.away} ${played.aS}, ${played.home} ${played.hS}`);
    await expect(page.locator(".spp").getByText(/ratings \(before week 1\)/).first()).toBeVisible();
  });

  test("any two teams: a pairing that is not scheduled is a custom matchup with a ratings week to choose", async ({ page }) => {
    const pairs = new Set(regular.map((g) => [g.away, g.home].sort().join("|")));
    const abbrs = Object.keys(nfl.teams);
    let a = "", b = "";
    outer: for (const x of abbrs) for (const y of abbrs) if (x !== y && !pairs.has([x, y].sort().join("|"))) { a = x; b = y; break outer; }
    const pick = await goSim(page);
    await page.locator('.spp select[aria-label="Away team"]').selectOption(a);
    await page.locator('.spp select[aria-label="Home team"]').selectOption(b);
    await expect(pick.getByLabel("Game")).toHaveValue("");
    const asOf = page.locator(".spp").getByLabel("Ratings as of");
    await expect(asOf).toBeVisible();
    await expect(page.locator(".spp .simpts")).toHaveCount(2);
    await asOf.selectOption("1");
    await expect(page.locator(".spp").getByText("team ratings (before week 1)").or(page.locator(".spp").getByText("Ratings margin = ")).first()).toBeVisible();
    await expect(page.locator(".spp").getByText("basis: team ratings")).toBeVisible();
  });
});

