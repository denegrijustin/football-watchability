import { test, expect, type Page } from "./fixtures";
import { existsSync, readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";
import { DRIVE, RESULT, V, ddIndex } from "../scripts/perf/lib.mjs";
import { DEFAULT_SELECTION, type PerfData, type PerfRow, type PerfSelection } from "../src/perf/types";
import { compareTeams, edgeLevel, facetById, facetStat, leaderOf, matchupTakeaway, rowSentence, biggestGaps, leanCounts, playedBetween, playedSentence, NOT_A_PREDICTION, type MatchupRow } from "../src/perf/matchupCalc";
import { leagueSummaries } from "../src/perf/engine";
import { goPerf } from "./helpers/perf";

const data: PerfData = JSON.parse(readFileSync("src/data/perf-nfl.json", "utf8"));
const sel = (p: Partial<PerfSelection> = {}): PerfSelection => ({ ...DEFAULT_SELECTION, team: "SEA", opp: "KC", ...p });

// ---- independent recomputation straight from the JSON (no engine) ---------------------------------------------------------
const rowsOf = (t: string) => data.rows.filter((r) => r.t === t);
const oppRowsOf = (t: string) => rowsOf(t).map((r) => data.rows.find((x) => x.g === r.g && x.t === r.o)!);
const vec = (rows: PerfRow[], garbage: "all" | "skip") => {
  const v: number[] = new Array(V.LEN).fill(0);
  for (const r of rows) for (let i = 0; i < V.LEN; i++) v[i] += r.c[i] + (garbage === "all" ? r.x[i] : 0);
  return v;
};
const drives = (rows: PerfRow[], garbage: "all" | "skip") => rows.flatMap((r) => r.d).filter((d) => d[DRIVE.RESULT] !== RESULT.END && (garbage === "all" || d[DRIVE.GARBAGE] === 0));
const third = (v: number[]) => { let n = 0, s = 0; for (let b = 0; b < 4; b++) { n += v[ddIndex(3, b)]; s += v[ddIndex(3, b) + 1]; } return [n, s]; };

for (const garbage of ["all", "skip"] as const) {
  test(`matchup figures equal an independent recomputation from the JSON (garbage ${garbage})`, () => {
    const s = sel({ garbage });
    for (const [atk, dfn] of [["SEA", "KC"], ["ATL", "MIA"]]) {
      const ov = vec(rowsOf(atk), garbage), dv = vec(oppRowsOf(dfn), garbage);
      const pass = facetStat(data, s, facetById("pass")!, atk, "off");
      expect(pass.value).toBeCloseTo(ov[V.PEPA] / 1000 / ov[V.PEPAN], 9);
      expect(pass.sample).toBe(ov[V.PN]);
      const passDef = facetStat(data, s, facetById("pass")!, dfn, "def");
      expect(passDef.value).toBeCloseTo(dv[V.PEPA] / 1000 / dv[V.PEPAN], 9);
      const [n3, s3] = third(ov);
      const th = facetStat(data, s, facetById("third")!, atk, "off");
      expect(th.value).toBeCloseTo(s3 / n3, 9);
      expect(th.sample).toBe(n3);
      const ex = facetStat(data, s, facetById("explosive")!, atk, "off");
      expect(ex.value).toBeCloseTo((ov[V.PEXP] + ov[V.REXP]) / (ov[V.PN] + ov[V.RN]), 9);
      const rz = facetStat(data, s, facetById("redzone")!, dfn, "def");
      expect(rz.value).toBeCloseTo(dv[V.RZ + 1] / dv[V.RZ], 9);
      // finishing: points per drive that reached the opponent's 40; field position: mean start
      const chances = drives(rowsOf(atk), garbage).filter((d) => d[DRIVE.MIN_YL] <= 40);
      const fin = facetStat(data, s, facetById("finishing")!, atk, "off");
      expect(fin.sample).toBe(chances.length);
      expect(fin.value).toBeCloseTo(chances.reduce((a, d) => a + d[DRIVE.PTS], 0) / chances.length, 9);
      const against = drives(oppRowsOf(dfn), garbage);
      const fp = facetStat(data, s, facetById("field")!, dfn, "def");
      expect(fp.value).toBeCloseTo(against.reduce((a, d) => a + d[DRIVE.START_YL], 0) / against.length, 9);
    }
  });
}

test("a defense that allows the least ranks at the top: percentiles always read higher-is-better", () => {
  const s = sel();
  const all = [...leagueSummaries(data, s).keys()];
  const stats = all.map((t) => facetStat(data, s, facetById("rush")!, t, "def"));
  const best = stats.reduce((a, b) => (a.value! < b.value! ? a : b));
  const worst = stats.reduce((a, b) => (a.value! > b.value! ? a : b));
  expect(best.rank).toBe(1);
  expect(best.pct).toBeGreaterThanOrEqual(95);
  expect(worst.rank).toBe(all.length);
  expect(worst.pct).toBeLessThanOrEqual(5);
  // field position: an offense that starts closer to the goal line is better
  const fps = all.map((t) => facetStat(data, s, facetById("field")!, t, "off"));
  const closest = fps.reduce((a, b) => (a.value! < b.value! ? a : b));
  expect(closest.rank).toBe(1);
});

test("garbage time changes the counts behind a matchup", () => {
  const a = facetStat(data, sel({ garbage: "all" }), facetById("pass")!, "ATL", "off");
  const b = facetStat(data, sel({ garbage: "skip" }), facetById("pass")!, "ATL", "off");
  expect(b.sample).toBeLessThan(a.sample);
});

test("edge levels, leaders and the 16 comparison rows", () => {
  expect(edgeLevel(null)).toBe("none");
  expect([0, 9, -9].map(edgeLevel)).toEqual(["even", "even", "even"]);
  expect([10, -19].map(edgeLevel)).toEqual(["slight", "slight"]);
  expect([20, -39].map(edgeLevel)).toEqual(["clear", "clear"]);
  expect([40, -100].map(edgeLevel)).toEqual(["big", "big"]);
  const rows = compareTeams(data, sel(), "SEA", "KC");
  expect(rows).toHaveLength(16);
  expect(rows.filter((r) => r.dir === "a").every((r) => r.atk.team === "SEA" && r.dfn.team === "KC")).toBe(true);
  expect(rows.filter((r) => r.dir === "b").every((r) => r.atk.team === "KC" && r.dfn.team === "SEA")).toBe(true);
  for (const r of rows) { if (r.edge != null) expect(r.edge).toBe(r.atk.pct! - r.dfn.pct!); }
  const c = leanCounts(rows, "SEA", "KC");
  expect(c.a + c.b + c.even + c.unknown).toBe(16);
  expect(leaderOf({ ...rows[0], edge: 30 })).toBe("SEA");
  expect(leaderOf({ ...rows[0], edge: -30 })).toBe("KC");
  expect(leaderOf({ ...rows[0], edge: 3 })).toBe("even");
});

const names = { SEA: "Seahawks", KC: "Chiefs" };
test("takeaway: names the biggest gaps, states the sample, never predicts", () => {
  const rows = compareTeams(data, sel(), "SEA", "KC");
  const t = matchupTakeaway({ rows, names, gamesA: 6, gamesB: 5 });
  expect(t.text).toContain("The biggest gap in the season numbers");
  expect(t.text).toMatch(/percentile/);
  expect(t.text).not.toMatch(/will win|likely to win|probab|guarantee|chance of winning/i);
  expect(t.small).toBe(NOT_A_PREDICTION);
  expect(t.small).toMatch(/not a forecast/);
  const gaps = biggestGaps(rows, 2);
  expect(t.text).toContain(rowSentence(gaps[0], names));
  expect(Math.abs(gaps[0].edge!)).toBeGreaterThanOrEqual(20);
});
test("takeaway: closely matched fallback, early-season caution, small samples left out", () => {
  const rows = compareTeams(data, sel(), "SEA", "KC");
  const even = rows.map((r) => ({ ...r, edge: 4, level: edgeLevel(4), small: false })) as MatchupRow[];
  expect(matchupTakeaway({ rows: even, names, gamesA: 6, gamesB: 6 }).text).toContain("closely matched");
  const early = matchupTakeaway({ rows: even, names, gamesA: 2, gamesB: 3 }).text;
  expect(early).toContain("early read");
  expect(early).toContain("has played 2 games");
  const small = rows.map((r, i) => ({ ...r, edge: 50, level: edgeLevel(50), small: i < 2 })) as MatchupRow[];
  expect(matchupTakeaway({ rows: small, names, gamesA: 6, gamesB: 6 }).text).toContain("small samples");
  const none = rows.map((r) => ({ ...r, edge: null, level: edgeLevel(null) })) as MatchupRow[];
  expect(matchupTakeaway({ rows: none, names, gamesA: 0, gamesB: 0 }).text).toContain("not enough data");
});
test("a game already played between the teams is reported as a fact", () => {
  const g = data.games.find((x) => x.plays)!;
  const found = playedBetween(data, g.home, g.away);
  expect(found.map((x) => x.id)).toContain(g.id);
  const sent = playedSentence(g, { [g.home]: g.home, [g.away]: g.away });
  expect(sent).toMatch(/beat|tied/);
  expect(sent).toContain(`Week ${g.w}`);
});

// ---- browser -----------------------------------------------------------------------------------------------------------------
test.beforeEach(async ({ page }) => { await stubFinals(page); });

async function openMatchup(page: Page) {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "NFL+" }).click();
  await goPerf(page, "Matchup");
  await expect(page.locator(".pcontrols")).toBeVisible({ timeout: 15_000 });
}
const teamSel = (page: Page) => page.locator(".pcontrols select").nth(0);
const oppSel = (page: Page) => page.locator(".pcontrols select").nth(1);

