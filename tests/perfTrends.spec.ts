import { test, expect, type Page } from "./fixtures";
import { existsSync, readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";
import { DRIVE, RESULT, V } from "../scripts/perf/lib.mjs";
import { DEFAULT_SELECTION, type PerfData, type PerfRow, type PerfSelection } from "../src/perf/types";
import { buildSeries, contribution, direction, gameDetail, higherIsBetter, leagueValue, trendMetrics, trendSentence, type TMetric } from "../src/perf/trendsCalc";

const data: PerfData = JSON.parse(readFileSync("src/data/perf-nfl.json", "utf8"));
const sel = (p: Partial<PerfSelection> = {}): PerfSelection => ({ ...DEFAULT_SELECTION, team: "SEA", ...p });
const metric = (id: string, epa = true): TMetric => trendMetrics(epa).find((m) => m.id === id)!;

const rowsOf = (t: string) => data.rows.filter((r) => r.t === t).sort((a, b) => a.w - b.w);
const oppRow = (r: PerfRow) => data.rows.find((x) => x.g === r.g && x.t === r.o)!;
const sumV = (rows: PerfRow[], garbage: "all" | "skip") => {
  const v: number[] = new Array(V.LEN).fill(0);
  for (const r of rows) for (let i = 0; i < V.LEN; i++) v[i] += r.c[i] + (garbage === "all" ? r.x[i] : 0);
  return v;
};
const epa = (v: number[]) => (v[V.PEPA] + v[V.REPA]) / 1000 / (v[V.PEPAN] + v[V.REPAN]);

// ---- pure calculations --------------------------------------------------------------------------------------------------------
for (const garbage of ["all", "skip"] as const) {
  test(`weekly efficiency, rolling average and defense equal an independent recomputation (garbage ${garbage})`, () => {
    const s = sel({ garbage });
    for (const team of ["SEA", "ATL"]) {
      const rows = rowsOf(team);
      const off = buildSeries(data, s, team, metric("eff"), "off", 3);
      expect(off.map((p) => p.week)).toEqual(rows.map((r) => r.w));
      off.forEach((p, i) => {
        expect(p.value).toBeCloseTo(epa(sumV([rows[i]], garbage)), 9);
        expect(p.plays).toBe(sumV([rows[i]], garbage)[V.PN] + sumV([rows[i]], garbage)[V.RN]);
        if (i < 2) expect(p.rolling).toBeNull();
        else expect(p.rolling).toBeCloseTo(epa(sumV(rows.slice(i - 2, i + 1), garbage)), 9);
      });
      const def = buildSeries(data, s, team, metric("eff"), "def", 1);
      def.forEach((p, i) => { expect(p.value).toBeCloseTo(epa(sumV([oppRow(rows[i])], garbage)), 9); expect(p.rolling).toBeNull(); });
    }
  });
}

test("garbage time changes a game's counts", () => {
  const a = buildSeries(data, sel({ garbage: "all" }), "ATL", metric("eff"), "off", 1);
  const b = buildSeries(data, sel({ garbage: "skip" }), "ATL", metric("eff"), "off", 1);
  expect(b.reduce((n, p) => n + p.plays, 0)).toBeLessThan(a.reduce((n, p) => n + p.plays, 0));
});

test("points per drive and turnovers come from the drive records, for both sides", () => {
  const rows = rowsOf("SEA");
  const ds = (r: PerfRow) => r.d.filter((d) => d[DRIVE.RESULT] !== RESULT.END);
  const ppd = buildSeries(data, sel(), "SEA", metric("ppd"), "off", 1);
  ppd.forEach((p, i) => expect(p.value).toBeCloseTo(ds(rows[i]).reduce((a, d) => a + d[DRIVE.PTS], 0) / ds(rows[i]).length, 9));
  const to = buildSeries(data, sel(), "SEA", metric("to"), "def", 1);
  to.forEach((p, i) => expect(p.value).toBe(ds(oppRow(rows[i])).filter((d) => d[DRIVE.RESULT] === RESULT.INT || d[DRIVE.RESULT] === RESULT.FUMBLE).length));
});

test("college has no EPA: efficiency is success rate and there is no duplicate success-rate measure", () => {
  const ms = trendMetrics(false);
  expect(ms.map((m) => m.id)).toEqual(["eff", "ypp", "expl", "ppd", "to"]);
  expect(ms[0].label).toBe("Success rate");
  expect(trendMetrics(true).map((m) => m.id)).toContain("succ");
  expect(trendMetrics(true)[0].label).toBe("EPA per play");
});

test("a game's contribution: the season figure with and without it", () => {
  const rows = rowsOf("SEA");
  const g = rows[4];
  const c = contribution(data, sel(), "SEA", metric("eff"), "off", g.g);
  expect(c.games).toBe(rows.length);
  expect(c.all).toBeCloseTo(epa(sumV(rows, "all")), 9);
  expect(c.without).toBeCloseTo(epa(sumV(rows.filter((r) => r !== g), "all")), 9);
});

test("league line equals the league's pooled figure, offense and defense alike", () => {
  const all = sumV(data.rows, "all");
  expect(leagueValue(data, sel(), metric("eff"), "off")).toBeCloseTo(epa(all), 9);
  expect(leagueValue(data, sel(), metric("eff"), "def")).toBeCloseTo(epa(all), 9);
});

test("game detail lists the drives and the biggest plays behind a game (the other offense for a defense)", () => {
  const r = rowsOf("ATL").find((x) => x.k.some((k) => k[6] === 1) || true)!;
  const off = gameDetail(data, sel({ team: "ATL" }), r, "off");
  expect(off.lines).toHaveLength(r.d.filter((d) => d[DRIVE.RESULT] !== RESULT.END).length);
  expect(off.plays.length).toBeLessThanOrEqual(5);
  const yards = off.plays.map((k) => k[2]);
  expect(yards).toEqual([...yards].sort((a, b) => b - a));
  const def = gameDetail(data, sel({ team: "ATL" }), r, "def");
  expect(def.lines).toHaveLength(oppRow(r).d.filter((d) => d[DRIVE.RESULT] !== RESULT.END).length);
  const gt = rowsOf("ATL").find((x) => x.k.some((k) => k[6] === 1));
  if (gt) expect(gameDetail(data, sel({ team: "ATL", garbage: "skip" }), gt, "off").plays.every((k) => k[6] === 0)).toBe(true);
});

test("direction rules: fewer than four games is too early; last three against the earlier games with a noise floor", () => {
  expect(direction([0.1, 0.2, 0.3], "high", 0.05).verdict).toBe("early");
  expect(direction([null, 0.1, 0.2, 0.3], "high", 0.05).verdict).toBe("early");
  const imp = direction([0, 0, 0, 0.2, 0.2, 0.2], "high", 0.05);
  expect(imp).toMatchObject({ verdict: "improving", nEarlier: 3 });
  expect(imp.recent).toBeCloseTo(0.2, 9);
  expect(imp.earlier).toBeCloseTo(0, 9);
  expect(direction([0.2, 0.2, 0.2, 0, 0, 0], "high", 0.05).verdict).toBe("declining");
  expect(direction([0.1, 0.1, 0.1, 0.12, 0.11, 0.1], "high", 0.05).verdict).toBe("steady");
  // for a defense (lower is better) a falling number is an improvement
  expect(direction([0.2, 0.2, 0.2, 0, 0, 0], "low", 0.05).verdict).toBe("improving");
  expect(higherIsBetter(metric("eff"), "def")).toBe(false);
  expect(higherIsBetter(metric("to"), "off")).toBe(false);
  expect(higherIsBetter(metric("to"), "def")).toBe(true);
});

test("takeaway sentences: too early, early read, normal, steady; no causal claims", () => {
  const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(2));
  const base = { name: "Seahawks", side: "off" as const, label: "EPA per play", fmt };
  const early = trendSentence({ ...base, d: direction([0.1, 0.2, 0.1], "high", 0.05, undefined) });
  expect(early).toContain("too early to say");
  expect(early).toContain("only 3 games");
  const five = trendSentence({ ...base, d: direction([0, 0, 0.2, 0.2, 0.2], "high", 0.05) });
  expect(five).toContain("has been improving");
  expect(five).toContain("early read");
  const eight = trendSentence({ ...base, d: direction([0.2, 0.2, 0.2, 0.2, 0.2, 0, 0, 0], "high", 0.05) });
  expect(eight).toContain("has been declining");
  expect(eight).not.toContain("early read");
  expect(trendSentence({ ...base, d: direction([0.1, 0.1, 0.1, 0.1, 0.1, 0.1], "high", 0.05) })).toContain("held about steady");
  expect(trendSentence({ ...base, d: direction([0, 0, 0, 0.3, 0.3, 0.3], "high", 0.05), adjusted: "its NFL+ rating" })).toContain("its NFL+ rating");
  for (const t of [early, five, eight]) expect(t).not.toMatch(/because|due to|caused|will |going to/i);
  // possessive for names ending in s
  expect(trendSentence({ ...base, name: "Chiefs", d: direction([0, 0, 0, 0.3, 0.3, 0.3], "high", 0.05) })).toContain("Chiefs' offense");
});

