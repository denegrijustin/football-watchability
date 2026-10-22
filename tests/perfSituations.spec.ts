import { test, expect, type Page } from "./fixtures";
import { existsSync, readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";
import { DEFAULT_SELECTION, type PerfData, type PerfRow, type PerfSelection } from "../src/perf/types";
import { downDistanceGrid, summarize } from "../src/perf/engine";
import { isSuccess, V, emptyVec, addPlay } from "../scripts/perf/lib.mjs";
import { EVEN_BELOW, TAKE_MIN_GAP, TAKE_MIN_N, breakdown, makeCell, parseSpec, situationModel, situationTakeaway, specKey, verdictOf, type SituationModel } from "../src/perf/situationsCalc";
import { forEachRow } from "../scripts/nflverse/csv.mjs";
import { goPerf } from "./helpers/perf";

test.beforeEach(async ({ page }) => { await stubFinals(page); });

const nfl: PerfData = JSON.parse(readFileSync("src/data/perf-nfl.json", "utf8"));
const hasCfb = existsSync("src/data/perf-cfb.json");
const short = (id: string) => id;
const base = (over: Partial<PerfSelection> = {}): PerfSelection => ({ ...DEFAULT_SELECTION, ...over });
const teams = Object.keys(nfl.teams).filter((t) => nfl.rows.some((r) => r.t === t));

// Independent recomputation: sum the stored count vectors by hand with literal offsets (15 + (down-1)*8 + bucket*2).
const ddOffset = (down: number, bucket: number) => 15 + (down - 1) * 8 + bucket * 2;
function sumRows(rows: PerfRow[], garbage: boolean) {
  const v = new Array(59).fill(0);
  for (const r of rows) for (let i = 0; i < 59; i++) v[i] += r.c[i] + (garbage ? r.x[i] : 0);
  return v;
}
const offRows = (t: string) => nfl.rows.filter((r) => r.t === t);
const defRows = (t: string) => offRows(t).map((r) => nfl.rows.find((q) => q.g === r.g && q.t === r.o)!);

const garbageTeam = teams.find((t) => offRows(t).some((r) => r.x.some((v) => v)) && offRows(t).length > 2)!;

async function open(page: Page, tab = "Situations", vw = 1280) {
  await page.setViewportSize({ width: vw, height: vw < 700 ? 844 : 900 });
  await page.goto("/?league=NFL");
  const nflBtn = page.locator('.view-switch [data-tab="nfl"]');
  await page.locator(".view-switch").first().waitFor();
  if (!(await nflBtn.isVisible())) await page.locator(".view-switch button", { hasText: "More" }).click();
  await nflBtn.click();
  await goPerf(page, tab);
  await expect(page.getByRole("heading", { level: 1, name: tab })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".pcontrols select").first()).not.toHaveValue("", { timeout: 15_000 });
}
const cells = (page: Page) => page.getByRole("gridcell");
const teamSelect = (page: Page) => page.locator(".pcontrols select").first();

