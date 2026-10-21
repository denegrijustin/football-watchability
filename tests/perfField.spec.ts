import { test, expect, type Page } from "./fixtures";
import { readFileSync, existsSync } from "node:fs";
import { stubFinals } from "./helpers/finals";
import type { PerfData, PerfRow } from "../src/perf/types";
import { DEFAULT_SELECTION } from "../src/perf/types";
import { fieldPosition, gamesFor, leagueAverage } from "../src/perf/engine";
import {
  FAVORABLE_GAP, NBINS, afterTakeawayLine, bandDrives, binBand, binLabel, expectedFromField, fieldData, fieldSlot, fieldTakeaway, fumbleStats, fumblesSupported, histogram, mix,
  parseFieldSlot, turnoversByGame,
} from "../src/perf/fieldCalc";

const data: PerfData = JSON.parse(readFileSync("src/data/perf-nfl.json", "utf8"));
const SEL = { ...DEFAULT_SELECTION, team: "SEA" };
const rowsOf = (team: string) => data.rows.filter((r) => r.t === team).sort((a, b) => a.w - b.w);
const BANDS = [[81, 99], [61, 80], [41, 60], [21, 40], [1, 20]];
const counted = (rows: PerfRow[]) => rows.flatMap((r) => r.d).filter((d) => d[6] !== 7);

test.beforeEach(async ({ page }) => { await stubFinals(page); });