test("@smoke matchup defaults to the next scheduled opponent and shows paired bars for both directions", async ({ page }) => {
  // The next opponent moves on as the season does, so it is read from the saved schedule: the earliest game of Seattle's not yet played.
  const sched = JSON.parse(readFileSync("src/data/nfl.json", "utf8")).games as { type: string; aS: number | null; away: string; home: string; date: string }[];
  const next = sched.filter((g) => g.type === "REG" && g.aS == null && (g.away === "SEA" || g.home === "SEA")).sort((a, b) => a.date.localeCompare(b.date))[0];
  const expected = next ? (next.away === "SEA" ? next.home : next.away) : "";
  await openMatchup(page);
  await expect(teamSel(page)).toHaveValue("SEA");
  if (expected) await expect(oppSel(page)).toHaveValue(expected);
  await expect(page.locator(".mu-row")).toHaveCount(16);
  await expect(page.locator(".ptake")).toContainText("percentile");
  await expect(page.locator(".ptake")).toContainText("not a forecast");
  await expect(page.locator(".mu-panel")).toHaveCount(2);
  await expect(page.locator(".mu")).toContainText("What this page does not do");
});

test("the values in a detail panel match the engine", async ({ page }) => {
  await openMatchup(page);
  const row = page.locator('.mu-row[data-key="mu:a:pass"]');
  await row.locator(".mu-btn").click();
  const s = sel();
  const a = facetStat(data, s, facetById("pass")!, "SEA", "off"), b = facetStat(data, s, facetById("pass")!, "KC", "def");
  const d = row.locator(".mu-detail");
  await expect(d).toContainText(`${a.sample} dropbacks`);
  await expect(d).toContainText(`${b.sample} dropbacks`);
  await expect(d).toContainText(` of ${a.of} (${a.pct}`);
  await expect(d).toContainText("not a win probability");
});