// ---- browser -----------------------------------------------------------------------------------------------------------------
test.beforeEach(async ({ page }) => { await stubFinals(page); });

async function openTrends(page: Page) {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "NFL+" }).click();
  await page.locator(".spp").getByRole("tab", { name: "Trends", exact: true }).click();
  await expect(page.locator(".tr")).toBeVisible({ timeout: 15_000 });
}
const points = (page: Page) => page.locator(".tr-chart .pt");

test("@smoke trends draws one point per game, labels raw results, and states the direction", async ({ page }) => {
  await openTrends(page);
  await expect(points(page)).toHaveCount(rowsOf("SEA").length);
  await expect(page.locator(".tr-panel")).toContainText("not adjusted for opponent strength");
  await expect(page.locator(".ptake")).toContainText(/has been (improving|declining)|held about steady/);
  await expect(page.locator(".ptake")).toContainText("not adjusted for opponent strength");
  await expect(page.locator(".tr .legend")).toContainText("League average");
  await expect(page.locator(".tr .legend")).toContainText("3-game rolling average");
});

test("selecting a point opens the game: value vs season figure, drives and biggest plays; it persists across tabs", async ({ page }) => {
  await openTrends(page);
  await points(page).nth(1).click();
  const d = page.locator(".tr-detail");
  const g = rowsOf("SEA")[1];
  await expect(d).toContainText(`Week ${g.w}`);
  await expect(d).toContainText(`${g.pf}–${g.pa}`);
  const c = contribution(data, sel(), "SEA", metric("eff"), "off", g.g);
  await expect(d).toContainText(`${c.all! >= 0 ? "+" : ""}${c.all!.toFixed(2)}`);
  await expect(d).toContainText("Without this game");
  await expect(d.locator(".tbl tbody tr")).toHaveCount(g.d.filter((x) => x[DRIVE.RESULT] !== RESULT.END).length);
  await expect(d.locator(".tr-plays li").first()).toContainText("yards");
  await page.locator(".spp").getByRole("tab", { name: "Team Profile", exact: true }).click();
  await page.locator(".spp").getByRole("tab", { name: "Trends", exact: true }).click();
  await expect(page.locator(".tr-detail")).toContainText(`Week ${g.w}`);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".tr-detail")).toHaveCount(0);
});

