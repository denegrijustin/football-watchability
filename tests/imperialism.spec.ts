import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildWeekCache, conquestPath, conferenceStatus, ownersAt, standings, type ImperialismData } from "../src/imperialism";

// A season's worth of invented-but-valid results (4 weeks of games among the real teams, built by scripts/imperialism/build.py
// from fake finals), so the replay, conquest paths and conference rules have something to show.
const data = JSON.parse(readFileSync("tests/fixtures/imperialism.json", "utf8")) as ImperialismData;
const cfb = data.maps.CFB.national;
const hex = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const colorOf = (league: "CFB" | "NFL", id: string) => hex(data.teams[league].find((t) => t.id === id)!.color);
/** The team a county is painted for: its fill is a pattern named after the owner (imp-t-<team> plain, imp-c-<team> captured). */
const ruler = (el: Element) => /imp-[tcs]-([^"')]+)/.exec((el as SVGElement).style.fill)?.[1] ?? null;

async function open(page: Page, league: "CFB" | "NFL" = "CFB") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The saved snapshot has no games until a refresh has fetched the season, so serve the fixture season.
  await page.route("**/data/imperialism.json", (route) => route.fulfill({ json: data }));
  await page.goto(`/?league=${league}`);
  await page.getByRole("button", { name: /^Empire/ }).click();
  await expect(page.getByTestId("imp-map")).toBeVisible();
  return errors;
}

test("replaying the ledger gives the same map as the engine's final state, and weeks go back in time", () => {
  const last = cfb.weeks.at(-1)!.n;
  expect(ownersAt(cfb, last)).toEqual(cfb.current);
  expect(ownersAt(cfb, 0)).toEqual(cfb.home);
  const cache = buildWeekCache(cfb);
  for (const w of cfb.weeks) {
    const counts: Record<string, number> = {};
    for (const o of cache.at(w.n)) counts[o] = (counts[o] ?? 0) + 1;
    expect(counts).toEqual(w.holdings); // the snapshot summary agrees with a fresh replay
  }
  // Every county is always ruled by someone, and landless teams are exactly the ones with no county.
  expect(cache.at(last).every(Boolean)).toBe(true);
  expect(new Set(cache.at(last)).size).toBe(Object.keys(cfb.weeks.at(-1)!.holdings).length);
});

test("conquest paths start at the home team and list each change of hands in order", () => {
  const moved = cfb.ledger.find((g) => g.transferred.length)!;
  const county = moved.transferred[0];
  const path = conquestPath(cfb, county, cfb.weeks.at(-1)!.n);
  expect(path[0]).toMatchObject({ kind: "home", owner: cfb.home[county] });
  const hops = path.slice(1) as { week: number; winner: string; loser: string; owner: string }[];
  expect(hops.length).toBeGreaterThan(0);
  expect(hops.map((h) => h.week)).toEqual([...hops.map((h) => h.week)].sort((a, b) => a - b));
  expect(hops[0].winner).toBe(moved.winner);
  expect(hops.at(-1)!.owner).toBe(cfb.current[county]);
  // Asking about an earlier week stops there.
  expect(conquestPath(cfb, county, 0)).toHaveLength(1);
});

test("conference rule: a county is native-held only while its owner is in its home conference", () => {
  expect(conferenceStatus("SEC", "SEC")).toBe("native");
  expect(conferenceStatus("SEC", "Big Ten")).toBe("captured");
  const conf = data.maps.CFB.conference;
  const teamConf = new Map(data.teams.CFB.map((t) => [t.id, t.conf]));
  const last = conf.weeks.at(-1)!;
  const cur = cfb.current;
  const sec = { native: 0, captured: 0 };
  cur.forEach((o, i) => {
    if (conf.native[i] !== "SEC") return;
    sec.native++;
    if (teamConf.get(o) !== "SEC") sec.captured++;
  });
  expect(last.byConf.SEC).toEqual({ native: sec.native, captured: sec.captured, held: sec.native - sec.captured });
  // The conference view never changes the national run.
  expect(conf.base).toBe("national");
});

test("the NFL maps are independent: AFC and NFC only hold their own teams' land, and cross-conference games don't touch them", () => {
  const afc = data.maps.NFL.AFC;
  const nfc = data.maps.NFL.NFC;
  const conf = (id: string) => data.teams.NFL.find((t) => t.id === id)!.conf;
  expect(afc.teams.every((id) => conf(id) === "AFC")).toBe(true);
  expect(nfc.teams.every((id) => conf(id) === "NFC")).toBe(true);
  expect(afc.ledger.every((g) => conf(g.winner) === "AFC" && conf(g.loser) === "AFC")).toBe(true);
  expect(nfc.ledger.every((g) => conf(g.winner) === "NFC" && conf(g.loser) === "NFC")).toBe(true);
  expect(new Set(afc.current).size).toBeLessThanOrEqual(16);
  expect(data.maps.NFL.full.teams).toHaveLength(32);
  const top = standings(afc, afc.current).ranked[0];
  expect(top.count).toBeGreaterThan(0);
});

test("the Empire tab draws every county, time-travels with the slider and opens a county's story", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('[data-testid^="imp-county-"]')).toHaveCount(data.counties.length);
  const slider = page.getByTestId("imp-slider");
  const last = cfb.weeks.at(-1)!.n;
  await expect(slider).toHaveValue(String(last)); // opens on the latest week
  // A county that changed hands: home color at Start, the conqueror's at the end.
  const moved = cfb.ledger.find((g) => g.transferred.length)!;
  const idx = moved.transferred[0];
  const fips = data.counties[idx];
  const cell = page.getByTestId(`imp-county-${fips}`);
  await expect.poll(() => cell.evaluate(ruler)).toBe(cfb.current[idx]);
  await slider.fill("0");
  await expect.poll(() => cell.evaluate(ruler)).toBe(cfb.home[idx]);
  // Step forward a week with the button.
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(slider).toHaveValue("1");
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(slider).toHaveValue("0");
  await slider.fill(String(last));
  // Click it: card with home team, ruler and the path.
  await cell.click();
  const card = page.getByTestId("imp-card");
  await expect(card).toContainText("Original home team");
  await expect(card).toContainText(data.teams.CFB.find((t) => t.id === cfb.home[idx])!.name);
  await expect(card).toContainText(data.teams.CFB.find((t) => t.id === cfb.current[idx])!.name);
  await expect(card.locator(".imp-path li").first()).toContainText("Week 0");
  await expect(card.locator(".imp-path li").nth(1)).toContainText("beat");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  // Standings.
  await expect(page.getByTestId("imp-standings").locator(".imp-rank li").first()).toContainText(data.teams.CFB.find((t) => t.id === standings(cfb, cfb.current).ranked[0].team)!.name);
  // No sideways page scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);
});

