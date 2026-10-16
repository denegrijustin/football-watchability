import { expect, test } from "@playwright/test";

// The simulator is a lazy tab. It must open, run a game and its forecast, and never disturb the rest of the page.
test("the Simulator tab runs a game: forecast, stage, play feed and a final score", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "Simulator" }).click();
  await expect(page.getByRole("heading", { name: "Game simulator" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate this game" }).click();
  const forecast = page.getByRole("region", { name: "Forecast" });
  await expect(forecast).toBeVisible({ timeout: 45_000 });
  await expect(forecast.getByText("Projected score")).toBeVisible();
  await expect(page.locator(".st")).toBeVisible();
  // Skip to the end: a final score and a full play log.
  await page.getByRole("button", { name: "Skip to final" }).click();
  await expect(page.locator(".st-clock b")).toHaveText(/FINAL/);
  expect(await page.locator(".sim-feed li").count()).toBeGreaterThan(20);
  await expect(page.locator(".sim-lines")).toBeVisible();
  expect(errors).toEqual([]);
});

test("all nine tabs stay on one row, visible and not overlapping, from 375px up", async ({ page }) => {
  for (const w of [375, 390, 700, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/?league=NFL");
    await expect(page.locator(".view-switch button").first()).toBeVisible();
    const r = await page.evaluate(() => {
      const bs = [...document.querySelectorAll(".view-switch button")].map((x) => x.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].left < bs[j].right - 0.5 && bs[j].left < bs[i].right - 0.5 && bs[i].top < bs[j].bottom - 0.5 && bs[j].top < bs[i].bottom - 0.5) overlaps++;
      return { n: bs.length, overlaps, off: bs.filter((b) => b.right > innerWidth + 1 || b.left < -1).length, rows: new Set(bs.map((b) => Math.round(b.top))).size };
    });
    expect(r, `tabs at ${w}px`).toEqual({ n: 9, overlaps: 0, off: 0, rows: 1 });
  }
});

test("the Upset Alert Meter: filters on one line, a week selector, and an earlier week loads its own games", async ({ page }) => {
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "Upset Alert Meter" }).click();
  await expect(page.locator(".um-row").first()).toBeVisible();
  // The league and Show filters share one row.
  const tops = await page.locator(".um-controls .segmented").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // An earlier week is one click away and lists only finished games.
  const select = page.locator(".um-week select");
  const options = await select.locator("option").allTextContents();
  expect(options.length).toBeGreaterThan(2);
  expect(options[0]).toContain("this week");
  await select.selectOption({ index: 1 });
  await expect(page.locator(".um-col h3")).toHaveText(/Completed/);
  await expect(page.locator(".um-row").first()).toBeVisible();
  expect(await page.locator(".um-row.final").count()).toBe(await page.locator(".um-row").count());
  await expect(page.getByRole("button", { name: "To play" })).toHaveCount(0);
});

import { shape, type Raw } from "../src/sim/roster";

test("rosters: season leaders pick the players; without them the most experienced QB and real roster names are used", () => {
  const people = [
    { id: "1", name: "J. Fields", pos: "QB", exp: 5 }, { id: "2", name: "P. Mahomes", pos: "QB", exp: 9 }, { id: "3", name: "G. Nussmeier", pos: "QB", exp: 0 },
    { id: "4", name: "K. Walker III", pos: "RB", exp: 3 }, { id: "5", name: "E. Johnson", pos: "RB", exp: 2 },
    { id: "6", name: "T. Kelce", pos: "TE", exp: 13 }, { id: "7", name: "R. Rice", pos: "WR", exp: 3 }, { id: "8", name: "X. Worthy", pos: "WR", exp: 2 },
  ];
  const leaders: Raw["leaders"] = {
    passingYards: [{ id: "2", w: 1037 }], rushingYards: [{ id: "4", w: 537 }, { id: "5", w: 56 }, { id: "2", w: 41 }],
    receivingYards: [{ id: "6", w: 246 }, { id: "7", w: 190 }, { id: "8", w: 133 }, { id: "4", w: 84 }],
  };
  const full = shape({ color: "e31837", alt: "ffb81c", people, leaders });
  expect(full.roster.qb).toBe("P. Mahomes");
  expect(full.roster.rushers?.map((r) => r.name)).toEqual(["K. Walker III", "E. Johnson"]); // the quarterback's scrambles are not a back
  expect(full.roster.receivers?.map((r) => [r.name, r.pos])).toEqual([["T. Kelce", "TE"], ["R. Rice", "WR"], ["X. Worthy", "WR"], ["K. Walker III", "RB"]]);
  expect(full.color).toBe("#e31837");
  // ESPN's season leaders missing: the starter is the veteran, not whoever is listed first, and every position still has names.
  const bare = shape({ color: null, alt: null, people, leaders: { passingYards: [], rushingYards: [], receivingYards: [] } });
  expect(bare.roster.qb).toBe("P. Mahomes");
  expect(bare.roster.rushers?.map((r) => r.name)).toEqual(["K. Walker III", "E. Johnson"]);
  expect(bare.roster.receivers?.length).toBeGreaterThanOrEqual(3);
  expect(bare.roster.receivers?.every((r) => r.name && !/receiver/i.test(r.name))).toBe(true);
});

