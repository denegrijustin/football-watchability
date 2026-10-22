import { test, expect, type Page } from "./fixtures";
import { readFileSync, existsSync } from "node:fs";
import { stubFinals } from "./helpers/finals";
import type { PerfData, PerfRow } from "../src/perf/types";
import { DEFAULT_SELECTION } from "../src/perf/types";
import { DENOMINATORS, finishing, gamesFor, leagueAverage, type Denominator } from "../src/perf/engine";
import { oppRowOf } from "../src/perf/drivesCalc";
import { BUCKETS, SMALL_N, drivesBehind, emptyBreakdown, finSlot, finishingRows, finishingTakeaway, parseFinSlot } from "../src/perf/finishingCalc";
import { goPerf } from "./helpers/perf";

const data: PerfData = JSON.parse(readFileSync("src/data/perf-nfl.json", "utf8"));
const SEL = { ...DEFAULT_SELECTION, team: "SEA" };
const rowsOf = (team: string) => data.rows.filter((r) => r.t === team).sort((a, b) => a.w - b.w);
const LIMIT: Record<Denominator, number> = { all: 999, opportunity: 40, redzone: 20 };

test.beforeEach(async ({ page }) => { await stubFinals(page); });

/** The same figures from the raw drive tuples, with no engine code. */
function independent(rows: PerfRow[], den: Denominator, skipGarbage = false) {
  const ds = rows.flatMap((r) => r.d).filter((d) => d[6] !== 7 && (!skipGarbage || d[10] === 0) && d[9] <= LIMIT[den]);
  return {
    n: ds.length, td: ds.filter((d) => d[6] === 0).length, fg: ds.filter((d) => d[6] === 1).length, turnover: ds.filter((d) => d[6] === 3 || d[6] === 4).length,
    points: ds.reduce((s, d) => s + d[7], 0),
  };
}