test("conference map hatches captured land and counts it; logos can be switched on; NFL maps switch", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: "Conference" }).click();
  await expect(page.locator(".imp-table, .imp-conf-table, table").first()).toContainText("SEC");
  // Captured land keeps its owner's color and gets the striped tile.
  const hatched = await page.locator('[data-testid^="imp-county-"]').evaluateAll((els) => els.filter((e) => (e as SVGElement).style.fill.includes("imp-c-")).length);
  const teamConf = new Map(data.teams.CFB.map((t) => [t.id, t.conf]));
  const expected = cfb.current.filter((o, i) => teamConf.get(o) !== data.maps.CFB.conference.native[i]).length;
  expect(expected).toBeGreaterThan(0);
  expect(hatched).toBe(expected); // exactly the captured counties
  await page.getByLabel("Highlight conference").selectOption("SEC");
  await page.getByRole("button", { name: "National" }).click();
  // Logos: one per empire with land at this week.
  await expect(page.getByTestId("imp-map").locator(".imp-logos image")).toHaveCount(0);
  await page.getByLabel(/Team logos/i).check();
  expect(await page.getByTestId("imp-map").locator(".imp-logos image").count()).toBeGreaterThan(3);
  // NFL.
  await page.getByRole("button", { name: "NFL", exact: true }).click();
  await page.getByRole("button", { name: "AFC", exact: true }).click();
  const names = await page.getByTestId("imp-standings").locator(".imp-tname").allInnerTexts();
  const afcNames = new Set(data.teams.NFL.filter((t) => t.conf === "AFC").map((t) => t.name));
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) expect(afcNames.has(n)).toBe(true);
  await page.getByRole("button", { name: "NFC", exact: true }).click();
  const nfcNames = new Set(data.teams.NFL.filter((t) => t.conf === "NFC").map((t) => t.name));
  for (const n of await page.getByTestId("imp-standings").locator(".imp-tname").allInnerTexts()) expect(nfcNames.has(n)).toBe(true);
  expect(errors).toEqual([]);
});