test("garbage-time toggle changes the counts shown in a detail panel", async ({ page }) => {
  await openMatchup(page);
  await teamSel(page).selectOption("ATL");
  await oppSel(page).selectOption("MIA");
  const row = page.locator('.mu-row[data-key="mu:a:pass"]');
  await row.locator(".mu-btn").click();
  const card = row.locator(".mu-detail .mu-card").first();
  const before = await card.innerText();
  await page.getByRole("button", { name: /Included/ }).click();
  await expect(page.getByRole("button", { name: /Skipped/ })).toBeVisible();
  const a = facetStat(data, sel({ team: "ATL", opp: "MIA", garbage: "skip" }), facetById("pass")!, "ATL", "off");
  await expect(card).toContainText(`${a.sample} dropbacks`);
  expect(await card.innerText()).not.toBe(before);
});

test("swap, clear and choose; selections persist across tabs", async ({ page }) => {
  await openMatchup(page);
  await page.getByRole("button", { name: /Swap teams/ }).click();
  await expect(teamSel(page)).toHaveValue("KC");
  await expect(oppSel(page)).toHaveValue("SEA");
  await oppSel(page).selectOption("DEN");
  await page.locator('.mu-row[data-key="mu:a:rush"] .mu-btn').click();
  await goPerf(page, "Team Profile");
  await expect(teamSel(page)).toHaveValue("KC");
  await expect(oppSel(page)).toHaveValue("DEN");
  await goPerf(page, "Matchup");
  await expect(teamSel(page)).toHaveValue("KC");
  await expect(oppSel(page)).toHaveValue("DEN");
  await expect(page.locator('.mu-row[data-key="mu:a:rush"] .mu-btn')).toHaveAttribute("aria-expanded", "true");
});