test.describe("Situations: calculations", () => {
  test("every grid cell equals an independent sum of the stored count vectors, offense and defense, for all teams", () => {
    for (const t of teams) {
      for (const side of ["off", "def"] as const) {
        const m = situationModel(nfl, base({ team: t, side }), t, short);
        const v = sumRows(side === "off" ? offRows(t) : defRows(t), true);
        for (let down = 1; down <= 4; down++) for (let b = 0; b < 4; b++) {
          const c = m.grid[down - 1][b];
          expect(c.n, `${t} ${side} ${down}/${b}`).toBe(v[ddOffset(down, b)]);
          expect(c.succ).toBe(v[ddOffset(down, b) + 1]);
          expect(c.rate).toBe(c.n ? c.succ / c.n : null);
        }
        // The six situation splits and the early/late partition agree with the totals.
        expect(m.sits[0].n + m.sits[1].n).toBe(m.overall.n);
        expect(m.sits[3].n + m.sits[4].n + m.sits[5].n).toBe(m.overall.n);
        expect(m.overall.n).toBe(v[0] + v[8]);
      }
    }
  });

  test("the grid is the engine's grid and a defense is the opponents' offense in the same games", () => {
    const t = teams[0];
    const s = summarize(nfl, t, base({ team: t }));
    const eg = downDistanceGrid(s.defVec);
    const m = situationModel(nfl, base({ team: t, side: "def" }), t, short);
    expect(m.grid.map((r) => r.map((c) => [c.n, c.succ]))).toEqual(eg.map((r) => r.map((c) => [c.n, c.succ])));
  });

  test("success is defined as 40% of the yards on 1st down, 60% on 2nd, all on 3rd and 4th, and a touchdown always counts", () => {
    expect(isSuccess(1, 10, 4, false)).toBe(true);
    expect(isSuccess(1, 10, 3, false)).toBe(false);
    expect(isSuccess(2, 10, 6, false)).toBe(true);
    expect(isSuccess(2, 10, 5, false)).toBe(false);
    expect(isSuccess(3, 5, 5, false)).toBe(true);
    expect(isSuccess(3, 5, 4, false)).toBe(false);
    expect(isSuccess(4, 1, 1, false)).toBe(true);
    expect(isSuccess(3, 12, 1, true)).toBe(true);
    // ...and a play lands in the matching cell: 3rd and 4 is in "4-6", 3rd and 10 in "10+", 1st and goal-to-go style 1-3.
    const v = emptyVec();
    addPlay(v, { kind: "pass", down: 3, ytg: 4, yl: 50, yards: 4, td: false, sack: false, int: false, fumLost: false, margin: 0, epa: null });
    addPlay(v, { kind: "rush", down: 3, ytg: 3, yl: 50, yards: 2, td: false, sack: false, int: false, fumLost: false, margin: 0, epa: null });
    addPlay(v, { kind: "rush", down: 3, ytg: 10, yl: 50, yards: 12, td: false, sack: false, int: false, fumLost: false, margin: 0, epa: null });
    const g = downDistanceGrid(v)[2];
    expect([g[0].n, g[0].succ, g[1].n, g[1].succ, g[3].n, g[3].succ]).toEqual([1, 0, 1, 1, 1, 1]);
  });

  test("skipping garbage time removes exactly the garbage-time plays and changes counts", () => {
    const t = garbageTeam;
    const all = situationModel(nfl, base({ team: t, garbage: "all" }), t, short);
    const skip = situationModel(nfl, base({ team: t, garbage: "skip" }), t, short);
    const clean = sumRows(offRows(t), false);
    const dirty = sumRows(offRows(t), true);
    expect(all.overall.n).toBe(dirty[0] + dirty[8]);
    expect(skip.overall.n).toBe(clean[0] + clean[8]);
    expect(skip.overall.n).toBeLessThan(all.overall.n);
    expect(skip.grid.flat().reduce((a, c) => a + c.n, 0)).toBeLessThanOrEqual(all.grid.flat().reduce((a, c) => a + c.n, 0));
  });

  test("small samples (under 20 plays) are flagged and never get a better-or-worse verdict", () => {
    const m = situationModel(nfl, base({ team: teams[0] }), teams[0], short);
    for (const c of m.grid.flat()) {
      expect(c.small).toBe(c.n < 20);
      if (c.small && c.diff != null) expect(c.verdict).toBe("unsure");
    }
    expect(m.grid.flat().some((c) => c.small)).toBe(true);
    expect(verdictOf(0.2, "off", 19, 500)).toBe("unsure");
    expect(verdictOf(0.2, "off", 20, 500)).toBe("better");
    expect(verdictOf(0.2, "off", 500, 19)).toBe("unsure");
    expect(verdictOf(null, "off", 500, 500)).toBe("none");
  });

  test("a difference is good or bad by side: higher is better for an offense, lower for a defense; under 3 points is about even", () => {
    expect(verdictOf(EVEN_BELOW - 0.001, "off", 100, 1000)).toBe("even");
    expect(verdictOf(-(EVEN_BELOW - 0.001), "def", 100, 1000)).toBe("even");
    expect(verdictOf(0.08, "off", 100, 1000)).toBe("better");
    expect(verdictOf(-0.08, "off", 100, 1000)).toBe("worse");
    expect(verdictOf(0.08, "def", 100, 1000)).toBe("worse");
    expect(verdictOf(-0.08, "def", 100, 1000)).toBe("better");
  });

  test("benchmarks: league average, a comparison team on the same side, or none", () => {
    const [a, b] = teams;
    const lg = situationModel(nfl, base({ team: a, bench: "league" }), a, short);
    const op = situationModel(nfl, base({ team: a, opp: b, bench: "opp", side: "def" }), a, short);
    const none = situationModel(nfl, base({ team: a, bench: "none" }), a, short);
    expect(lg.benchLabel).toBe("league average");
    const leagueN = sumRows(nfl.rows, true);
    expect(lg.grid[2][1].benchN).toBe(leagueN[ddOffset(3, 1)]);
    expect(op.benchLabel).toBe(b);
    expect(op.grid[2][1].benchN).toBe(sumRows(defRows(b), true)[ddOffset(3, 1)]);
    expect(none.hasBench).toBe(false);
    expect(none.grid[2][1].diff).toBeNull();
  });

  test("the per-game breakdown adds up to the cell and honors the window", () => {
    const t = teams[0];
    for (const key of ["dd:3:1", "dd:1:3", "sit:rz", "sit:trail"]) {
      for (const side of ["off", "def"] as const) {
        const sel = base({ team: t, side });
        const m = situationModel(nfl, sel, t, short);
        const spec = parseSpec(key)!;
        const cell = [...m.grid.flat(), ...m.sits].find((c) => c.key === key)!;
        const b = breakdown(nfl, sel, t, spec);
        expect(b.total.n).toBe(cell.n);
        expect(b.total.succ).toBe(cell.succ);
        expect(b.lines.length).toBe(offRows(t).length);
      }
    }
    const recent = breakdown(nfl, base({ team: t, window: "recent", recentN: 2 }), t, parseSpec("sit:early")!);
    expect(recent.lines.length).toBe(2);
    expect(recent.total.n).toBe(situationModel(nfl, base({ team: t, window: "recent", recentN: 2 }), t, short).sits[0].n);
  });

  test("the shared metric slot is validated: other tabs' values and junk give no selection", () => {
    expect(parseSpec("passOff")).toBeNull();
    expect(parseSpec("dd:5:1")).toBeNull();
    expect(parseSpec("dd:3:4")).toBeNull();
    expect(parseSpec("sit:nope")).toBeNull();
    expect(parseSpec(null)).toBeNull();
    expect(specKey(parseSpec("dd:3:1")!)).toBe("dd:3:1");
    expect(parseSpec("sit:rz")).toEqual({ kind: "sit", id: "rz" });
  });

  const mk = (over: { early?: [number, number]; late?: [number, number]; rz?: [number, number]; lead?: [number, number]; tied?: [number, number]; trail?: [number, number]; side?: "off" | "def"; bench?: boolean; games?: number }): SituationModel => {
    const v = emptyVec(), b = emptyVec();
    const set = (vec: number[], i: number, [n, s]: [number, number]) => { vec[i] = n; vec[i + 1] = s; };
    const L = { early: V.EARLY, late: V.LATE, rz: V.RZ, lead: V.LEAD, tied: V.TIED, trail: V.TRAIL } as const;
    for (const k of Object.keys(L) as (keyof typeof L)[]) { set(b, L[k], [1000, 450]); set(v, L[k], over[k] ?? [200, 90]); }
    v[V.PN] = 400; v[V.PSUC] = 180; v[V.RN] = 200; v[V.RSUC] = 90;
    const side = over.side ?? "off";
    const bv = over.bench === false ? null : b;
    const sits = (Object.keys(L) as (keyof typeof L)[]).map((k) => makeCell({ kind: "sit", id: k }, v, bv, side));
    return { side, grid: [], sits, overall: { n: 600, succ: 270, rate: 0.45 }, benchOverall: bv ? { n: 6000, rate: 0.45 } : null, benchLabel: bv ? "league average" : null, games: over.games ?? 6, hasBench: !!bv };
  };

  test("takeaway names the best and worst situation only when the gap is at least 8 points on at least 30 plays", () => {
    // trail 100/60 = 60% (+15 vs 45%), late 100/30 = 30% (-15).
    const t = situationTakeaway(mk({ trail: [100, 60], late: [100, 30] }), "Wolves");
    expect(t.text).toContain("Wolves offense is at its best when trailing");
    expect(t.text).toContain("has struggled on third and fourth down");
    expect(t.text).toContain("15 points above the league average");
    // an 8 point gap qualifies, a 7 point gap does not
    expect(situationTakeaway(mk({ rz: [100, 53] }), "W").text).toContain("in the red zone");
    expect(situationTakeaway(mk({ rz: [100, 52] }), "W").text).toContain(`within ${TAKE_MIN_GAP * 100} points`);
    // too few plays: ignored even with a huge gap
    expect(situationTakeaway(mk({ rz: [TAKE_MIN_N - 1, 29] }), "W").text).toContain("within 8 points");
    expect(situationTakeaway(mk({ rz: [TAKE_MIN_N, 30] }), "W").text).toContain("in the red zone");
  });

  test("takeaway reads a defense the other way and never claims a cause", () => {
    // opponents succeed on 30% on 3rd/4th (good for the defense) and 60% when trailing (bad).
    const t = situationTakeaway(mk({ side: "def", late: [100, 30], trail: [100, 60] }), "Wolves");
    expect(t.text).toContain("Wolves defense holds opponents down most on third and fourth down");
    expect(t.text).toContain("has had the most trouble when trailing");
    expect(t.text).not.toMatch(/because|due to|caused/);
  });

  test("takeaway without a benchmark compares with the team's own overall rate; empty and early samples are handled", () => {
    const t = situationTakeaway(mk({ bench: false, late: [100, 20] }), "W");
    expect(t.text).toContain("its own overall rate");
    expect(situationTakeaway(mk({ games: 2 }), "W").small).toContain("early read");
    expect(situationTakeaway(mk({}), "W").small).toBeUndefined();
    expect(situationTakeaway({ ...mk({}), games: 0 }, "W").text).toBeNull();
    const thin = mk({ early: [10, 5], late: [10, 5], rz: [10, 5], lead: [10, 5], tied: [10, 5], trail: [10, 5] });
    expect(situationTakeaway(thin, "W").text).toContain("not yet enough plays");
  });

  test("raw play-by-play (when cached) gives the same down-and-distance cells outside garbage time", async () => {
    test.skip(!existsSync(".cache/nflverse/pbp_2026.csv.gz"), "nflverse play-by-play is not cached here");
    const want = new Map<string, number[]>(); // team|down|bucket -> [n, succ]
    const gap = [38, 28, 22, 16];
    const known = new Set(nfl.games.map((g) => g.id));
    await forEachRow(".cache/nflverse/pbp_2026.csv.gz", (ix: Record<string, number>, f: string[]) => {
      if (!known.has(f[ix.game_id]) || !f[ix.posteam]) return;
      const pt = f[ix.play_type];
      if ((pt !== "pass" && pt !== "run") || f[ix.qb_kneel] === "1" || f[ix.qb_spike] === "1" || f[ix.two_point_attempt] === "1") return;
      const down = Number(f[ix.down]), ytg = Number(f[ix.ydstogo]);
      if (!f[ix.down] || !f[ix.ydstogo] || !f[ix.yardline_100]) return;
      const q = Number(f[ix.qtr]), margin = Number(f[ix.score_differential] || 0);
      if (q <= 4 && Math.abs(margin) > gap[q - 1]) return;
      const yards = Number(f[ix.yards_gained] || 0);
      const td = f[pt === "pass" ? ix.pass_touchdown : ix.rush_touchdown] === "1";
      const bucket = ytg <= 3 ? 0 : ytg <= 6 ? 1 : ytg <= 9 ? 2 : 3;
      const need = down === 1 ? 0.4 * ytg : down === 2 ? 0.6 * ytg : ytg;
      const k = `${f[ix.posteam]}|${down}|${bucket}`;
      const e = want.get(k) ?? want.set(k, [0, 0]).get(k)!;
      e[0]++; if (td || yards >= need) e[1]++;
    });
    for (const t of teams.slice(0, 8)) {
      const m = situationModel(nfl, base({ team: t, garbage: "skip" }), t, short);
      for (let d = 1; d <= 4; d++) for (let b = 0; b < 4; b++) expect([m.grid[d - 1][b].n, m.grid[d - 1][b].succ], `${t} ${d}/${b}`).toEqual(want.get(`${t}|${d}|${b}`) ?? [0, 0]);
    }
  });
});