test.describe("Finishing: the numbers", () => {
  test("touchdowns, field goals, turnovers and empty drives reconcile with a recomputation from the JSON for all three denominators", () => {
    for (const team of ["SEA", "KC", "NYJ"]) for (const den of ["all", "opportunity", "redzone"] as Denominator[]) {
      const f = finishing(rowsOf(team), "all", den);
      const i = independent(rowsOf(team), den);
      expect(f.n).toBe(i.n);
      expect(f.td).toBe(i.td);
      expect(f.fg).toBe(i.fg);
      expect(f.turnover).toBe(i.turnover);
      expect(f.empty).toBe(i.n - i.td - i.fg - i.turnover);
      expect(f.td + f.fg + f.turnover + f.empty).toBe(f.n);
      expect(f.points).toBe(i.points);
      if (i.n) expect(f.pointsPerOpportunity).toBeCloseTo(i.points / i.n, 10);
    }
  });

  test("the three denominators are different populations and each is described in words", () => {
    const n = (d: Denominator) => finishing(rowsOf("SEA"), "all", d).n;
    expect(n("all")).toBeGreaterThan(n("opportunity"));
    expect(n("opportunity")).toBeGreaterThan(n("redzone"));
    expect(new Set(DENOMINATORS.map((d) => d.label)).size).toBe(3);
    expect(DENOMINATORS.find((d) => d.id === "redzone")!.note).toContain("20-yard line");
    expect(DENOMINATORS.find((d) => d.id === "opportunity")!.note).toContain("40-yard line");
    expect(DENOMINATORS.find((d) => d.id === "all")!.note).toContain("Every possession");
    // the same touchdowns are a different share of each, which is why they must not be read side by side
    const rates = (["all", "opportunity", "redzone"] as Denominator[]).map((d) => finishing(rowsOf("SEA"), "all", d).tdRate);
    expect(new Set(rates).size).toBe(3);
  });

  test("garbage time changes the counts", () => {
    const all = finishing(data.rows, "all", "all").n, skip = finishing(data.rows, "skip", "all").n;
    expect(skip).toBeLessThan(all);
    expect(finishing(data.rows, "skip", "redzone").n).toBe(independent(data.rows, "redzone", true).n);
  });

  test("the defense side is what the opponents' rows did in the same games", () => {
    const rows = finishingRows(data, SEL, "redzone", { team: "Seahawks", opp: null });
    const against = rows.find((r) => r.key === "against")!;
    const opps = gamesFor(data, "SEA", SEL).map((g) => oppRowOf(data, g)!);
    expect(opps.every(Boolean)).toBe(true);
    const i = independent(opps, "redzone");
    expect(against.fin.n).toBe(i.n);
    expect(against.fin.td).toBe(i.td);
    expect(against.group).toBe("def");
    expect(rows.find((r) => r.key === "team")!.fin.n).toBe(independent(rowsOf("SEA"), "redzone").n);
  });

  test("the benchmark picks the extra rows: league average, the comparison team, or none", () => {
    const keys = (sel: typeof SEL) => finishingRows(data, sel, "all", { team: "A", opp: "B" }).map((r) => `${r.group}:${r.key}`);
    expect(keys(SEL)).toEqual(["off:team", "def:against", "off:league", "def:league"]);
    expect(keys({ ...SEL, bench: "none" })).toEqual(["off:team", "def:against"]);
    expect(keys({ ...SEL, bench: "opp", opp: "KC" })).toEqual(["off:team", "def:against", "off:opp", "def:oppAgainst"]);
    const lg = finishingRows(data, SEL, "redzone", { team: "A", opp: null }).find((r) => r.key === "league")!;
    const l = leagueAverage(data, SEL);
    expect(lg.fin.n).toBe(finishing(l.games, "all", "redzone").n);
    expect(finishingRows(data, SEL, "all", { team: "A", opp: null }).filter((r) => !r.drillable).length).toBe(2);
  });

  test("the drives behind a segment are exactly the bucket, and the empty ones are itemised", () => {
    const rows = finishingRows(data, SEL, "opportunity", { team: "Seahawks", opp: null });
    const mine = rows.find((r) => r.key === "team")!;
    for (const b of BUCKETS) {
      const behind = drivesBehind(mine, b.k);
      expect(behind.length).toBe(mine.fin[b.k]);
      expect(behind.every((x) => x.row.d[x.idx] === x.tuple)).toBe(true);
    }
    const parts = emptyBreakdown(mine.fin.buckets.empty);
    expect(parts.reduce((s, [, c]) => s + c, 0)).toBe(mine.fin.empty);
  });

  test("the sentence follows fixed rules", () => {
    const rows = finishingRows(data, SEL, "redzone", { team: "Seahawks", opp: null });
    const off = rows[0].fin, def = rows[1].fin;
    const base = { name: "Seahawks", den: "redzone" as Denominator, off, against: def, benchName: "the league average" };
    const t = finishingTakeaway({ ...base, bench: { ...off, tdRate: (off.tdRate as number) - 0.2 } });
    expect(t.text).toContain(`${off.n} red-zone trips`);
    expect(t.text).toContain("a better touchdown rate than the league average");
    expect(finishingTakeaway({ ...base, bench: { ...off, tdRate: (off.tdRate as number) + 0.2 } }).text).toContain("a lower touchdown rate");
    expect(finishingTakeaway({ ...base, bench: { ...off, tdRate: (off.tdRate as number) + 0.01 } }).text).toContain("close to the league average");
    expect(finishingTakeaway({ ...base, bench: null }).text).not.toContain("league average");
    expect(finishingTakeaway({ ...base, bench: null }).text).toContain("Opponents scored touchdowns");
    // fewer trips than the guard is flagged; none at all is said plainly, with no rate invented
    expect(off.n).toBeLessThan(SMALL_N.all + 100);
    const few = finishing(rowsOf("SEA").slice(0, 1), "all", "redzone");
    expect(finishingTakeaway({ ...base, off: few, bench: null }).small).toContain("Only");
    const none = finishing([], "all", "redzone");
    expect(finishingTakeaway({ ...base, off: none, bench: null }).text).toContain("no red-zone trips");
  });

  test("the metric slot round-trips and ignores other tabs' values", () => {
    expect(parseFinSlot(finSlot("team", "off", "td"))).toEqual({ row: "team", group: "off", bucket: "td" });
    expect(parseFinSlot("drv:abc|SEA:1")).toBeNull();
    expect(parseFinSlot("fin:team:off:bogus")).toBeNull();
    expect(parseFinSlot(null)).toBeNull();
  });
});

const openFinishing = async (page: Page) => {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "NFL+" }).click();
  await goPerf(page, "Finishing Drives");
  await expect(page.locator(".fn-row").first()).toBeVisible({ timeout: 15_000 });
};
const seg = (page: Page, name: RegExp) => page.locator(".fn-group").first().locator(".fn-row").first().locator(".fn-seg", { hasText: name });

