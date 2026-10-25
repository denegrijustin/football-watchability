import { test, expect, type Page } from "./fixtures";
import { hasCfbGame, NO_CFB } from "./helpers/slate";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { buildLite } from "../src/spplus/liteBuild";
import { projectGame, sheetName, weekFor, type SpLite } from "../src/spplus/lite";
import { buildModel } from "../src/spplus/data/model";
import { atsGames, recordText, tally } from "../src/spplus/data/ats";
import { stubFinals } from "./helpers/finals";
import { expectSppTabs, openSppTab, expectSppTabSelected } from "./helpers/spp";

test.beforeEach(async ({ page }) => { await stubFinals(page); });
const snapshot = JSON.parse(readFileSync("src/data/spplus.json", "utf8"));
const teamIds = JSON.parse(readFileSync("src/data/team-ids.json", "utf8"));
const lite: SpLite = buildLite(snapshot, teamIds);
const model = buildModel(snapshot);

/** Serve the same lite file the test computes against, and turn the first college game into the one we want. */
async function withGame(page: Page, away: { name: string; abbr: string; logoId: string; espnId?: string }, home: typeof away, date = "2026-10-17T16:00Z") {
  const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
  const g = slate.games.find((x: { league: string }) => x.league === "CFB");
  g.matchup = `${away.name} @ ${home.name}`;
  g.date = date;
  g.status = "pre";
  g.teams[0] = { ...g.teams[0], ...away };
  g.teams[1] = { ...g.teams[1], ...home };
  if (!away.espnId) delete g.teams[0].espnId;
  if (!home.espnId) delete g.teams[1].espnId;
  await page.route("**/data/slate.json", (r) => r.fulfill({ json: slate }));
  await page.route("**/data/spplus-lite.json", (r) => r.fulfill({ json: lite }));
  return g;
}
const OSU = { name: "Ohio State", abbr: "OSU", logoId: "ohio-state", espnId: "194" };
const IND = { name: "Indiana", abbr: "IND", logoId: "indiana", espnId: "84" };

const openTab = async (page: Page) => {
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible({ timeout: 15_000 });
};