test("with no games yet the map shows the starting split and says results are coming", async ({ page }) => {
  const empty = JSON.parse(JSON.stringify(data)) as ImperialismData;
  for (const lg of Object.values(empty.maps)) for (const l of Object.values(lg)) {
    const layer = l as { ledger?: unknown[]; weeks: { n: number; label: string; holdings?: Record<string, number>; byConf?: unknown }[]; current?: string[]; home?: string[] };
    if (!layer.ledger) { layer.weeks = layer.weeks.slice(0, 1); continue; }
    layer.ledger = [];
    layer.weeks = layer.weeks.slice(0, 1);
    layer.current = layer.home;
  }
  await page.route("**/data/imperialism.json", (route) => route.fulfill({ json: empty }));
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: /^Empire/ }).click();
  await expect(page.getByTestId("imp-map")).toBeVisible();
  await expect(page.locator(".imp")).toContainText(/Results appear here as games are played/i);
});

test("every county on the map is owned and painted in its owner's color, with a faint logo texture that can be switched off", async ({ page }) => {
  const errors = await open(page);
  const fills = await page.locator('[data-testid^="imp-county-"]').evaluateAll((els) => els.map((e) => (e as SVGElement).style.fill));
  expect(fills).toHaveLength(data.counties.length);
  const gray = "rgb(91, 107, 120)"; // the "nobody owns this" fallback
  expect(fills.filter((f) => !f || f.includes(gray) || f.includes("#5b6b78"))).toHaveLength(0);
  // Each fill is a tile named for the county's real owner, whose pattern exists and carries the owner's color and logo.
  const owners = cfb.current;
  const ok = await page.evaluate(
    ({ owners, ids }) => {
      const bad: string[] = [];
      const index = new Map(ids.map((id, i) => [id, i]));
      document.querySelectorAll('[data-testid^="imp-county-"]').forEach((el) => {
        const fips = el.getAttribute("data-testid")!.slice("imp-county-".length);
        const m = /imp-[tc]-([^"')]+)/.exec((el as SVGElement).style.fill);
        const pat = m && document.getElementById(`imp-t-${m[1]}`);
        if (!m || m[1] !== owners[index.get(fips)!] || !pat || !pat.querySelector("rect") || !pat.querySelector("image")) bad.push(fips);
      });
      return bad;
    },
    { owners, ids: data.counties },
  );
  expect(ok).toEqual([]);
  // The logo is faint, not loud.
  const opacity = await page.evaluate(() => document.querySelector('pattern[id^="imp-t-"] image')?.getAttribute("opacity"));
  expect(Number(opacity)).toBeLessThanOrEqual(0.3);
  // Off: plain team colors, no patterns for owners.
  await page.getByLabel("Logo texture").uncheck();
  const plain = await page.locator('[data-testid^="imp-county-"]').first().evaluate((e) => (e as SVGElement).style.fill);
  expect(plain).toMatch(/^rgb|^#/);
  expect(errors).toEqual([]);
});

test("the engine leaves no county unowned at any week, in any layer", () => {
  for (const league of Object.values(data.maps))
    for (const layer of Object.values(league)) {
      if (!("ledger" in layer)) continue;
      const cache = buildWeekCache(layer);
      for (const w of layer.weeks) {
        const owners = cache.at(w.n);
        expect(owners).toHaveLength(data.counties.length);
        expect(owners.every((o) => !!o && layer.teams.includes(o))).toBe(true);
      }
    }
});
