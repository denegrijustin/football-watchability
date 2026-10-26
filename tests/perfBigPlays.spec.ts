import { test, expect, type Page } from "./fixtures";
import { existsSync, readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";
import { DEFAULT_SELECTION, type PerfData, type PerfRow, type PerfSelection } from "../src/perf/types";
import { BP_MODES, DEADBAND, bigPlayTakeaway, levelOf, longestPlays, modeOf, modePatch, neighbor, population, quadrant, quadrantCounts, quadrantOf, sortPoints, type BpMode, type BpPoint } from "../src/perf/bigplaysCalc";
import { goPerf } from "./helpers/perf";

test.beforeEach(async ({ page }) => { await stubFinals(page); });

const nfl: PerfData = JSON.parse(readFileSync("src/data/perf-nfl.json", "utf8"));
const hasCfb = existsSync("src/data/perf-cfb.json");
const base = (over: Partial<PerfSelection> = {}): PerfSelection => ({ ...DEFAULT_SELECTION, ...over });
const teams = [...new Set(nfl.rows.map((r) => r.t))];
const rowsOf = (t: string) => nfl.rows.filter((r) => r.t === t);
const oppRowsOf = (t: string) => rowsOf(t).map((r) => nfl.rows.find((q) => q.g === r.g && q.t === r.o)!);
// Literal vector offsets (V in scripts/perf/lib.mjs): 0 pass plays, 2 pass successes, 3 pass explosive, 8 rush plays, 10 rush successes, 11 rush explosive.
const sum = (rows: PerfRow[], i: number, garbage = true) => rows.reduce((a, r) => a + r.c[i] + (garbage ? r.x[i] : 0), 0);

async function open(page: Page, vw = 1280) {
  await page.setViewportSize({ width: vw, height: vw < 700 ? 844 : 900 });
  await page.goto("/?league=NFL");
  const nflBtn = page.locator('.view-switch [data-tab="nfl"]');
  await page.locator(".view-switch").first().waitFor();
  if (!(await nflBtn.isVisible())) await page.locator(".view-switch button", { hasText: "More" }).click();
  await nflBtn.click();
  await goPerf(page, "Big Plays");
  await expect(page.getByRole("heading", { level: 1, name: "Big Plays" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".pcontrols select").first()).not.toHaveValue("", { timeout: 15_000 });
}
const dots = (page: Page) => page.locator(".bp-dot");
const dot = (page: Page, name: string) => page.locator(`.bp-dot[aria-label^="${name}:"]`);
// Dots can overlap on screen, so open one the way a keyboard user does.
const openDot = async (page: Page, name: string) => { await dot(page, name).focus(); await page.keyboard.press("Enter"); };

test.describe("Big Plays: calculations", () => {
  test("one point per NFL team; rates equal independent sums in every mode, and the league line is the league as one team", () => {
    const want = (t: string, mode: BpMode) => {
      const o = rowsOf(t), d = oppRowsOf(t);
      if (mode === "pass") return [sum(o, 2) / sum(o, 0), sum(o, 3) / sum(o, 0), sum(o, 0)];
      if (mode === "rush") return [sum(o, 10) / sum(o, 8), sum(o, 11) / sum(o, 8), sum(o, 8)];
      const rows = mode === "def" ? d : o;
      const n = sum(rows, 0) + sum(rows, 8);
      return [(sum(rows, 2) + sum(rows, 10)) / n, (sum(rows, 3) + sum(rows, 11)) / n, n];
    };
    for (const mode of BP_MODES.map((m) => m.id)) {
      const pop = population(nfl, base(), mode);
      expect(pop.points.length).toBe(teams.length);
      for (const p of pop.points) {
        const [x, y, n] = want(p.id, mode);
        expect(p.x).toBeCloseTo(x, 12); expect(p.y).toBeCloseTo(y, 12); expect(p.n).toBe(n);
      }
      const all = nfl.rows;
      const lx = mode === "pass" ? sum(all, 2) / sum(all, 0) : mode === "rush" ? sum(all, 10) / sum(all, 8) : (sum(all, 2) + sum(all, 10)) / (sum(all, 0) + sum(all, 8));
      expect(pop.line!.x).toBeCloseTo(lx, 12);
    }
  });

  test("garbage time can be skipped and the window narrows the games", () => {
    const t = teams.find((x) => rowsOf(x).some((r) => r.x.some((v) => v)))!;
    const a = population(nfl, base({ garbage: "all" }), "off").points.find((p) => p.id === t)!;
    const b = population(nfl, base({ garbage: "skip" }), "off").points.find((p) => p.id === t)!;
    expect(b.n).toBe(sum(rowsOf(t), 0, false) + sum(rowsOf(t), 8, false));
    expect(b.n).toBeLessThan(a.n);
    const r = population(nfl, base({ window: "recent", recentN: 2 }), "off").points.find((p) => p.id === t)!;
    expect(r.games).toBe(2);
  });

  test("quadrants: offense best corner is steady and explosive; for defense low and low is best, labels flip correctly", () => {
    expect(quadrant("off", true, true)).toMatchObject({ label: "Steady and explosive", best: true });
    expect(quadrant("off", true, false).label).toBe("Steady, few big plays");
    expect(quadrant("off", false, true).label).toBe("Boom or bust");
    expect(quadrant("off", false, false).label).toBe("Struggles on both");
    for (const m of ["pass", "rush"] as const) expect(quadrant(m, true, true).best).toBe(true);
    expect(quadrant("def", false, false)).toMatchObject({ label: "Shuts down both", best: true });
    expect(quadrant("def", true, true)).toMatchObject({ label: "Struggles on both", best: false });
    expect(quadrant("def", false, true).label).toContain("gives up big plays");
    expect(quadrant("def", true, false).label).toContain("few big plays");
    // Boom or bust never appears on defense.
    const labels = [true, false].flatMap((x) => [true, false].map((y) => quadrant("def", x, y).label));
    expect(labels).not.toContain("Boom or bust");
    const pop = population(nfl, base(), "off");
    const counts = quadrantCounts("off", pop.points, pop.line!);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(pop.points.length);
    expect(quadrantOf("off", { x: pop.line!.x, y: pop.line!.y }, pop.line!).label).toBe("Steady and explosive");
  });

  const line = { x: 0.47, y: 0.09 }, sd = { x: 0.04, y: 0.02 };
  const pt = (x: number, y: number, over: Partial<BpPoint> = {}): BpPoint => ({ id: "T", x, y, n: 400, games: 6, small: false, ...over });

  test("takeaway levels use a 0.4 standard-deviation band around the league line", () => {
    expect(DEADBAND).toBe(0.4);
    expect(levelOf(0.47 + 0.39 * 0.04, 0.47, 0.04)).toBe("mid");
    expect(levelOf(0.47 + 0.41 * 0.04, 0.47, 0.04)).toBe("hi");
    expect(levelOf(0.47 - 0.017, 0.47, 0.04)).toBe("lo");
  });

  test("takeaway: steady, relies on big plays, and struggling, with the numbers and league values", () => {
    const steady = bigPlayTakeaway({ name: "Wolves", mode: "off", p: pt(0.55, 0.06), line, sd });
    expect(steady.text).toContain("Steady, but few big plays");
    expect(steady.text).toContain("55% of plays succeeded (league 47%)");
    const boom = bigPlayTakeaway({ name: "Wolves", mode: "off", p: pt(0.4, 0.13), line, sd });
    expect(boom.text).toContain("Relies on big plays");
    expect(bigPlayTakeaway({ name: "W", mode: "off", p: pt(0.55, 0.13), line, sd }).text).toContain("Steady and explosive");
    expect(bigPlayTakeaway({ name: "W", mode: "off", p: pt(0.4, 0.05), line, sd }).text).toContain("Struggling on both");
    expect(bigPlayTakeaway({ name: "W", mode: "off", p: pt(0.47, 0.09), line, sd }).text).toContain("Close to the league on both");
    expect(bigPlayTakeaway({ name: "W", mode: "pass", p: pt(0.55, 0.06), line, sd }).text).toContain("W passing:");
  });

  test("takeaway on defense reads low as good", () => {
    const d = bigPlayTakeaway({ name: "Wolves", mode: "def", p: pt(0.4, 0.05), line, sd });
    expect(d.text).toContain("Limits both steady gains and big plays");
    expect(d.text).toContain("Opponents succeeded on 40%");
    expect(bigPlayTakeaway({ name: "W", mode: "def", p: pt(0.4, 0.13), line, sd }).text).toContain("gives up big plays");
    expect(bigPlayTakeaway({ name: "W", mode: "def", p: pt(0.55, 0.13), line, sd }).text).toContain("Struggling on both");
  });

  test("takeaway guards: small samples give no verdict, early seasons carry a caution, no causal words", () => {
    const small = bigPlayTakeaway({ name: "W", mode: "off", p: pt(0.4, 0.13, { n: 90, small: true }), line, sd });
    expect(small.text).toContain("too few");
    expect(small.text).not.toContain("Relies on big plays");
    expect(small.small).toContain("swing");
    const early = bigPlayTakeaway({ name: "W", mode: "off", p: pt(0.4, 0.13, { games: 2 }), line, sd });
    expect(early.small).toContain("Only 2 games");
    expect(bigPlayTakeaway({ name: "W", mode: "off", p: pt(0.4, 0.13), line, sd }).small).toBeUndefined();
    expect(bigPlayTakeaway({ name: "W", mode: "off", p: null, line, sd }).text).toContain("no plays");
    for (const [x, y] of [[0.4, 0.13], [0.55, 0.06], [0.55, 0.13], [0.4, 0.05]]) expect(bigPlayTakeaway({ name: "W", mode: "off", p: pt(x, y), line, sd }).text).not.toMatch(/because|due to|caused|thanks to/);
  });

  test("the mode lives in the shared selection and defense is the shared Side control", () => {
    expect(modeOf(base())).toBe("off");
    for (const m of BP_MODES.map((x) => x.id)) expect(modeOf(base(modePatch(m)))).toBe(m);
    expect(modePatch("def")).toEqual({ side: "def" });
    expect(modeOf(base({ side: "def", metric: "bp-pass" }))).toBe("def");
    expect(modeOf(base({ metric: "passOff" }))).toBe("off");
  });

  test("keyboard neighbor search picks the closest dot in the arrow's direction and stays put at an edge", () => {
    const p = [{ id: "a", px: 0, py: 0 }, { id: "b", px: 50, py: 5 }, { id: "c", px: 40, py: 60 }, { id: "d", px: 100, py: 0 }, { id: "e", px: 0, py: 100 }];
    expect(neighbor(p, "a", "right")).toBe("b");
    expect(neighbor(p, "a", "down")).toBe("e"); // in line beats nearer-but-off-axis
    expect(neighbor(p, "b", "down")).toBe("c");
    expect(neighbor(p, "b", "left")).toBe("a");
    expect(neighbor(p, "a", "left")).toBe("a");
    expect(neighbor(p, "a", "up")).toBe("a");
    expect(neighbor(p, "zzz", "up")).toBe("a");
    // every dot can be reached from the first by repeating one direction
    const seen = new Set<string>(["a"]); let cur = "a";
    for (let i = 0; i < 10; i++) { cur = neighbor(p, cur, "right"); seen.add(cur); }
    expect(seen.size).toBeGreaterThan(1);
  });

  test("the table alternative sorts by every column in both directions", () => {
    const pop = population(nfl, base(), "off");
    const name = (id: string) => nfl.teams[id].name;
    const quad = (p: BpPoint) => quadrantOf("off", p, pop.line!).label;
    const byX = sortPoints(pop.points, "x", -1, name, quad);
    expect(byX.map((p) => p.x)).toEqual([...pop.points].map((p) => p.x).sort((a, b) => b - a));
    expect(sortPoints(pop.points, "x", 1, name, quad)[0].x).toBe(Math.min(...pop.points.map((p) => p.x)));
    expect(sortPoints(pop.points, "name", 1, name, quad).map((p) => name(p.id))).toEqual(pop.points.map((p) => name(p.id)).sort((a, b) => a.localeCompare(b)));
    expect(sortPoints(pop.points, "y", -1, name, quad)[0].y).toBe(Math.max(...pop.points.map((p) => p.y)));
    expect(sortPoints(pop.points, "n", -1, name, quad)[0].n).toBe(Math.max(...pop.points.map((p) => p.n)));
    expect(sortPoints(pop.points, "quad", 1, name, quad).map(quad)).toEqual(pop.points.map(quad).sort((a, b) => a.localeCompare(b)));
  });

  test("the stored big plays follow the stated thresholds (20+ yard passes, 10+ yard runs) and match the explosive counts", () => {
    expect(nfl.config.explosive).toEqual({ pass: 20, rush: 10 });
    for (const r of nfl.rows) {
      for (const k of r.k) expect(k[2]).toBeGreaterThanOrEqual(k[3] === 1 ? 20 : 10);
      const exp = r.c[3] + r.c[11] + r.x[3] + r.x[11];
      expect(r.k.length).toBe(Math.min(6, exp));
    }
  });

  test("longest plays: five biggest, sorted, pass/rush filters, defense uses the opponents' plays, garbage can be skipped", () => {
    const t = teams[0];
    const all = longestPlays(nfl, base({ team: t }), t, "off");
    const expected = rowsOf(t).flatMap((r) => r.k).map((k) => k[2]).sort((a, b) => b - a).slice(0, 5);
    expect(all.items.map((p) => p.yards)).toEqual(expected);
    expect(all.items.every((p) => p.by === t)).toBe(true);
    for (const t2 of teams.slice(0, 6)) {
      const pass = longestPlays(nfl, base({ team: t2 }), t2, "pass");
      expect(pass.items.every((p) => p.pass)).toBe(true);
      const rush = longestPlays(nfl, base({ team: t2 }), t2, "rush");
      expect(rush.items.every((p) => !p.pass)).toBe(true);
      const def = longestPlays(nfl, base({ team: t2 }), t2, "def");
      expect(def.items.every((p) => p.by !== t2 && p.against === t2)).toBe(true);
      expect(def.items.map((p) => p.yards)).toEqual(oppRowsOf(t2).flatMap((r) => r.k).map((k) => k[2]).sort((a, b) => b - a).slice(0, 5));
    }
    const g = teams.find((x) => rowsOf(x).some((r) => r.k.some((k) => k[6] === 1)));
    if (g) {
      const skip = longestPlays(nfl, base({ team: g, garbage: "skip" }), g, "off", 99);
      expect(skip.items.every((p) => !p.garbage)).toBe(true);
      expect(skip.total).toBeLessThan(longestPlays(nfl, base({ team: g }), g, "off", 99).total);
    }
    expect(longestPlays(nfl, base({ team: t, window: "recent", recentN: 1 }), t, "off", 99).items.every((p) => p.week === Math.max(...rowsOf(t).map((r) => r.w)))).toBe(true);
  });
});

test.describe("Big Plays: in the browser", () => {
  test("a scatter with one dot per team, league crosshair, quadrant labels, thresholds and the selected team marked", async ({ page }) => {
    await open(page);
    await expect(dots(page)).toHaveCount(teams.length);
    const team = await page.locator(".pcontrols select").first().inputValue();
    await expect(dot(page, nfl.teams[team].name)).toHaveCount(1);
    await expect(page.locator(".bp-name", { hasText: nfl.teams[team].name })).toBeVisible();
    for (const label of ["Steady and explosive", "Steady, few big plays", "Boom or bust", "Struggles on both"]) await expect(page.locator(".bp-q", { hasText: label })).toBeVisible();
    await expect(page.locator(".bp-line")).toHaveCount(2);
    await expect(page.getByText("a pass of 20+ yards or a run of 10+ yards").first()).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /succeeded/ }).first()).toBeVisible();
    const pop = population(nfl, base(), "off");
    await expect(page.locator(".bp-linelab").first()).toContainText(`${(pop.line!.x * 100).toFixed(1)}%`);
  });

  test("switching to defense flips the axes' meaning and the quadrant labels", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Defense", exact: true }).click();
    await expect(page.getByText("lower is better on both").first()).toBeVisible();
    await expect(page.locator(".bp-q", { hasText: "Shuts down both" })).toContainText("(best)");
    await expect(page.locator(".bp-q", { hasText: "Boom or bust" })).toHaveCount(0);
    await expect(page.locator(".bp-ax").first()).toContainText("allowed");
    await expect(dots(page)).toHaveCount(teams.length);
    await page.getByRole("button", { name: "Passing", exact: true }).click();
    await expect(page.locator(".bp-q", { hasText: "Boom or bust" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Passing");
  });

  test("clicking a team reveals its six measures, longest plays and a takeaway; compare marks a diamond with its own label", async ({ page }) => {
    await open(page);
    const team = await page.locator(".pcontrols select").first().inputValue();
    const other = teams.find((t) => t !== team)!;
    const name = nfl.teams[other].name;
    await openDot(page, name);
    const card = page.getByRole("region", { name: `${name} details` });
    await expect(card).toBeVisible();
    await expect(card.locator("tbody tr")).toHaveCount(6);
    await expect(card.getByText("longest plays gained").first()).toBeVisible();
    await expect(card.locator(".bp-plays").first().locator(".bp-list li").first()).toBeVisible();
    await expect(card.locator(".bp-plays").first().locator(".bp-list li")).toHaveCount(Math.min(5, longestPlays(nfl, base({ team: other }), other, "off", 99).total));
    await card.getByRole("button", { name: /^Compare with/ }).click();
    await expect(page.locator(".bp-name", { hasText: `◆ ${name}` })).toBeVisible();
    await expect(page.locator(".bp-legend")).toContainText("comparison, diamond");
    // The comparison persisted into the shared selection: the Compare-with control shows it.
    await expect(page.locator(".pcontrols select").nth(1)).toHaveValue(other);
    // pass vs rush filters
    await page.getByRole("button", { name: "Rushing", exact: true }).click();
    await expect(page.locator(".bp-kind", { hasText: "Pass" })).toHaveCount(0);
  });

  test("keyboard: one tab stop, arrows move between dots, Enter opens a team, Escape closes it", async ({ page }) => {
    await open(page);
    await expect(page.locator('.bp-dot[tabindex="0"]')).toHaveCount(1);
    await page.locator('.bp-dot[tabindex="0"]').focus();
    const first = await page.locator(".bp-dot:focus").getAttribute("aria-label");
    // Arrows move to the neighbouring dot; at an edge of the chart a key can stay put, so keys are tried until one moves.
    let next = first;
    for (const key of ["ArrowRight", "ArrowUp", "ArrowDown", "ArrowLeft"]) {
      await page.keyboard.press(key);
      next = await page.locator(".bp-dot:focus").getAttribute("aria-label");
      if (next !== first) break;
    }
    expect(next).not.toBe(first);
    await expect(page.locator('.bp-dot[tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page.locator('.bp-dot[aria-pressed="true"]')).toHaveCount(1);
    const nm = next!.split(":")[0];
    await expect(page.getByRole("region", { name: `${nm} details` })).toBeVisible();
    await expect(page.locator(".tip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('.bp-dot[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator(".tip")).toHaveCount(0);
  });

  test("the table alternative lists every team and sorts", async ({ page }) => {
    await open(page);
    await page.getByText("Show the same data as a table").click();
    const rows = page.locator(".bp-table-d tbody tr");
    await expect(rows).toHaveCount(teams.length);
    await page.getByRole("button", { name: "Explosive rate" }).click();
    const th = page.locator(".bp-table-d th", { has: page.getByRole("button", { name: "Explosive rate" }) });
    await expect(th).toHaveAttribute("aria-sort", "descending");
    const vals = await rows.locator("td:nth-child(3)").allTextContents();
    const nums = vals.map((v) => parseFloat(v));
    expect(nums).toEqual([...nums].sort((a, b) => b - a));
    await page.getByRole("button", { name: "Explosive rate" }).click();
    await expect(th).toHaveAttribute("aria-sort", "ascending");
    // choosing a team from the table opens it
    await rows.nth(0).getByRole("button").click();
    await expect(page.locator(".bp-card .phead h2")).toBeVisible();
  });

  test("selection persists across tabs: defense mode and the team carry into Situations and back", async ({ page }) => {
    await open(page);
    const other = teams.find((t) => t !== "SEA")!;
    await page.locator(".pcontrols select").first().selectOption(other);
    await page.getByRole("button", { name: "Defense", exact: true }).click();
    await goPerf(page, "Situations");
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Opponents against");
    await goPerf(page, "Big Plays");
    await expect(page.locator(".pcontrols select").first()).toHaveValue(other);
    await expect(page.getByRole("button", { name: "Defense", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("the garbage-time toggle changes the plotted plays", async ({ page }) => {
    await open(page);
    const t = teams.find((x) => rowsOf(x).some((r) => r.x.some((v) => v)))!;
    await page.locator(".pcontrols select").first().selectOption(t);
    const a = population(nfl, base({ garbage: "all" }), "off").points.find((p) => p.id === t)!;
    const b = population(nfl, base({ garbage: "skip" }), "off").points.find((p) => p.id === t)!;
    await expect(page.locator(".bp-kv")).toContainText(`${a.n} plays`);
    await page.getByRole("button", { name: "Included" }).click();
    await expect(page.locator(".bp-kv")).toContainText(`${b.n} plays`);
  });

  test("on a 390px phone nothing overflows horizontally and the chart fits", async ({ page }) => {
    await open(page, 390);
    await openDot(page, nfl.teams[teams[3]].name);
    await expect(page.locator(".bp-card")).toBeVisible();
    const m = await page.locator(".pframe").evaluate((f) => {
      const svg = f.querySelector(".bp-chart svg") as SVGElement;
      const wide = [...f.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".tbl-wrap")).length;
      return { page: document.documentElement.scrollWidth - innerWidth, wide, svg: svg.getBoundingClientRect().width };
    });
    expect(m.page).toBeLessThanOrEqual(1);
    expect(m.wide).toBe(0);
    expect(m.svg).toBeLessThanOrEqual(390);
  });

  test("college: FBS-only population, no EPA note, opens fine", async ({ page }) => {
    test.skip(!hasCfb, "perf-cfb.json has not been generated in this worktree");
    const cfb: PerfData = JSON.parse(readFileSync("src/data/perf-cfb.json", "utf8"));
    const fbs = Object.keys(cfb.teams).filter((t) => cfb.teams[t].fbs && cfb.rows.some((r) => r.t === t)).length;
    await page.goto("/?league=CFB");
    await page.getByRole("button", { name: "CFB SP+" }).click();
    await goPerf(page, "Big Plays");
    await expect(dots(page).first()).toBeVisible({ timeout: 15_000 });
    expect(await dots(page).count()).toBeLessThanOrEqual(fbs);
  });
});