test("clearing the opponent shows a helpful empty state and is not undone by the default", async ({ page }) => {
  await openMatchup(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".mu-empty")).toContainText("Pick a team to compare with");
  await expect(page.locator(".mu-row")).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(oppSel(page)).toHaveValue("");
  await page.getByRole("button", { name: /Compare with next opponent/ }).click();
  await expect(oppSel(page)).toHaveValue("KC");
});

test("keyboard: Enter opens a comparison, Escape closes it and focus stays on it", async ({ page }) => {
  await openMatchup(page);
  const btn = page.locator('.mu-row[data-key="mu:a:pass"] .mu-btn');
  await btn.focus();
  await page.keyboard.press("Enter");
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".mu-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(btn).toBeFocused();
  await page.locator(".mu-gaps button").first().click();
  await expect(page.locator(".mu-row.sel")).toHaveCount(1);
});

test("small samples are flagged and kept out of the takeaway when teams have played two games", async ({ page }) => {
  const early: PerfData = { ...data, rows: data.rows.filter((r) => r.w <= 2), games: data.games.filter((g) => g.w <= 2), latestWeek: 2 };
  await page.route("**/data/perf-nfl.json", (r) => r.fulfill({ json: early }));
  await openMatchup(page);
  await expect(page.locator(".mu-edge .small-flag").first()).toHaveText("small sample");
  await expect(page.locator(".ptake")).toContainText("early read");
});

test("early season: with three games each the takeaway says it is an early read", async ({ page }) => {
  const early: PerfData = { ...data, rows: data.rows.filter((r) => r.w <= 3), games: data.games.filter((g) => g.w <= 3), latestWeek: 3 };
  await page.route("**/data/perf-nfl.json", (r) => r.fulfill({ json: early }));
  await openMatchup(page);
  await expect(page.locator(".ptake")).toContainText("early read");
});

test("phone layout (390px, the mobile project): no horizontal overflow, with and without a detail open", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "runs in the 390px mobile project");
  await openMatchup(page);
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(await over()).toBeLessThanOrEqual(1);
  await page.locator('.mu-row[data-key="mu:b:finishing"] .mu-btn').click();
  await expect(page.locator(".mu-detail")).toBeVisible();
  expect(await over()).toBeLessThanOrEqual(1);
  const box = await page.locator(".mu-panel").first().boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
});

test("when the college file is missing the tab shows its error state instead of crashing", async ({ page }) => {
  test.skip(existsSync("src/data/perf-cfb.json"), "college file present: covered by the college test");
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await goPerf(page, "Matchup");
  await expect(page.getByRole("alert")).toContainText("Could not load", { timeout: 30_000 });
});

test("college matchup uses success rate and says why", async ({ page }) => {
  test.skip(!existsSync("src/data/perf-cfb.json"), "college file not generated in this tree");
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await goPerf(page, "Matchup");
  await expect(page.locator(".mu")).toContainText("Expected points added (EPA) is not available", { timeout: 20_000 });
});