import { startingQb } from "../src/sim/roster";

test("a known starter wins over whoever is listed first: nflverse's Mahomes, matched to the roster's own short name", () => {
  const info = { roster: { qb: "J. Fields" }, qbs: [{ name: "J. Fields", exp: 5 }, { name: "P. Mahomes", exp: 9 }, { name: "G. Nussmeier", exp: 0 }] };
  expect(startingQb(info, "Patrick Mahomes")).toBe("P. Mahomes"); // the roster's spelling
  expect(startingQb({ roster: {}, qbs: [] }, "Josh Allen")).toBe("J. Allen"); // not on the list we have: shortened the same way
  expect(startingQb({ roster: {}, qbs: [] }, "Kenneth Walker III")).toBe("K. Walker"); // generational suffixes are dropped
  expect(startingQb(info, null)).toBe("J. Fields"); // nothing known: whatever ESPN's leaders gave
});

import { readFileSync } from "node:fs";
import { fromPacked } from "../src/sim/roster";

test("the site's own team-players file names a QB, backs, receivers and a color for every team, with no skill-position strays", () => {
  const f = JSON.parse(readFileSync("src/data/team-players.json", "utf8"));
  expect(Object.keys(f.nfl)).toHaveLength(32);
  expect(Object.keys(f.cfb).length).toBeGreaterThanOrEqual(130);
  for (const [lg, teams] of [["nfl", f.nfl], ["cfb", f.cfb]] as const) {
    for (const [id, t] of Object.entries<any>(teams)) {
      const info = fromPacked(t);
      expect(info, `${lg} ${id} has season leaders`).not.toBeNull();
      expect(info!.roster.qb, `${lg} ${id} QB`).toBeTruthy();
      expect(info!.roster.rushers?.length, `${lg} ${id} rushers`).toBeGreaterThanOrEqual(1);
      expect(info!.roster.receivers?.length, `${lg} ${id} receivers`).toBeGreaterThanOrEqual(3);
      expect(info!.color, `${lg} ${id} color`).toMatch(/^#[0-9a-f]{6}$/);
    }
  }
  // Kansas City: the passing leader is the QB and the rushing leader is the first back, not whoever is listed first on the roster.
  const kc = fromPacked(f.nfl["12"])!;
  expect(kc.roster.qb).toBe("P. Mahomes");
  expect(kc.roster.rushers![0].name).toBe("K. Walker III");
  expect(kc.roster.rushers!.every((r) => r.w >= 20)).toBe(true);
});

test("the simulator names real players with ESPN and the server function both unreachable", async ({ page }) => {
  await page.route("**/api/teaminfo*", (r) => r.abort());
  await page.route(/espn\.com/, (r) => r.abort());
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "Simulator" }).click();
  await page.locator(".sim-custom summary").click();
  const pick = async (n: number, name: string) => {
    const sel = page.locator(".sim-custom select").nth(n);
    await sel.selectOption(await sel.locator("option").evaluateAll((os, s) => (os as HTMLOptionElement[]).find((o) => o.textContent === s)?.value ?? "", name));
  };
  await pick(0, "Buffalo Bills");
  await pick(1, "Kansas City Chiefs");
  await page.getByRole("button", { name: "Simulate matchup" }).click();
  await expect(page.getByRole("region", { name: "Forecast" })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Skip to final" }).click();
  const panels = page.locator(".st-panel");
  await expect(panels.nth(1)).toContainText("P. Mahomes");
  await expect(panels.nth(1)).not.toContainText(/Chiefs QB|KC RB|KC receiver|B\. Smith/);
  await expect(panels.nth(0)).toContainText("J. Allen");
});

import { contrast, endzoneFor } from "../src/sim/endzone";