test.describe("Field position: the numbers", () => {
  test("band counts, points per drive and the short-field share reconcile with the raw drives", () => {
    for (const team of ["SEA", "GB", "LV"]) {
      const ds = counted(rowsOf(team));
      const fp = fieldPosition(rowsOf(team), "all");
      expect(fp.drives).toBe(ds.length);
      BANDS.forEach(([lo, hi], i) => {
        const inBand = ds.filter((d) => d[2] >= lo && d[2] <= hi);
        expect(fp.bands[i].drives).toBe(inBand.length);
        if (inBand.length) expect(fp.bands[i].pointsPerDrive).toBeCloseTo(inBand.reduce((s, d) => s + d[7], 0) / inBand.length, 10);
        else expect(fp.bands[i].pointsPerDrive).toBeNull();
      });
      expect(fp.bands.reduce((s, b) => s + b.drives, 0)).toBe(ds.length);
      expect(fp.favorableShare).toBeCloseTo(ds.filter((d) => d[2] <= 40).length / ds.length, 10);
      // the histogram is the same drives in 5-yard groups
      const h = histogram(rowsOf(team), "all");
      expect(h).toHaveLength(NBINS);
      expect(h.reduce((s, n) => s + n, 0)).toBe(ds.length);
      for (let b = 0; b < 5; b++) expect(h.filter((_, i) => binBand(i) === b).reduce((s, n) => s + n, 0)).toBe(fp.bands[b].drives);
    }
    expect(binLabel(0)).toBe("opp 5 to opp 1");
    expect(binLabel(19)).toBe("own 1 to own 4");
  });

  test("giveaways and takeaways reconcile, game by game and for the season", () => {
    const rows = gamesFor(data, "SEA", SEL);
    const ds = counted(rows);
    const fp = fieldPosition(rows, "all");
    expect(fp.giveaways).toBe(ds.filter((d) => d[6] === 3 || d[6] === 4).length);
    expect(fp.takeaways).toBe(ds.filter((d) => d[8] === 2 || d[8] === 3).length);
    expect(fp.pointsAfterTakeaways).toBe(ds.filter((d) => d[8] === 2 || d[8] === 3).reduce((s, d) => s + d[7], 0));
    const tg = turnoversByGame(rows, "all");
    expect(tg).toHaveLength(rows.length);
    expect(tg.reduce((s, g) => s + g.gives, 0)).toBe(fp.giveaways);
    expect(tg.reduce((s, g) => s + g.takes, 0)).toBe(fp.takeaways);
    expect(tg.at(-1)!.running).toBe(fp.takeaways - fp.giveaways);
    expect(tg.every((g, i) => g.margin === g.takes - g.gives && g.week === rows[i].w)).toBe(true);
  });

  test("a band's drives are exactly that band, and the endings add up", () => {
    const fd = fieldData(data, SEL, (id) => id)!;
    for (let b = 0; b < 5; b++) {
      const list = bandDrives(fd.rows, "all", b);
      expect(list.length).toBe(fd.fp.bands[b].drives);
      expect(list.every((x) => x.tuple[2] >= BANDS[b][0] && x.tuple[2] <= BANDS[b][1])).toBe(true);
      const m = mix(list.map((x) => x.tuple));
      expect(m.td + m.fg + m.turnover + m.empty).toBe(list.length);
      expect(m.td).toBe(list.filter((x) => x.tuple[6] === 0).length);
    }
  });

  test("the league yardstick and the benchmark come from the same engine", () => {
    const fd = fieldData(data, SEL, (id) => id)!;
    const l = leagueAverage(data, SEL);
    expect(fd.league.drives).toBe(fieldPosition(l.games, "all").drives);
    expect(fd.bench!.fp.drives).toBe(fd.league.drives);
    expect(fieldData(data, { ...SEL, bench: "none" }, (id) => id)!.bench).toBeNull();
    const vs = fieldData(data, { ...SEL, bench: "opp", opp: "KC" }, (id) => `team ${id}`)!;
    expect(vs.bench!.name).toBe("team KC");
    expect(vs.bench!.fp.drives).toBe(fieldPosition(rowsOf("KC"), "all").drives);
    // garbage time changes the counts
    expect(fieldData(data, { ...SEL, team: "KC", garbage: "skip" }, (id) => id)!.fp.drives).toBeLessThanOrEqual(fieldData(data, { ...SEL, team: "KC" }, (id) => id)!.fp.drives);
    expect(fieldPosition(data.rows, "skip").drives).toBeLessThan(fieldPosition(data.rows, "all").drives);
  });

  test("points after takeaways are defined, compared with what the field alone is worth, and never called a cause", () => {
    const fd = fieldData(data, SEL, (id) => id)!;
    const exp = expectedFromField(fd.fp.afterTakeaway, fd.league)!;
    expect(exp).toBeGreaterThan(0);
    const line = afterTakeawayLine("Seahawks", fd.fp, exp);
    expect(line.text).toContain(`After ${fd.fp.takeaways} takeaway`);
    expect(line.text).toContain("whatever way they began");
    expect(line.text).not.toMatch(/because|caused|thanks to/i);
    expect(data.definitions.afterTurnover).toContain("not all caused by the turnover");
    expect(afterTakeawayLine("Seahawks", { ...fd.fp, takeaways: 0, afterTakeaway: [], pointsAfterTakeaways: 0, scoredAfterTakeaway: 0 }, null).text).toContain("no takeaways");
    expect(afterTakeawayLine("X", { ...fd.fp, takeaways: 3, scoredAfterTakeaway: 2, pointsAfterTakeaways: 13 }, 3.4).small).toContain("Only 3");
    const hi = afterTakeawayLine("X", { ...fd.fp, takeaways: 10, scoredAfterTakeaway: 9, pointsAfterTakeaways: 60 }, 3.4).text;
    expect(hi).toContain("above what the field position alone suggests");
    expect(afterTakeawayLine("X", { ...fd.fp, takeaways: 10, scoredAfterTakeaway: 3, pointsAfterTakeaways: 20 }, 3.4).text).toContain("below");
    expect(afterTakeawayLine("X", { ...fd.fp, takeaways: 10, scoredAfterTakeaway: 5, pointsAfterTakeaways: 34 }, 3.4).text).toContain("in line with");
    expect(expectedFromField([], fd.league)).toBeNull();
  });

  test("the sentence follows fixed rules and warns about small samples", () => {
    const fd = fieldData(data, SEL, (id) => id)!;
    const base = { name: "Seahawks", benchName: "the league average", fp: fd.fp, games: 6 };
    const fav = fd.fp.favorableShare as number;
    const t = fieldTakeaway({ ...base, bench: { ...fd.fp, favorableShare: fav - 0.1 } });
    expect(t.text).toContain("more often than the league average");
    expect(fieldTakeaway({ ...base, bench: { ...fd.fp, favorableShare: fav + 0.1 } }).text).toContain("less often than");
    expect(fieldTakeaway({ ...base, bench: { ...fd.fp, favorableShare: fav + FAVORABLE_GAP / 2 } }).text).toContain("about as often as");
    expect(t.text).toContain(`${fd.fp.takeaways} takeaway`);
    expect(t.text).toContain(`${fd.fp.giveaways} giveaway`);
    expect(t.text).toMatch(/margin is [+−]?\d/);
    expect(t.small).toBeUndefined();
    expect(fieldTakeaway({ ...base, games: 2, bench: null }).small).toContain("Only");
    expect(fieldTakeaway({ ...base, bench: null }).text).not.toContain("league average");
    expect(fieldTakeaway({ ...base, fp: { ...fd.fp, drives: 0, favorableShare: null }, bench: null }).text).toContain("no drives");
  });

  test("fumble rates exist only where the data supports them", () => {
    const rows = gamesFor(data, "SEA", SEL);
    const league = [...new Set(data.rows)];
    const f = fumbleStats(data, rows, league);
    expect(f.ours.fumbles).toBe(rows.reduce((s, r) => s + r.fu[0], 0));
    expect(f.ours.lost).toBeLessThanOrEqual(f.ours.fumbles);
    expect(f.league.fumbles).toBe(data.rows.reduce((s, r) => s + r.fu[0], 0));
    expect(fumblesSupported(data, f)).toBe(true);
    expect(fumblesSupported({ ...data, config: { ...data.config, hasFumbles: false } }, f)).toBe(false);
    expect(fumblesSupported(data, { ...f, league: { fumbles: 0, lost: 0 } })).toBe(false);
  });

  test("the selection slot is validated", () => {
    expect(parseFieldSlot(fieldSlot(3))).toBe(3);
    expect(parseFieldSlot("fld:band:9")).toBeNull();
    expect(parseFieldSlot("passOff")).toBeNull();
    expect(parseFieldSlot(null)).toBeNull();
  });
});