test.describe("Finishing: the tab", () => {
  test("@smoke it states the denominator in words and shows offense and defense bars with the league row", async ({ page }) => {
    await openFinishing(page);
    const f = finishing(rowsOf("SEA"), "all", "redzone");
    await expect(page.locator(".fn-den")).toContainText("Red-zone trips");
    await expect(page.locator(".fn-den")).toContainText("20-yard line");
    await expect(page.locator(".fn-den")).toContainText(`${f.n} red-zone trips`);
    await expect(page.locator(".fn-row")).toHaveCount(4);
    await expect(page.locator(".fn-group h3").first()).toContainText("Offense");
    await expect(page.locator(".fn-group h3").nth(1)).toContainText("Defense");
    await expect(page.locator(".ptake")).toContainText(`${f.n} red-zone trips`);
    await expect(page.locator(".fn-legend li")).toHaveCount(4);
  });

  test("the three views show three different counts and each says what it counts", async ({ page }) => {
    await openFinishing(page);
    const seen: string[] = [];
    for (const [label, den, noun] of [["All drives", "all", "drives"], ["Scoring chances", "opportunity", "scoring chances"], ["Red-zone trips", "redzone", "red-zone trips"]] as const) {
      await page.locator(".fn-head .seg").getByRole("button", { name: label }).click();
      const n = finishing(rowsOf("SEA"), "all", den).n;
      await expect(page.locator(".fn-den")).toContainText(`${n} ${noun}`);
      await expect(page.locator(".fn-lab small").first()).toContainText(`${n} ${noun}`);
      seen.push(String(n));
    }
    expect(new Set(seen).size).toBe(3);
  });

  test("garbage time can be skipped and the count follows", async ({ page }) => {
    await openFinishing(page);
    await page.locator(".fn-head .seg").getByRole("button", { name: "All drives" }).click();
    const all = finishing(rowsOf("SEA"), "all", "all").n, skip = finishing(rowsOf("SEA"), "skip", "all").n;
    test.skip(all === skip, "no SEA garbage time");
    await expect(page.locator(".fn-lab small").first()).toContainText(`${all} drives`);
    await page.getByRole("button", { name: /Included/ }).click();
    await expect(page.locator(".fn-lab small").first()).toContainText(`${skip} drives`);
  });

  test("selecting a touchdown segment lists exactly those drives; each can be opened on the field", async ({ page }) => {
    await openFinishing(page);
    const f = finishing(rowsOf("SEA"), "all", "redzone");
    const td = seg(page, /^TD/);
    await td.click();
    await expect(td).toHaveAttribute("aria-pressed", "true");
    const panel = page.locator(".fn-behind");
    await expect(panel).toContainText(`${f.td} of ${f.n} red-zone trips`);
    await expect(panel.locator("tbody tr")).toHaveCount(f.td);
    await expect(panel.locator("tbody tr").first().getByRole("button", { name: /See .* on the field/ })).toBeVisible();
    // the same segment again closes it
    await td.click();
    await expect(panel).toHaveCount(0);
    await td.click();
    await panel.locator("tbody tr").first().getByRole("button", { name: /See .* on the field/ }).click();
    await expect(page.locator(".phd h1")).toHaveText("Drives");
    await expect(page.locator(".dv-gsel")).not.toHaveValue("");
    await expect(page.locator(".dv-lane > button[aria-expanded=true]")).toHaveCount(1);
    await expect(page.locator(".dv-detail")).toContainText("Touchdown");
  });

  test("the empty segment lists its endings, and keyboard selection works", async ({ page }) => {
    await openFinishing(page);
    await page.locator(".fn-head .seg").getByRole("button", { name: "All drives" }).click();
    const em = seg(page, /Empty/);
    await em.focus();
    await page.keyboard.press("Enter");
    await expect(em).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".fn-behind")).toContainText("How they ended");
    await expect(page.locator(".fn-behind")).toContainText("Punt");
  });

  test("the comparison team and league rows are for comparing, not for opening", async ({ page }) => {
    await openFinishing(page);
    const leagueSeg = page.locator(".fn-group").first().locator(".fn-row").nth(1).locator(".fn-seg").first();
    await expect(leagueSeg).toHaveAttribute("aria-disabled", "true");
    await leagueSeg.click({ force: true });
    await expect(page.locator(".fn-behind")).toHaveCount(0);
    await page.locator(".pcontrols").getByLabel("Compare with").selectOption("KC");
    await expect(page.locator(".fn-row")).toHaveCount(4);
    await expect(page.locator(".fn-lab").nth(1)).toContainText(/Opponents against|Chiefs/);
    await expect(page.locator(".fn-group").first().locator(".fn-lab").nth(1)).toContainText("Chiefs");
    await page.locator(".pcontrols").getByRole("button", { name: "None" }).click();
    await expect(page.locator(".fn-row")).toHaveCount(2);
  });

  test("the selected segment persists when you leave the tab and come back", async ({ page }) => {
    await openFinishing(page);
    await seg(page, /^FG/).click();
    await goPerf(page, "Team Profile");
    await goPerf(page, "Finishing Drives");
    await expect(seg(page, /^FG/)).toHaveAttribute("aria-pressed", "true");
  });

  test("segments carry text, so the colors are not the only signal; Escape closes the tip", async ({ page }) => {
    await openFinishing(page);
    await expect(seg(page, /^TD \d+%/)).toBeVisible();
    await expect(page.locator(".fn-seg").first()).toHaveAttribute("aria-label", /touchdowns, \d+ of \d+ \(\d+%\)/);
    await seg(page, /^TD/).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Escape");
    await expect(page.locator(".fn-bars .tip")).toHaveCount(0);
  });

  test("no sideways scroll", async ({ page }) => {
    await openFinishing(page);
    await seg(page, /^TD/).click();
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw + 1);
  });

  test("an error loading the data shows a message and a retry", async ({ page }) => {
    await page.route("**/data/perf-nfl.json*", (r) => r.fulfill({ status: 500, body: "x" }));
    await page.goto("/?league=NFL");
    await page.getByRole("button", { name: "NFL+" }).click();
    await goPerf(page, "Finishing Drives");
    await expect(page.locator("[role=alert]")).toContainText("Could not load", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});

test("college: the Finishing tab opens when the college file exists", async ({ page }) => {
  test.skip(!existsSync("src/data/perf-cfb.json"), "perf-cfb.json is not in this checkout");
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await goPerf(page, "Finishing Drives");
  await expect(page.locator(".fn-row").first()).toBeVisible({ timeout: 20_000 });
});