test("keyboard: arrows move between games, Enter selects, Escape closes", async ({ page }) => {
  await openTrends(page);
  await points(page).first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(points(page).nth(1)).toBeFocused();
  await expect(page.locator(".tr-chart .tip")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".tr-detail")).toContainText(`Week ${rowsOf("SEA")[1].w}`);
  await expect(points(page).nth(1)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".tr-detail")).toHaveCount(0);
});

test("a table row selects a game too", async ({ page }) => {
  await openTrends(page);
  await page.locator(".tr-tbl .tr-rowbtn").nth(2).click();
  await expect(page.locator(".tr-detail")).toContainText(`Week ${rowsOf("SEA")[2].w}`);
});

test("switching measure and side updates the chart and the takeaway", async ({ page }) => {
  await openTrends(page);
  const before = await page.locator(".ptake").innerText();
  await page.getByRole("button", { name: "Yards per play" }).click();
  await expect(page.locator(".tr-panel h2")).toContainText("Yards per play");
  await page.locator(".pcontrols").getByRole("button", { name: "Defense" }).click();
  await expect(page.locator(".tr-panel h2")).toContainText("defense");
  await expect(page.locator(".tr-panel")).toContainText("axis is flipped");
  expect(await page.locator(".ptake").innerText()).not.toBe(before);
  await page.getByRole("button", { name: "Turnovers" }).click();
  await expect(page.locator(".ptake")).toContainText("Turnovers");
});

test("rolling average can be turned off", async ({ page }) => {
  await openTrends(page);
  await page.getByRole("group", { name: /Rolling average/ }).getByRole("button", { name: "Off" }).click();
  await expect(page.locator(".tr .legend")).not.toContainText("rolling average");
});