const openField = async (page: Page) => {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "NFL+" }).click();
  await page.getByRole("tab", { name: "Field Position & Turnovers", exact: true }).click();
  await expect(page.locator(".fl-brow").first()).toBeVisible({ timeout: 15_000 });
};
const fd = fieldData(data, SEL, (id) => id)!;

test.describe("Field position: the tab", () => {
  test("@smoke it shows the takeaway, the histogram, five bands, the turnover chart and the definition", async ({ page }) => {
    await openField(page);
    await expect(page.locator(".ptake")).toContainText("started at the opponent's 40 or closer");
    await expect(page.locator(".ptake")).toContainText(`${fd.fp.takeaways} takeaway`);
    await expect(page.locator(".fl-brow")).toHaveCount(5);
    await expect(page.locator(".fl-bin")).toHaveCount(NBINS);
    await expect(page.locator(".fl-col")).toHaveCount(fd.rows.length);
    await expect(page.locator(".fl-def")).toContainText("not all caused by the turnover");
    await expect(page.locator(".fl-def")).toContainText("short field might have scored anyway");
    await expect(page.getByText("Fumble recoveries")).toBeVisible();
    await expect(page.locator("section[aria-label='Fumble recoveries'] .dv-card")).toHaveCount(3);
  });

  test("clicking a band filters to that band's drives and shows its points per drive against the league", async ({ page }) => {
    await openField(page);
    await page.locator(".fl-bbtn").nth(3).click();
    await expect(page.locator(".fl-bbtn").nth(3)).toHaveAttribute("aria-pressed", "true");
    const panel = page.locator("#fl-banddetail");
    await expect(panel).toContainText("Opp 40–21".toLowerCase().replace("opp", "opp"));
    await expect(panel.locator("tbody tr")).toHaveCount(fd.fp.bands[3].drives);
    await expect(panel).toContainText(`league ${fd.league.bands[3].pointsPerDrive!.toFixed(2)}`);
    await expect(panel.locator(".fl-mixbar")).toHaveCount(2);
    // the histogram highlights the same band, and a second click clears it
    await page.locator(".fl-bbtn").nth(3).click();
    await expect(panel).toHaveCount(0);
  });

  test("a histogram bar selects its band, by mouse or keyboard", async ({ page }) => {
    await openField(page);
    const bin = page.locator(".fl-bin").nth(2); // own 11-15 yards: the "Backed up" band
    await bin.focus();
    await page.keyboard.press("Enter");
    await expect(bin).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".fl-bbtn").nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#fl-banddetail tbody tr")).toHaveCount(fd.fp.bands[0].drives);
    await page.locator(".fl-bin").nth(18).click();
    await expect(page.locator(".fl-bbtn").nth(4)).toHaveAttribute("aria-pressed", "true");
  });

  test("a band's drives open on the field in the Drives tab", async ({ page }) => {
    await openField(page);
    await page.locator(".fl-bbtn").nth(1).click();
    await page.locator("#fl-banddetail tbody tr").first().getByRole("button", { name: /on the field/ }).click();
    await expect(page.locator(".phd h1")).toHaveText("Drives");
    await expect(page.locator(".dv-lane > button[aria-expanded=true]")).toHaveCount(1);
  });

  test("a turnover column selects the game, lists its turnovers, and the game carries to the Drives tab", async ({ page }) => {
    await openField(page);
    const withTurnovers = turnoversByGame(fd.rows, "all").findIndex((g) => g.gives + g.takes > 0);
    const g = turnoversByGame(fd.rows, "all")[withTurnovers];
    const col = page.locator(".fl-col").nth(withTurnovers);
    await col.focus();
    await page.keyboard.press("Enter");
    await expect(col).toHaveAttribute("aria-pressed", "true");
    const panel = page.locator("[aria-label='Turnovers in the selected game']");
    await expect(panel).toContainText(`${g.takes} takeaway`);
    await expect(panel).toContainText(`${g.gives} giveaway`);
    await expect(panel.locator("tbody tr")).toHaveCount(g.gives + g.takes);
    await page.getByRole("tab", { name: "Drives", exact: true }).click();
    await expect(page.locator(".dv-gsel")).toHaveValue(g.row.g);
    await page.getByRole("tab", { name: "Field Position & Turnovers", exact: true }).click();
    await expect(page.locator(".fl-col").nth(withTurnovers)).toHaveAttribute("aria-pressed", "true");
  });

  test("the margin under each column adds up to the season margin", async ({ page }) => {
    await openField(page);
    const last = page.locator(".fl-col").last().locator("text").last();
    const m = fd.fp.takeaways - fd.fp.giveaways;
    await expect(last).toHaveText(m > 0 ? `+${m}` : m < 0 ? `−${-m}` : "0");
  });

  test("changing the comparison team changes the benchmark ticks and cards", async ({ page }) => {
    await openField(page);
    await expect(page.locator(".fl-btick")).toHaveCount(5);
    await page.locator(".pcontrols").getByLabel("Compare with").selectOption("KC");
    await expect(page.locator(".fl-card, .dv-card small").first()).toContainText("Chiefs");
    await page.locator(".pcontrols").getByRole("button", { name: "None" }).click();
    await expect(page.locator(".fl-btick")).toHaveCount(0);
  });

  test("garbage time can be skipped and the band counts follow", async ({ page }) => {
    await openField(page);
    const skip = fieldPosition(rowsOf("SEA"), "skip");
    test.skip(skip.drives === fd.fp.drives, "no SEA garbage time");
    await page.getByRole("button", { name: /Included/ }).click();
    await expect(page.locator(".fl-bshare small").first()).toContainText(`${skip.bands[0].drives} drive`);
  });

  test("without trustworthy fumble data the section says why instead of showing rates", async ({ page }) => {
    await page.route("**/data/perf-nfl.json*", (r) => r.fulfill({ json: { ...data, config: { ...data.config, hasFumbles: false } } }));
    await openField(page);
    const sec = page.locator("section[aria-label='Fumble recoveries']");
    await expect(sec).toContainText("Fumble recovery rates is not available");
    await expect(sec.locator(".dv-card")).toHaveCount(0);
  });

  test("keyboard focus is visible and the tip closes with Escape", async ({ page }) => {
    await openField(page);
    await page.locator(".fl-bin").nth(4).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".fl-hist .tip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".fl-hist .tip")).toHaveCount(0);
  });

  test("no sideways scroll, with a band and a game open", async ({ page }) => {
    await openField(page);
    await page.locator(".fl-bbtn").nth(2).click();
    await page.locator(".fl-col").first().click();
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw + 1);
    for (const sel of [".fl-hist svg", ".fl-turn svg"]) {
      const b = await page.locator(sel).boundingBox();
      expect(b!.width).toBeLessThanOrEqual(iw_of(page) as number);
    }
  });

  test("a team with no games explains itself", async ({ page }) => {
    await page.route("**/data/perf-nfl.json*", (r) => r.fulfill({ json: { ...data, rows: [] } }));
    await page.goto("/?league=NFL");
    await page.getByRole("button", { name: "NFL+" }).click();
    await page.getByRole("tab", { name: "Field Position & Turnovers", exact: true }).click();
    await expect(page.locator(".empty")).toContainText("No games with play-by-play data yet");
  });
});

function iw_of(page: Page) { return page.viewportSize()!.width; }

test("college: the Field Position tab opens when the college file exists", async ({ page }) => {
  test.skip(!existsSync("src/data/perf-cfb.json"), "perf-cfb.json is not in this checkout");
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await page.getByRole("tab", { name: "Field Position & Turnovers", exact: true }).click();
  await expect(page.locator(".fl-brow").first()).toBeVisible({ timeout: 20_000 });
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw + 1);
});