test("end zones: each known program's look, and a readable default for everyone else", () => {
  const ten = endzoneFor({ short: "Tennessee", color: "#4b2e83" });
  expect(ten.checker).toMatchObject({ a: "#ff8200", b: "#ffffff" });
  expect(ten.noWord).toBe(true); // the checkerboard carries no lettering
  const nd = endzoneFor({ short: "Notre Dame", color: "#0c2340" });
  expect([!!nd.hash, nd.noWord, nd.checker]).toEqual([true, true, undefined]); // diagonal hash lines, no lettering
  const mo = endzoneFor({ short: "Missouri", color: "#f1b82d" });
  expect([mo.base, mo.diamonds?.fill, mo.border]).toEqual(["#111111", "#f1b82d", "#f1b82d"]); // black, with gold lettered diamonds
  expect(endzoneFor({ short: "LSU", color: "#461d7c" })).toMatchObject({ base: "#fdd023", ink: "#461d7c", size: 116 });
  expect(endzoneFor({ short: "Ole Miss", color: "#14213d" })).toMatchObject({ italic: true, ink: "#d4572e" });
  expect(endzoneFor({ short: "Oregon", color: "#154733" }).ink).toBe("#fee123");
  expect(endzoneFor({ short: "Bengals", color: "#fb4f14" }).tiger).toBe("#000000");
  expect(endzoneFor({ short: "Ravens", color: "#241773" })).toMatchObject({ serif: true, italic: true, outline: "#a8861c" });
  expect(endzoneFor({ short: "Chiefs", color: "#e31837" })).toMatchObject({ base: "#e2b72d", ink: "#a6192e" });
  expect(endzoneFor({ short: "Steelers", color: "#101820" }).words).toEqual(["PITTSBURGH", "STEELERS"]); // a different word at each end
  for (const name of ["USC", "Southern California"]) expect(endzoneFor({ short: name, color: "#990000" })).toMatchObject({ base: "#ffc72c", word: "USC", ends: ["#990000", "#ffffff", "#990000"] });
  expect(endzoneFor({ short: "California", color: "#003262" })).toMatchObject({ base: "#fdb515", ink: "#003262", italic: true });
  expect(endzoneFor({ short: "Colorado", color: "#cfb87c" })).toMatchObject({ base: "#16130f", ink: "#cfb87c" });
  expect(endzoneFor({ short: "Tulane", color: "#006747" }).words).toEqual(["GREEN WAVE", "GREEN WAVE"]);
  expect(endzoneFor({ short: "Wyoming", color: "#492f24" })).toMatchObject({ words: ["WYOMING", "COWBOYS"], ridge: "#492f24" });
  expect(endzoneFor({ short: "Nebraska", color: "#e41c38" }).words).toEqual(["HUSKERS", "NEBRASKA"]);
  expect(endzoneFor({ short: "Boise State", color: "#0033a0" })).toMatchObject({ word: "BRONCOS", base: "#d64309" });
  expect(endzoneFor({ short: "Boise State", color: "#0033a0" }).field).toHaveLength(2); // a blue field
  expect(endzoneFor({ short: "Browns", color: "#311d00" }).ink).toBe("#ff3c00");
  // Everyone else: the team's own color, lettered in the alternate when it stands out, otherwise white or black.
  const packers = endzoneFor({ short: "Packers", color: "#203731", alt: "#ffb612" });
  expect([packers.base, packers.ink]).toEqual(["#203731", "#ffb612"]);
  const same = endzoneFor({ short: "Ohio State", color: "#bb0000", alt: "#c01010" }); // an alternate too close to the base is not used
  expect(same.ink).toBe("#ffffff");
  expect(endzoneFor({ short: "Light", color: "#fafafa", alt: "#f0f0f0" }).ink).toBe("#111111");
  for (const t of [packers, same, endzoneFor({ short: "Ravens", color: "#241773" }), endzoneFor({ short: "Chiefs", color: "#e31837" }), endzoneFor({ short: "LSU", color: "#461d7c" })]) expect(contrast(t.base, t.ink)).toBeGreaterThanOrEqual(2);
});

test("the field carries the conference logo at each 25 (the second upside down), the NFL shield for NFL games, and Notre Dame's Touchdown Jesus line", async ({ page }) => {
  const run = async (league: "CFB" | "NFL", away: string, home: string) => {
    await page.goto(`/?league=${league}`);
    await page.getByRole("button", { name: "Simulator" }).click();
    await page.locator(".sim-custom summary").click();
    const pick = async (n: number, name: string) => {
      const sel = page.locator(".sim-custom select").nth(n);
      await sel.selectOption(await sel.locator("option").evaluateAll((os, s) => (os as HTMLOptionElement[]).find((o) => o.textContent?.startsWith(s))?.value ?? "", name));
    };
    await pick(0, away);
    await pick(1, home);
    await page.getByRole("button", { name: "Simulate matchup" }).click();
    await expect(page.getByRole("region", { name: "Forecast" })).toBeVisible({ timeout: 45_000 });
  };
  await run("CFB", "Alabama", "Tennessee");
  await expect(page.locator(".st .lf-conf")).toHaveCount(2);
  await expect(page.locator(".st .lf-conf").first()).toHaveAttribute("data-conf", "SEC");
  expect(await page.locator(".st g[transform^='rotate(180']").count()).toBe(1); // the bottom-right one is turned over
  await expect(page.locator(".st-nd")).toHaveCount(0);
  await expect(page.locator(".st [data-endzone='Tennessee']")).toHaveCount(2); // both end zones are the home team's
  await run("CFB", "Navy", "Notre Dame");
  await expect(page.locator(".st-nd")).toHaveCount(1); // an independent: no conference mark, but the line to Touchdown Jesus
  await expect(page.locator(".st .lf-conf")).toHaveCount(0);
  await run("NFL", "Buffalo Bills", "Green Bay Packers");
  await expect(page.locator(".st .lf-conf").first()).toHaveAttribute("data-conf", "NFL");
});