test("opponent comparison draws the comparison team's line", async ({ page }) => {
  await openTrends(page);
  await page.locator(".pcontrols select").nth(1).selectOption("KC");
  await page.locator(".pcontrols").getByRole("button", { name: "Chiefs" }).click();
  await expect(page.locator(".tr .legend")).toContainText("Chiefs");
  await expect(page.locator(".tr-chart svg")).toContainText("KC");
});

test("opponent-adjusted view uses the NFL+ rating, with its note, and the raw view stays labelled raw", async ({ page }) => {
  await openTrends(page);
  await page.getByRole("button", { name: "Opponent-adjusted" }).click();
  await expect(page.locator(".tr-panel")).toContainText("Adjusted for opponent strength using the NFL+ rating");
  await expect(page.locator(".tr-panel")).not.toContainText("Raw results");
  await expect(page.locator(".ptake")).toContainText("NFL+ rating");
  await page.locator(".tr-panel").getByRole("button", { name: /What is NFL\+ rating/ }).click();
  await expect(page.locator(".ptip-pop")).toContainText("opponent-adjusted");
  await page.keyboard.press("Escape");
  await expect(page.locator(".ptip-pop")).toHaveCount(0);
  await page.getByRole("button", { name: "Raw", exact: true }).click();
  await expect(page.locator(".tr-panel")).toContainText("not adjusted for opponent strength");
});

test("when the team has no adjusted ratings the page says so instead of drawing raw results as adjusted", async ({ page }) => {
  const nfl = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));
  for (const t of Object.values(nfl.teams) as { r?: unknown }[]) delete t.r;
  await page.route("**/data/nfl.json", (r) => r.fulfill({ json: nfl }));
  await openTrends(page);
  await page.getByRole("button", { name: "Opponent-adjusted" }).click();
  await expect(page.locator(".tr-panel .note-box")).toContainText("not available");
  await expect(page.locator(".tr-chart")).toHaveCount(0);
});

test("too early: with three games the takeaway says it is too early to say", async ({ page }) => {
  const early: PerfData = { ...data, rows: data.rows.filter((r) => r.w <= 3), games: data.games.filter((g) => g.w <= 3), latestWeek: 3 };
  await page.route("**/data/perf-nfl.json", (r) => r.fulfill({ json: early }));
  await openTrends(page);
  await expect(page.locator(".ptake")).toContainText("too early to say");
  await expect(points(page)).toHaveCount(3);
});

test("garbage-time toggle changes the figures shown for a game", async ({ page }) => {
  await openTrends(page);
  await page.locator(".pcontrols select").nth(0).selectOption("ATL");
  await page.locator(".tr-tbl .tr-rowbtn").first().click();
  const before = await page.locator(".tr-detail dl").innerText();
  await page.getByRole("button", { name: /Included/ }).click();
  await expect(page.getByRole("button", { name: /Skipped/ })).toBeVisible();
  const g = rowsOf("ATL").find((r) => r.x.some((n) => n > 0));
  if (g) {
    await page.locator(".tr-tbl .tr-rowbtn", { hasText: new RegExp(`^${g.w}$`) }).click();
    const skip = buildSeries(data, sel({ team: "ATL", garbage: "skip" }), "ATL", metric("eff"), "off", 1).find((p) => p.g === g.g)!;
    await expect(page.locator(".tr-detail")).toContainText(`${skip.plays} plays`);
  }
  expect(before).toBeTruthy();
});

test("phone layout (390px, the mobile project): no horizontal overflow, chart fits, detail open", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "runs in the 390px mobile project");
  await openTrends(page);
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(await over()).toBeLessThanOrEqual(1);
  await points(page).nth(2).click();
  await expect(page.locator(".tr-detail")).toBeVisible();
  expect(await over()).toBeLessThanOrEqual(1);
  const box = await page.locator(".tr-chart svg").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
});

test("college file missing: the error state, not a crash", async ({ page }) => {
  test.skip(existsSync("src/data/perf-cfb.json"), "college file present: covered by the college test");
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await page.locator(".spp").getByRole("tab", { name: "Trends", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not load", { timeout: 30_000 });
});

test("college trends use success rate and say why", async ({ page }) => {
  test.skip(!existsSync("src/data/perf-cfb.json"), "college file not generated in this tree");
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await page.locator(".spp").getByRole("tab", { name: "Trends", exact: true }).click();
  await expect(page.locator(".tr")).toContainText("Expected points added (EPA) is not available", { timeout: 20_000 });
  await expect(page.locator(".tr-panel h2")).toContainText("Success rate");
});