test.describe("Situations: in the browser", () => {
  test("the grid shows the same counts and success rates as the calculation, with sample sizes in every cell", async ({ page }) => {
    await open(page);
    await expect(cells(page)).toHaveCount(16);
    const team = await teamSelect(page).inputValue();
    const m = situationModel(nfl, base({ team }), team, short);
    for (const [i, c] of m.grid.flat().entries()) {
      const cell = cells(page).nth(i);
      if (c.n === 0) await expect(cell).toContainText("no plays");
      else {
        await expect(cell).toContainText(`n=${c.n}`);
        await expect(cell).toContainText(`${Math.round((c.rate as number) * 100)}%`);
      }
      if (c.small && c.n > 0) { await expect(cell).toContainText("n<20"); await expect(cell).toHaveClass(/small/); }
    }
    // a cell with no plays is "no plays", never 0%
    const empty = m.grid.flat().findIndex((c) => c.n === 0);
    if (empty >= 0) await expect(cells(page).nth(empty)).not.toContainText("0%");
  });

  test("a takeaway leads, and the benchmark difference carries a direction mark and number, not only color", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("status").filter({ hasText: /offense/ }).first()).toBeVisible();
    const team = await teamSelect(page).inputValue();
    const m = situationModel(nfl, base({ team }), team, short);
    const idx = m.grid.flat().findIndex((c) => c.verdict === "worse" || c.verdict === "better");
    expect(idx).toBeGreaterThanOrEqual(0);
    await expect(cells(page).nth(idx)).toContainText(/[▲▼]\s?[+−]\d+/);
    await expect(cells(page).nth(idx)).toHaveAttribute("aria-label", /points (above|below) league average/);
  });

  test("the garbage-time toggle changes the counts to the independent sums", async ({ page }) => {
    await open(page);
    await teamSelect(page).selectOption(garbageTeam);
    const all = sumRows(offRows(garbageTeam), true), clean = sumRows(offRows(garbageTeam), false);
    await expect(page.locator(".sg-all")).toContainText(`(${all[0] + all[8]})`);
    await page.getByRole("button", { name: "Included" }).click();
    await expect(page.locator(".sg-all")).toContainText(`(${clean[0] + clean[8]})`);
    expect(clean[0] + clean[8]).toBeLessThan(all[0] + all[8]);
  });

  test("keyboard: one tab stop, arrows move between boxes, Enter opens the game breakdown, Escape closes it", async ({ page }) => {
    await open(page);
    await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
    await page.locator('[role="gridcell"][tabindex="0"]').focus();
    const first = await page.locator('[role="gridcell"][tabindex="0"]').getAttribute("aria-label");
    await page.keyboard.press("ArrowRight");
    const second = await page.locator('[role="gridcell"]:focus').getAttribute("aria-label");
    expect(second).not.toBe(first);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press("Enter");
    const detail = page.getByRole("region", { name: /Game by game/ });
    await expect(detail).toBeVisible();
    await expect(detail.locator("tbody tr").first()).toBeVisible();
    await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
  });

  test("selecting a box shows plays and successes per game that add up to the box", async ({ page }) => {
    await open(page);
    const team = await teamSelect(page).inputValue();
    const m = situationModel(nfl, base({ team }), team, short);
    const idx = m.grid.flat().findIndex((c) => c.n >= 30);
    await cells(page).nth(idx).click();
    const detail = page.getByRole("region", { name: /Game by game/ });
    const foot = detail.locator("tfoot tr");
    const c = m.grid.flat()[idx];
    await expect(foot.locator("th").nth(1)).toHaveText(String(c.n));
    await expect(foot.locator("th").nth(2)).toHaveText(String(c.succ));
    await expect(detail).toContainText("not the individual plays");
    await expect(detail.locator("tbody tr")).toHaveCount(offRows(team).length);
  });

  test("selections persist across tabs: team, cell, defense side", async ({ page }) => {
    await open(page);
    const other = teams.find((t) => t !== "SEA")!;
    await teamSelect(page).selectOption(other);
    await cells(page).nth(5).click();
    await page.getByRole("button", { name: "Defense" }).first().click();
    await goPerf(page, "Big Plays");
    await expect(page.getByRole("heading", { level: 1, name: "Big Plays" })).toBeVisible();
    await expect(teamSelect(page)).toHaveValue(other);
    await goPerf(page, "Situations");
    await expect(teamSelect(page)).toHaveValue(other);
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Opponents against");
    await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(1);
    await expect(page.getByRole("region", { name: /Game by game/ })).toBeVisible();
  });

  test("defense labels the direction: lower is better for the defense", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Defense" }).first().click();
    await expect(page.getByText("lower is better for the defense").first()).toBeVisible();
    await expect(page.locator(".sg-legend")).toContainText("lower is better for the defense");
    await page.getByRole("button", { name: "Difference" }).click();
    await expect(page.locator(".sg-legend")).toContainText("Better than");
  });

  test("the situation cards and focus views work: early, late, red zone, score", async ({ page }) => {
    await open(page);
    await expect(page.locator(".scard")).toHaveCount(6);
    await page.getByRole("button", { name: "Red zone" }).first().click();
    await expect(page.locator(".scard")).toHaveCount(1);
    await page.getByRole("button", { name: "Leading, tied, trailing" }).click();
    await expect(page.locator(".scard")).toHaveCount(3);
    await page.locator(".scard").first().click();
    await expect(page.locator(".scard").first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: /Game by game/ })).toBeVisible();
    await page.getByRole("button", { name: "Early downs" }).click();
    await expect(page.locator(".sg-row.dim")).toHaveCount(2);
  });

  test("on a 390px phone nothing overflows horizontally", async ({ page }) => {
    await open(page, "Situations", 390);
    await expect(cells(page)).toHaveCount(16);
    await cells(page).nth(7).click();
    await expect(page.getByRole("region", { name: /Game by game/ })).toBeVisible();
    const over = await page.locator(".pframe").evaluate((f) => {
      const wide = [...f.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && !e.closest(".tbl-wrap"); }).length;
      return { page: document.documentElement.scrollWidth - innerWidth, wide };
    });
    expect(over.page).toBeLessThanOrEqual(1);
    expect(over.wide).toBe(0);
  });

  test("college: no EPA is stated and the grid still works", async ({ page }) => {
    test.skip(!hasCfb, "perf-cfb.json has not been generated in this worktree");
    await stubFinals(page);
    await page.goto("/?league=CFB");
    await page.getByRole("button", { name: "CFB SP+" }).click();
    await goPerf(page, "Situations");
    await expect(page.getByRole("note").filter({ hasText: "EPA" })).toBeVisible({ timeout: 15_000 });
    await expect(cells(page)).toHaveCount(16);
  });
});