test.describe("the CFB SP+ tab", () => {
  test("@smoke it sits with the other tabs and opens on the ratings table", async ({ page }) => {
    await openTab(page);
    await expect(page.getByRole("button", { name: "CFB SP+" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".spp .tbl tbody tr:not(.detail)")).toHaveCount(138);
    await expectSppTabs(page, ["Rankings", "Simulator", "ATS tracker", "Movement", "Team", "Matchups", "Compare", "Outliers", "Conferences", "Play vs Results", "Results", "SP+ vs lines", "Data"]);
    await expect(page.locator(".spp .foot")).toContainText("2026 SP+");
  });

  test("its styles stay inside it (a shadow root) and the board's stay out", async ({ page }) => {
    await openTab(page);
    const host = page.getByTestId("spplus-host");
    expect(await host.evaluate((el) => !!el.shadowRoot)).toBe(true);
    // None of the tool's own elements exist in the page itself (the board has class names of its own, like .legend, that the tool never sees).
    expect(await page.evaluate(() => document.querySelectorAll(".spp, .bar-in, .atshead, .simhead, .tabs").length)).toBe(0);
    expect(await host.evaluate((el) => el.children.length)).toBe(0);
    expect(await page.locator(".spp .panel").first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(26, 26, 25)");
    // And no sideways scroll on either screen size.
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw + 1);
  });

  test("the simulator opens on a scheduled game, and teams can be swapped", async ({ page }) => {
    await openTab(page);
    await openSppTab(page, "Simulator");
    const pts = page.locator(".spp .simpts");
    await expect(pts).toHaveCount(2);
    for (const t of await pts.allInnerTexts()) expect(Number(t)).toBeGreaterThan(10);
    const a = await page.locator(".spp").getByLabel("Team A").inputValue();
    await page.locator(".spp").getByRole("button", { name: "Swap teams" }).click();
    await expect(page.locator(".spp").getByLabel("Team B")).toHaveValue(a);
  });

  test("the tool keeps its place when you leave the tab and come back", async ({ page }) => {
    await openTab(page);
    await openSppTab(page, "ATS tracker");
    await expect(page.locator(".spp").getByRole("heading", { name: "SP+ picks against the spread" })).toBeVisible();
    await page.getByRole("button", { name: "Games" }).click();
    await page.getByRole("button", { name: "CFB SP+" }).click();
    await expectSppTabSelected(page, "ATS tracker");
  });
});

test.describe("ATS tracker", () => {
  const all = atsGames(model).filter((g) => g.group === "fbs");
  const season = tally(all);

  test("season and weekly records come from grading every pick against its line", async ({ page }) => {
    await openTab(page);
    await openSppTab(page, "ATS tracker");
    const head = page.locator(".spp .atshead");
    await expect(head).toContainText(recordText(season));
    await expect(head).toContainText(`${(season.pct! * 100).toFixed(1)}%`);
    await expect(head).toContainText("52.4%"); // break-even at -110
    const weeks = [...new Set(all.map((g) => g.week))];
    const table = page.locator(".spp .panel", { hasText: "Week by week" }).locator("tbody tr");
    await expect(table).toHaveCount(weeks.length + 1); // plus the season row
    await expect(page.locator('.spp svg[aria-label^="Weekly against-the-spread"] g.pt')).toHaveCount(weeks.length);
    // Every week the sheet tallies itself agrees with the grading.
    await expect(page.locator(".spp .panel", { hasText: "Week by week" }).getByLabel("differs")).toHaveCount(0);
    await expect(page.locator(".spp .panel", { hasText: "Week by week" }).getByLabel("matches").first()).toBeVisible();
  });

  test("including FBS-vs-FCS games changes the totals; picks can be expanded to their sheet row", async ({ page }) => {
    await openTab(page);
    await openSppTab(page, "ATS tracker");
    const wide = tally(atsGames(model));
    await page.locator(".spp").getByRole("button", { name: "Include FBS vs. FCS" }).click();
    await expect(page.locator(".spp .atshead")).toContainText(recordText(wide));
    const list = page.locator(".spp").getByRole("region", { name: "Graded picks" });
    await list.locator("tbody tr").first().getByRole("button", { name: "Show details" }).click();
    await expect(list.locator("tr.detail").first()).toContainText(/FBS Week \d+, row \d+/);
  });
});

test.describe("Game Center", () => {
  test("a college game shows the SP+ simulated score and can open the simulator on it", async ({ page }) => {
    test.skip(!hasCfbGame(), NO_CFB);
    await withGame(page, OSU, IND);
    await page.goto("/?league=CFB");
    await page.getByRole("button", { name: "Open Game Center for Ohio State @ Indiana" }).first().click();
    const dialog = page.getByRole("dialog");
    const block = dialog.getByTestId("gc-spplus");
    await expect(block).toBeVisible();
    const p = projectGame(lite, OSU, IND, "2026-10-17T16:00Z")!;
    await expect(block).toContainText("SP+ simulated score");
    await expect(block.locator(".gc-spp-score")).toContainText(p.awayPts.toFixed(1));
    await expect(block.locator(".gc-spp-score")).toContainText(p.homePts.toFixed(1));
    await expect(block).toContainText(`Likely final ${Math.round(p.awayPts)}–${Math.round(p.homePts)}`);
    await expect(block).toContainText(/simulated games from SP\+ ratings through week \d+/);
    // The block sits at the top of the Projection panel, above the board's own projection.
    const panel = dialog.locator(".gc-panel", { has: page.getByTestId("gc-spplus") });
    await expect(panel.locator("h3.micro-label").first()).toHaveText("Projection");
    await block.getByRole("button", { name: /Open in CFB SP\+/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "CFB SP+" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".spp").getByLabel("Team A")).toHaveValue("Ohio State");
    await expect(page.locator(".spp").getByLabel("Team B")).toHaveValue("Indiana");
    await expectSppTabSelected(page, "Simulator");
  });

  test("no SP+ block when a team is outside the FBS ratings, or for the NFL", async ({ page }) => {

    test.skip(!hasCfbGame(), NO_CFB);
    await withGame(page, { name: "Charleston Southern", abbr: "CHSO", logoId: "charleston-southern" }, { name: "Clemson", abbr: "CLEM", logoId: "clemson", espnId: "228" });
    await page.goto("/?league=CFB");
    await page.getByRole("button", { name: "Open Game Center for Charleston Southern @ Clemson" }).first().click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Projection" })).toBeVisible();
    await expect(page.getByTestId("gc-spplus")).toHaveCount(0);
  });

  test("the lite file failing to load leaves the Game Center as it was", async ({ page }) => {

    test.skip(!hasCfbGame(), NO_CFB);
    await withGame(page, OSU, IND);
    await page.route("**/data/spplus-lite.json", (r) => r.fulfill({ status: 500, body: "nope" }));
    await page.goto("/?league=CFB");
    await page.getByRole("button", { name: "Open Game Center for Ohio State @ Indiana" }).first().click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Projection" })).toBeVisible();
    await expect(page.getByTestId("gc-spplus")).toHaveCount(0);
  });
});

test.describe("projection logic", () => {
  test("every college game with two FBS teams resolves to sheet teams, from ESPN ids, logo ids or names", () => {
    const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8")).games.filter((g: { league: string }) => g.league === "CFB");
    const results = JSON.parse(readFileSync("src/data/results.json", "utf8")).games.filter((g: { league: string }) => g.league === "CFB");
    let both = 0;
    const gaps: string[] = [];
    for (const g of [...slate, ...results]) {
      const [a, h] = g.teams;
      const A = sheetName(lite, a), H = sheetName(lite, h);
      if (A && H) both++;
      // A game with one side missing is fine only if that side is not an FBS team in the sheet (an FCS opponent).
      else if ((A || H) && model.byId.has(`FBS:${A ? h.name : a.name}`)) gaps.push(g.matchup);
    }
    expect(gaps).toEqual([]);
    expect(both).toBeGreaterThan(40);
  });

  test("a final game, which carries no ESPN id, resolves by logo id; UConn by its alias", () => {
    expect(sheetName(lite, { logoId: "ohio-state" })).toBe("Ohio State");
    expect(sheetName(lite, { logoId: "miami-fl-" })).toBe("Miami-FL");
    expect(sheetName(lite, { name: "UConn", logoId: "uconn" })).toBe("Connecticut");
    expect(sheetName(lite, { name: "Charleston Southern", logoId: "charleston-southern" })).toBeNull();
  });

  test("ratings come from the game's own week, and the numbers are repeatable and sensible", () => {
    const first = lite.weekStarts["0"], last = lite.weekStarts[String(lite.latestWeek)];
    expect(weekFor(lite, `${first}T17:00Z`)).toBe(0);
    expect(weekFor(lite, `${last}T23:00Z`)).toBe(lite.latestWeek);
    expect(weekFor(lite, "2030-01-01T00:00Z")).toBe(lite.latestWeek);
    // Late kickoffs after midnight UTC still belong to the evening's local date.
    const w1 = lite.weekStarts["2"];
    expect(weekFor(lite, `${new Date(Date.parse(`${w1}T00:00Z`)).toISOString().slice(0, 10)}T02:00Z`)).toBe(1);
    const a = projectGame(lite, OSU, IND, "2026-10-17T16:00Z")!, b = projectGame(lite, OSU, IND, "2026-10-17T16:00Z")!;
    expect(a.awayPts).toBe(b.awayPts);
    expect(a.winAway + a.winHome).toBeCloseTo(1, 10);
    expect(a.awayPts + a.homePts).toBeGreaterThan(35);
    expect(a.awayPts + a.homePts).toBeLessThan(75);
    // The sheet lists this game, so home field is the sheet's.
    expect(a.onSlate).toBe(true);
    expect(projectGame(lite, OSU, OSU, "2026-10-17T16:00Z")).toBeNull();
  });

  test("a failed refresh of the sheet keeps the saved SP+ data", () => {
    const before = statSync("src/data/spplus.json").mtimeMs;
    const run = spawnSync("node", ["scripts/fetch-spplus.mjs", "/nonexistent/export.xlsx"], { encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stdout + run.stderr).toContain("keeping the last saved SP+ data");
    expect(statSync("src/data/spplus.json").mtimeMs).toBe(before);
  });
});

test.describe("simulator: picking a game", () => {
  const latest = model.latest;
  const confAt = (n: string, w = latest) => model.byId.get(`FBS:${n}`)?.weeks[w]?.conf ?? null;
  const fbsGames = (w: number) => model.projections.filter((p) => p.week === w && model.byId.has(`FBS:${p.away}`) && model.byId.has(`FBS:${p.home}`));
  const label = (c: string) => (c === "Indies" ? "Independents" : c);
  const goSim = async (page: Page) => {
    await openTab(page);
    await openSppTab(page, "Simulator");
    await expect(page.locator(".spp .simpts")).toHaveCount(2);
    return page.locator('.spp [aria-label="Pick a scheduled game"]');
  };

  test("a game between two conferences is listed under both; a game is chosen by week, conference and game", async ({ page }) => {

    test.skip(!hasCfbGame(), NO_CFB);
    const inter = fbsGames(latest).find((p) => !p.neutral && confAt(p.away) && confAt(p.home) && confAt(p.away) !== confAt(p.home) && confAt(p.away) !== "Indies" && confAt(p.home) !== "Indies")!;
    expect(inter, "an interconference game in the latest week").toBeTruthy();
    const pick = await goSim(page);
    for (const c of [confAt(inter.away)!, confAt(inter.home)!]) {
      await pick.getByLabel("Conference").selectOption(c);
      await expect(pick.getByLabel("Game").locator("option", { hasText: `${inter.away} at ${inter.home}` })).toHaveCount(1);
    }
    await pick.getByLabel("Game").selectOption(inter.id);
    await expect(page.locator(".spp").getByLabel("Team A")).toHaveValue(inter.away);
    await expect(page.locator(".spp").getByLabel("Team B")).toHaveValue(inter.home);
    await expect(page.locator(".spp").getByText("On the schedule:")).toContainText(`${inter.away} at ${inter.home}`);
  });

  test("independents are offered as a conference of their own", async ({ page }) => {
    const ind = fbsGames(latest).filter((p) => confAt(p.away) === "Indies" || confAt(p.home) === "Indies");
    test.skip(ind.length === 0, "no independent plays in the latest week");
    const pick = await goSim(page);
    await expect(pick.getByLabel("Conference").locator("option", { hasText: "Independents" })).toHaveCount(1);
    await pick.getByLabel("Conference").selectOption({ label: "Independents" });
    await expect(pick.getByText(new RegExp(`^${ind.length} games?`))).toBeVisible();
    for (const p of ind) await expect(pick.getByLabel("Game").locator("option", { hasText: `${p.away}${p.neutral ? " vs. " : " at "}${p.home}` })).toHaveCount(1);
  });

  test("the week lists that week's games; any other pairing is a custom matchup", async ({ page }) => {
    const pick = await goSim(page);
    const w = model.weeks[3];
    await pick.getByLabel("Week").selectOption(String(w));
    await expect(pick.getByText(new RegExp(`^${fbsGames(w).length} games`))).toBeVisible();
    const g = fbsGames(w)[0];
    await expect(page.locator(".spp").getByLabel("Team A")).toHaveValue(g.away);
    await expect(page.locator(".spp .simpts")).toHaveCount(2);
    // Any two teams: change a team and the list says it is no longer a scheduled game.
    await page.locator(".spp").getByLabel("Team A").fill("Wisconsin");
    await expect(pick.getByLabel("Game")).toHaveValue("");
    await expect(page.locator(".spp .simpts")).toHaveCount(2);
    await expect(page.locator(".spp").getByLabel("Team A")).toHaveValue("Wisconsin");
  });
});

