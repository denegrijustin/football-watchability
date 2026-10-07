import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cfbBowls, cfbComposite, cfbPlayoff, cycleKey, hashSeed, nflPlayoff, parseConfRecords, parseFpi, simulateCfb, simulateNfl } from "../scripts/outlook-lib.mjs";
import { createServer } from "node:http";
import { defaultLeague } from "../src/league";

const run = promisify(execFile);

// An FPI feed shaped like ESPN's: category column names, then one row of values per team.
const CFB_COLS = {
  fpi: ["fpi", "fpirank", "rankchange7days", "projectedw", "projectedl", "probwinout", "prob6wins", "probwindiv", "probmakeplayoffs", "probmaketitlegame", "probwintitle", "probwinconf", "numwins", "numlosses", "numties"],
};
const group = (id: string, name: string, shortName: string, isConference = true, parent?: object) => ({ id, name, shortName, abbreviation: shortName.toLowerCase(), isConference, ...(parent ? { parent } : {}) });
const GROUPS = {
  sec: group("8", "Southeastern Conference", "SEC"),
  big: group("5", "Big Ten Conference", "Big Ten"),
  acc: group("1", "Atlantic Coast Conference", "ACC"),
  b12: group("4", "Big 12 Conference", "Big 12"),
  mw: group("17", "Mountain West Conference", "Mountain West"),
  sbe: group("167", "Sun Belt - East", "Sun Belt - East", false, { abbreviation: "belt" }),
  sbw: group("168", "Sun Belt - West", "Sun Belt - West", false, { abbreviation: "belt" }),
  ind: group("18", "FBS Independents", "FBS Indep."),
};
type T = { id: string; name: string; g: keyof typeof GROUPS; fpiRank: number; ap?: number; coaches?: number; cfp?: number; w?: number; pConf?: number; p6?: number };
function cfbFeed(teams: T[]) {
  return {
    lastUpdated: "2026-10-05T08:00Z",
    categories: [{ name: "fpi", names: CFB_COLS.fpi }],
    teams: teams.map((t) => ({
      team: {
        id: t.id,
        displayName: t.name,
        abbreviation: t.name.slice(0, 3).toUpperCase(),
        group: GROUPS[t.g],
        ranks: {
          items: [
            ...(t.ap ? [{ name: "AP Top 25", type: "ap", rank: { current: t.ap } }] : []),
            ...(t.coaches ? [{ name: "AFCA Coaches Poll", type: "usa", rank: { current: t.coaches } }] : []),
            ...(t.cfp ? [{ name: "College Football Playoff Rankings", type: "cfp", rank: { current: t.cfp } }] : []),
          ],
        },
      },
      categories: [{ name: "fpi", values: [10, t.fpiRank, 0, 9, 3, 20, t.p6 ?? 90, 0, 50, 5, 3, t.pConf ?? 10, t.w ?? 4, 1, 0] }],
    })),
  };
}
// 30 teams across the groups; the top of each conference is the likeliest champion.
const names = (n: number) => Array.from({ length: n }, (_, i) => `Team ${i + 1}`);
const make = (n = 40): T[] => {
  const order: (keyof typeof GROUPS)[] = ["sec", "big", "acc", "b12", "mw", "sbe", "sbw", "ind"];
  return names(n).map((name, i) => ({ id: String(i + 1), name, g: order[i % order.length], fpiRank: i + 1, ap: i < 25 ? i + 1 : undefined, coaches: i < 25 ? i + 1 : undefined, pConf: i < 8 ? 60 - i : 5 }));
};

test("the composite averages the polls and FPI, counts unranked as 30, and adds the CFP rank (double) once it exists", () => {
  const teams = make();
  // Team 26 is outside both polls but 10th on FPI; Team 5 is 5th everywhere.
  teams[25].fpiRank = 3;
  const { rows, sources } = cfbComposite(parseFpi(cfbFeed(teams)));
  expect(sources).toEqual(["fpi", "ap", "coaches"]);
  expect(rows[0].name).toBe("Team 1");
  expect(rows.find((t) => t.name === "Team 26")!.composite).toBeCloseTo((3 + 30 + 30) / 3, 1);
  expect(rows.map((t) => t.rank)).toEqual(rows.map((_, i) => i + 1));

  teams[4].cfp = 1; // the committee loves Team 5
  const withCfp = cfbComposite(parseFpi(cfbFeed(teams)));
  expect(withCfp.sources).toEqual(["fpi", "ap", "coaches", "cfp"]);
  expect(withCfp.rows.find((t) => t.name === "Team 5")!.composite).toBeCloseTo((5 + 5 + 5 + 2 * 1) / 5, 1); // FPI 5, AP 5, Coaches 5, CFP 1 counted twice
});

test("the playoff takes the five best conference champions, then at-large teams, seeded by rank", () => {
  const { rows } = cfbComposite(parseFpi(cfbFeed(make())));
  const { field, out, rules } = cfbPlayoff(rows);
  expect(field).toHaveLength(12);
  expect(field.map((f) => f.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(field.filter((f) => f.bid === "champion")).toHaveLength(rules.autoBids);
  expect(field.filter((f) => f.bye).map((f) => f.seed)).toEqual([1, 2, 3, 4]);
  // Straight seeding: ranks only go up down the list.
  expect(field.map((f) => f.rank)).toEqual([...field.map((f) => f.rank)].sort((a, b) => a - b));
  // The independents have no champion; Sun Belt East and West are one conference, so one champion at most.
  expect(field.filter((f) => f.bid === "champion").map((f) => f.conf)).not.toContain("Ind");
  const sunBelt = field.filter((f) => f.bid === "champion" && f.conf === "Sun Belt");
  expect(sunBelt.length).toBeLessThanOrEqual(1);
  expect(out).toHaveLength(4);
  expect(new Set([...field, ...out].map((f) => f.id)).size).toBe(16);
});

test("bowl picture counts teams on track for six wins by conference, with the bubble listed apart", () => {
  const teams = make().map((t, i) => ({ ...t, p6: i % 4 === 0 ? 30 : i % 4 === 1 ? 5 : 95, w: i === 3 ? 6 : 2 }));
  const { rows } = cfbComposite(parseFpi(cfbFeed(teams)));
  const b = cfbBowls(rows);
  expect(b.conferences.map((g) => g.name)).toContain("Sun Belt");
  expect(b.conferences.filter((g) => g.name.startsWith("Sun Belt"))).toHaveLength(1);
  expect(b.eligible).toBe(b.conferences.reduce((n, g) => n + g.eligible.length, 0));
  expect(b.conferences.some((g) => g.bubble.length > 0)).toBe(true);
  expect(rows.find((t) => t.name === "Team 4")!.wins).toBe(6); // already eligible counts as 100%
  expect(b.conferences.flatMap((g) => g.eligible).find((t) => t.name === "Team 4")!.pBowl).toBe(100);
});

const NFL_COLS = { projections: ["projectedw", "projectedl", "probwinout", "probwinconf", "probwindiv", "probmakeplayoffs", "probmakedivplayoffs", "probmaketitlegame", "probwintitle", "probmakeconfchamp"], fpi: ["fpi", "epaoffense", "epadefense", "epaspecialteams", "fpirank", "accomplishmentrank", "avgsosrank", "sosremainingrank", "gamecontrolrank", "avgingamewprank", "rankchange7days", "numwins", "numlosses", "numties"] };
function nflFeed() {
  const teams: object[] = [];
  let n = 0;
  for (const conf of ["AFC", "NFC"])
    for (const div of ["East", "North", "South", "West"])
      for (let k = 0; k < 4; k++) {
        n++;
        const projW = 14 - n * 0.3 + (k === 0 ? 0 : -2);
        teams.push({
          team: { id: String(n), displayName: `${conf} ${div} ${k + 1}`, abbreviation: `${conf[0]}${div[0]}${k}`, group: { id: "x", name: `${conf} ${div}`, isConference: false, parent: { abbreviation: conf } } },
          categories: [
            { name: "fpi", values: [1, 0, 0, 0, n, 0, 0, 0, 0, 0, 0, 2, 1, 0] },
            { name: "projections", values: [projW, 17 - projW, 0, 20 - k * 5, k === 0 ? 70 : 10, 60 - n, 0, 0, 3, 0] },
          ],
        });
      }
  return { lastUpdated: "x", categories: [{ name: "fpi", names: NFL_COLS.fpi }, { name: "projections", names: NFL_COLS.projections }], teams };
}

test("NFL field: four division winners, three wild cards and the first teams out, per conference", () => {
  const po = nflPlayoff(parseFpi(nflFeed()));
  for (const conf of ["AFC", "NFC"] as const) {
    const { field, out } = po[conf];
    expect(field).toHaveLength(7);
    expect(field.map((f) => f.seed)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(field.slice(0, 4).every((f) => f.bid === "division")).toBe(true);
    expect(new Set(field.slice(0, 4).map((f) => f.division)).size).toBe(4); // one winner per division
    expect(field.slice(4).every((f) => f.bid === "wild card")).toBe(true);
    expect(field.filter((f) => f.bye).map((f) => f.seed)).toEqual([1]);
    expect(out).toHaveLength(3);
  }
});

test("each outlook is rebuilt once per cycle: college Sunday 8am Central, NFL Tuesday 8am Central", () => {
  // Sun Oct 4 2026, 8:00 CDT = 13:00 UTC.
  expect(cycleKey(new Date("2026-10-04T12:59:00Z"), 0)).toBe("2026-09-27"); // before 8am: still last week's
  expect(cycleKey(new Date("2026-10-04T13:00:00Z"), 0)).toBe("2026-10-04");
  expect(cycleKey(new Date("2026-10-07T04:00:00Z"), 0)).toBe("2026-10-04"); // Tuesday night
  expect(cycleKey(new Date("2026-10-06T12:59:00Z"), 2)).toBe("2026-09-29");
  expect(cycleKey(new Date("2026-10-06T13:00:00Z"), 2)).toBe("2026-10-06");
  expect(cycleKey(new Date("2026-10-10T20:00:00Z"), 2)).toBe("2026-10-06"); // Saturday
  // After the clocks fall back (CST, UTC-6), 8am Central is 14:00 UTC.
  expect(cycleKey(new Date("2026-11-08T13:59:00Z"), 0)).toBe("2026-11-01");
  expect(cycleKey(new Date("2026-11-08T14:00:00Z"), 0)).toBe("2026-11-08");
});

test("the build keeps a saved snapshot until its cycle turns over, and never replaces one with an empty feed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "outlook-"));
  const raw = join(dir, "raw");
  mkdirSync(raw);
  writeFileSync(join(raw, "cfb-fpi.json"), JSON.stringify(cfbFeed(make(130))));
  writeFileSync(join(raw, "nfl-fpi.json"), JSON.stringify(nflFeed()));
  const out = join(dir, "outlook.json");
  const build = async (now: string, extra: Record<string, string> = {}) =>
    (await run("node", ["scripts/build-outlook.mjs"], { env: { ...process.env, RAW_DIR: raw, OUT_FILE: out, NOW: now, ...extra } })).stdout;

  let log = await build("2026-10-06T14:00:00Z"); // Tuesday after 8am
  expect(log).toContain("College outlook rebuilt for the week of 2026-10-04");
  expect(log).toContain("NFL outlook rebuilt for the week of 2026-10-06");
  const first = JSON.parse(readFileSync(out, "utf8"));
  expect(first.cfb.playoff.field).toHaveLength(12);
  expect(first.cfb.composite).toHaveLength(130); // every team, so a conference can be listed whole
  expect(first.cfb.composite.find((t: { conf: string }) => t.conf === "SEC").confRank).toBe(1);
  expect(first.nfl.conferences.AFC.field).toHaveLength(7);

  // Later the same week the feeds change, but the snapshots are frozen until their next cycle.
  writeFileSync(join(raw, "cfb-fpi.json"), JSON.stringify(cfbFeed(make(130).reverse())));
  log = await build("2026-10-08T18:00:00Z");
  expect(log).toContain("College outlook is current");
  expect(log).toContain("NFL outlook is current");
  expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(first);

  // Sunday morning: college turns over, the NFL does not.
  log = await build("2026-10-11T13:30:00Z");
  expect(log).toContain("College outlook rebuilt for the week of 2026-10-11");
  expect(log).toContain("NFL outlook is current");
  const second = JSON.parse(readFileSync(out, "utf8"));
  expect(second.nfl).toEqual(first.nfl);
  expect(second.cfb.cycle).toBe("2026-10-11");

  // Tuesday: an empty feed keeps what is saved.
  writeFileSync(join(raw, "nfl-fpi.json"), JSON.stringify({ categories: [], teams: [] }));
  log = await build("2026-10-13T14:00:00Z");
  expect(log).toContain("NFL outlook kept");
  expect(JSON.parse(readFileSync(out, "utf8")).nfl).toEqual(first.nfl);
});

test("the site opens on college, switches to the NFL from Sunday until the Tuesday 8am refresh, and ?league= overrides", () => {
  const at = (iso: string, q = "") => defaultLeague(new Date(iso), q);
  expect(at("2026-10-03T18:00:00Z")).toBe("CFB"); // Saturday
  expect(at("2026-10-04T04:59:00Z")).toBe("CFB"); // Saturday 11:59pm Central
  expect(at("2026-10-04T05:00:00Z")).toBe("NFL"); // Sunday 12:00am Central
  expect(at("2026-10-05T20:00:00Z")).toBe("NFL"); // Monday
  expect(at("2026-10-06T12:59:00Z")).toBe("NFL"); // Tuesday 7:59am Central
  expect(at("2026-10-06T13:00:00Z")).toBe("CFB"); // Tuesday 8:00am Central
  expect(at("2026-10-08T18:00:00Z")).toBe("CFB");
  expect(at("2026-10-08T18:00:00Z", "?league=nfl")).toBe("NFL");
  expect(at("2026-10-05T18:00:00Z", "?league=CFB")).toBe("CFB");
});

test("@smoke the page opens on the right league and the Outlook tab shows the projections", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-07T18:00:00Z") }); // Wednesday
  await page.goto("/");
  await expect(page.getByLabel("League", { exact: true }).first()).toHaveValue("CFB");
  await page.getByRole("button", { name: /^Outlook/ }).click();
  await expect(page.getByRole("button", { name: "College" })).toHaveAttribute("aria-pressed", "true");
  // Projected playoff: twelve seeds with a bye on the first four.
  await expect(page.locator('ol[aria-label="Projected playoff field"] > li')).toHaveCount(12);
  await expect(page.locator('ol[aria-label="Projected playoff field"] > li.bye')).toHaveCount(4);
  await expect(page.locator(".ol-note").first()).toContainText("Sunday");
  // Rankings: start at 25 and open up to the top 120.
  await page.getByRole("button", { name: "Rankings" }).click();
  await expect(page.locator(".ol-table tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: /^Show all/ }).click();
  expect(await page.locator(".ol-table tbody tr").count()).toBe(120);
  // By conference: every member, numbered within the conference, with its overall rank beside it.
  await page.getByLabel("Conference", { exact: true }).selectOption("SEC");
  const rows = page.locator(".ol-table tbody tr");
  await expect(rows).toHaveCount(16);
  expect(await rows.locator("th").allInnerTexts()).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)));
  const overall = (await rows.locator("td:nth-child(3)").allInnerTexts()).map(Number);
  expect(overall).toEqual([...overall].sort((a, b) => a - b)); // composite order holds inside the conference
  await expect(page.locator(".ol-table thead")).toContainText("Title");
  await page.getByLabel("Conference", { exact: true }).selectOption("Ind");
  await expect(rows).toHaveCount(2);
  // Bowls.
  await page.getByRole("button", { name: "Bowls" }).click();
  await expect(page.locator(".ol-bowls > li").first()).toBeVisible();
  // NFL: seven seeds per conference.
  await page.getByRole("button", { name: "NFL" }).click();
  await expect(page.locator(".ol h3")).toHaveText(["AFC", "NFC"]);
  await expect(page.locator(".ol-note").first()).toContainText("Tuesday");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);

  // On a Sunday the same page opens on the NFL.
  await page.clock.setFixedTime(new Date("2026-10-11T18:00:00Z"));
  await page.reload();
  await expect(page.getByLabel("League", { exact: true }).first()).toHaveValue("NFL");
});

test("the NFL grid has a row per team, a column per seed, and the #1 seed column stands out", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The saved snapshot only gets a grid after the schedule has been fetched in Actions, so serve one here.
  const row = (i: number, conf: string) => ({
    id: `${conf}${i}`, name: `${conf} Team ${i}`, abbr: `${conf[0]}${i}`, logoId: null, division: `${conf} North`, record: "3-1",
    expW: 11 - i * 0.4, pSeed: [40 - i * 2, 20, 10, 8, 6, 5, 4].map((v) => Math.max(v, 0)), pPlayoffs: 95 - i * 4, pDiv: 50 - i * 2,
  });
  const nflSnapshot = (conf: string) => ({ field: [], out: [], grid: Array.from({ length: 16 }, (_, i) => row(i + 1, conf)) });
  await page.route("**/assets/outlook-*.js", async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    // Replace the NFL part of the bundled snapshot with one that has grids.
    const nfl = { cycle: "2026-10-06", built: "2026-10-06", fpiUpdated: null, rules: {}, sim: { sims: 20000, games: 208 }, conferences: { AFC: nflSnapshot("AFC"), NFC: nflSnapshot("NFC") } };
    await route.fulfill({ response: res, body: `${body}\n;` .replace(/export\s*\{\s*(\w+)\s+as\s+default\s*\}/, (_m, v) => `export default { ...${v}, nfl: ${JSON.stringify(nfl)} }`) });
  });
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: /^Outlook/ }).click();
  await expect(page.locator(".ol-grid")).toHaveCount(2);
  const afc = page.locator('[aria-label="AFC seed odds"] table');
  await expect(afc.locator("tbody tr")).toHaveCount(16);
  await expect(afc.locator("thead th")).toHaveText(["Team", "Exp W", "#1", "#2", "#3", "#4", "#5", "#6", "#7", "Playoffs", "Division"]);
  await expect(afc.locator("thead th.bye")).toHaveText("#1");
  await expect(afc.locator("tbody tr").first().locator("td.cell.bye")).toHaveText("38");
  await expect(afc.locator("tbody tr").first().locator("td.tot")).toHaveText("91%");
  await expect(page.locator(".ol-note").nth(1)).toContainText("20,000 times");
  // The grid scrolls inside its own box; the page never scrolls sideways.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);
});

test("the view tabs and Export never overlap, down to the narrowest phone", async ({ page }) => {
  for (const w of [320, 360, 390, 430, 521, 760]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/?league=NFL");
    const boxes = await page.evaluate(() => {
      const box = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { l: b.left, r: b.right, t: b.top, b: b.bottom };
      };
      const tabs = [...document.querySelectorAll(".view-switch button")].map(box);
      return { tabs, exp: box(document.querySelector(".export-btns summary")!), sw: document.querySelector(".view-switch")!.scrollWidth - document.querySelector(".view-switch")!.clientWidth };
    });
    expect(boxes.sw, `tabs overflow at ${w}px`).toBeLessThanOrEqual(0);
    expect(boxes.tabs).toHaveLength(4);
    for (const t of boxes.tabs) {
      const apart = t.r <= boxes.exp.l + 0.5 || t.l >= boxes.exp.r - 0.5 || t.b <= boxes.exp.t + 0.5 || t.t >= boxes.exp.b - 0.5;
      expect(apart, `a view tab overlaps Export at ${w}px`).toBe(true);
    }
  }
});

test("the seed simulation is a fair season: seeds and divisions each add to 100%, and the better team wins more", () => {
  const teams = parseFpi(nflFeed()).map((t, i) => ({ ...t, fpi: 8 - (i % 16) * 0.8, wins: 2, losses: 1, ties: 0 }));
  // Everyone plays out the remaining 14 games against a rotating set of opponents (16 teams per conference).
  const games: { home: string; away: string }[] = [];
  for (let round = 1; round <= 14; round++)
    for (let i = 0; i < teams.length; i += 2) games.push({ home: teams[i].id, away: teams[(i + round * 2 + 1) % teams.length].id });
  const left = games.slice(0, 272 - 48 * 0 - 48).length; // 32 teams x 3 played / 2 = 48 played
  void left;
  const full = (() => {
    const need = new Map(teams.map((t) => [t.id, 14]));
    const out: { home: string; away: string }[] = [];
    let s = 11;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let guard = 0; guard < 20000 && out.length < 224; guard++) {
      const open = teams.filter((t) => need.get(t.id)! > 0);
      if (open.length < 2) break;
      const a = open[Math.floor(r() * open.length)].id;
      const b = open[Math.floor(r() * open.length)].id;
      if (a === b) continue;
      out.push({ home: a, away: b });
      need.set(a, need.get(a)! - 1);
      need.set(b, need.get(b)! - 1);
    }
    return out;
  })();
  const sim = simulateNfl(teams, full, { sims: 4000, seed: hashSeed("2026-10-06") })!;
  expect(sim.sims).toBe(4000);
  for (const conf of ["AFC", "NFC"]) {
    const mine = teams.filter((t) => t.conf === conf);
    for (let k = 0; k < 7; k++) expect(mine.reduce((n, t) => n + sim.byId.get(t.id)!.pSeed[k], 0)).toBeCloseTo(100, 0);
    expect(mine.reduce((n, t) => n + sim.byId.get(t.id)!.pPlayoffs, 0)).toBeCloseTo(700, -1);
    for (const d of new Set(mine.map((t) => t.division)))
      expect(mine.filter((t) => t.division === d).reduce((n, t) => n + sim.byId.get(t.id)!.pDiv, 0)).toBeCloseTo(100, 0);
  }
  // Higher FPI means a better shot at the bye and more expected wins.
  const strong = sim.byId.get(teams[0].id)!;
  const weak = sim.byId.get(teams[15].id)!;
  expect(strong.pSeed[0]).toBeGreaterThan(weak.pSeed[0]);
  expect(strong.expW).toBeGreaterThan(weak.expW);
  // Same seed, same answer; a partial schedule is refused rather than guessed at.
  expect(simulateNfl(teams, full, { sims: 4000, seed: hashSeed("2026-10-06") })!.byId.get(teams[3].id)).toEqual(sim.byId.get(teams[3].id));
  expect(simulateNfl(teams, full.slice(0, 40), { sims: 100 })).toBeNull();
});

test("the schedule fetch keeps only games still to play and ignores a half-fetched season", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sched-"));
  writeFileSync(join(dir, "index.json"), JSON.stringify({ season: 2026 }));
  const ev = (state: string, home: string, away: string, n: number) => ({
    date: `2026-10-${10 + n}T17:00Z`,
    status: { type: { state, completed: state === "post" } },
    id: `g${home}-${away}-${n}`,
    competitions: [{ competitors: [{ homeAway: "home", score: "27", team: { id: home } }, { homeAway: "away", score: "20", team: { id: away } }] }],
  });
  let weeksSeen = 0;
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const week = Number(u.searchParams.get("week"));
    if (!u.pathname.endsWith("/nfl/scoreboard") || u.searchParams.get("dates") !== "2026" || u.searchParams.get("seasontype") !== "2") return void (res.statusCode = 404, res.end("{}"));
    weeksSeen++;
    res.end(JSON.stringify({ events: [ev(week < 5 ? "post" : "pre", "1", "2", week), ev(week === 5 ? "in" : "pre", "3", "4", week)] }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const log = (await run("node", ["scripts/fetch-nfl-schedule.mjs"], { env: { ...process.env, RAW_DIR: dir, ESPN_BASE: base } })).stdout;
    expect(weeksSeen).toBe(18);
    const saved = JSON.parse(readFileSync(join(dir, "nfl-schedule.json"), "utf8"));
    // Weeks 1-4: game one is final (dropped), game two still to play (kept). Weeks 5-18: both kept.
    expect(saved.games).toHaveLength(4 + 14 * 2);
    expect(saved.games[0]).toMatchObject({ week: 1, home: "3", away: "4" });
    expect(log).toContain("32 games left across 18 weeks");
    expect(log).toContain("NFL schedule");
    // The finished games are kept for the Imperialism Map: weeks 1-4's first game, with scores and who was home.
    const finals = JSON.parse(readFileSync(join(dir, "nfl-finals.json"), "utf8"));
    expect(finals.games).toHaveLength(4);
    expect(finals.games[0]).toMatchObject({ week: 1, weekLabel: "Week 1", home: "1", away: "2", homeScore: 27, awayScore: 20, postseason: false });
    // A fetch that only gets a few weeks leaves the saved file alone.
    const before = readFileSync(join(dir, "nfl-schedule.json"), "utf8");
    const dead = await run("node", ["scripts/fetch-nfl-schedule.mjs"], { env: { ...process.env, RAW_DIR: dir, ESPN_BASE: "http://127.0.0.1:1" } });
    expect(dead.stdout).toContain("keeping the saved file");
    expect(readFileSync(join(dir, "nfl-schedule.json"), "utf8")).toBe(before);
  } finally {
    server.close();
  }
});

test("a snapshot built without the schedule is rebuilt with the simulation as soon as one exists", async () => {
  const dir = mkdtempSync(join(tmpdir(), "outlook-sim-"));
  const raw = join(dir, "raw");
  mkdirSync(raw);
  writeFileSync(join(raw, "cfb-fpi.json"), JSON.stringify(cfbFeed(make(130))));
  const feed = nflFeed();
  writeFileSync(join(raw, "nfl-fpi.json"), JSON.stringify(feed));
  const out = join(dir, "outlook.json");
  const build = async (now: string) => (await run("node", ["scripts/build-outlook.mjs"], { env: { ...process.env, RAW_DIR: raw, OUT_FILE: out, NOW: now } })).stdout;
  expect(await build("2026-10-06T14:00:00Z")).toContain("no simulation");
  expect(JSON.parse(readFileSync(out, "utf8")).nfl.sim).toBeNull();
  // A schedule that covers the season (each team has played 3 games, 14 left each: 224 games).
  const ids = (feed.teams as { team: { id: string } }[]).map((t) => t.team.id);
  const games = Array.from({ length: 224 }, (_, i) => ({ week: 5, home: ids[i % 32], away: ids[(i * 7 + 3) % 32 === i % 32 ? (i + 1) % 32 : (i * 7 + 3) % 32] }));
  writeFileSync(join(raw, "nfl-schedule.json"), JSON.stringify({ season: 2026, fetchedAt: "2026-10-07T00:00:00Z", games }));
  const log = await build("2026-10-07T14:00:00Z"); // same Tuesday-cycle, but now there is something to simulate
  expect(log).toMatch(/NFL outlook rebuilt for the week of 2026-10-06 with \d+ simulated seasons|simulation skipped/);
});

test("college seed odds: twelve seeds fill every simulated season, byes go to the top four, conference champions are one per conference", () => {
  const teams = parseFpi(cfbFeed(make(130))).map((t, i) => ({ ...t, fpi: 30 - i * 0.3, wins: 3, losses: i % 7 === 0 ? 1 : 0 }));
  // Each team has played 3-4; give everyone 8 more games, mostly in conference, from a fixed pseudo-random schedule.
  let s = 7;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const need = new Map(teams.map((t) => [t.id, 8]));
  const games: { home: string; away: string }[] = [];
  for (let g = 0; g < 4000; g++) {
    const open = teams.filter((t) => need.get(t.id)! > 0);
    if (open.length < 2) break;
    const a = open[Math.floor(r() * open.length)];
    const pool = open.filter((t) => t.id !== a.id && (r() < 0.7 ? t.groupId === a.groupId : true));
    if (!pool.length) continue;
    const b = pool[Math.floor(r() * pool.length)];
    games.push({ home: a.id, away: b.id });
    need.set(a.id, need.get(a.id)! - 1);
    need.set(b.id, need.get(b.id)! - 1);
  }
  games.push({ home: teams[0].id, away: "FCS-1" }); // an opponent outside the FPI list still counts
  const sim = simulateCfb(teams, games, new Map(), { sims: 3000, seed: hashSeed("2026-10-04") })!;
  expect(sim.sims).toBe(3000);
  const rows = teams.map((t) => sim.byId.get(t.id)!);
  for (let k = 0; k < 12; k++) expect(rows.reduce((n, x) => n + x.pSeed[k], 0)).toBeCloseTo(100, 0); // one team per seed, every season
  expect(rows.reduce((n, x) => n + x.pPlayoffs, 0)).toBeCloseTo(1200, -1);
  expect(rows.reduce((n, x) => n + x.pBye, 0)).toBeCloseTo(400, -1);
  // Seven conferences have a group id; independents (group 18) never win one.
  const confs = new Set(teams.filter((t) => !t.independent).map((t) => t.groupId));
  expect(rows.reduce((n, x) => n + x.pConfTitle, 0)).toBeCloseTo(100 * confs.size, -1);
  expect(sim.byId.get(teams.find((t) => t.independent)!.id)!.pConfTitle).toBe(0);
  // The best team beats the worst, and the same seed gives the same answer.
  expect(sim.byId.get(teams[0].id)!.pPlayoffs).toBeGreaterThan(sim.byId.get(teams[129].id)!.pPlayoffs);
  expect(simulateCfb(teams, games, new Map(), { sims: 3000, seed: hashSeed("2026-10-04") })!.byId.get(teams[5].id)).toEqual(sim.byId.get(teams[5].id));
  expect(simulateCfb(teams, games.slice(0, 5), new Map(), { sims: 10 })).toBeNull(); // nothing to play out
});

test("conference records are read from the standings' vs. Conf. split", () => {
  const feed = { children: [{ standings: { entries: [{ team: { id: "1" }, stats: [{ name: "wins", displayValue: "4" }, { name: "vs. Conf.", displayValue: "3-1" }] }, { team: { id: "2" }, stats: [] }] } }] };
  expect(parseConfRecords(feed).get("1")).toEqual({ w: 3, l: 1 });
  expect(parseConfRecords(feed).has("2")).toBe(false);
});

test("the college schedule fetch asks for FBS games and keeps nothing if any week is missing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "csched-"));
  writeFileSync(join(dir, "index.json"), JSON.stringify({ season: 2026 }));
  const ev = (state: string, home: string, away: string) => ({
    id: `c${home}-${away}`,
    date: "2026-10-17T17:00Z",
    status: { type: { state, completed: state === "post" } },
    competitions: [{ competitors: [{ homeAway: "home", score: "31", team: { id: home } }, { homeAway: "away", score: "17", team: { id: away } }] }],
  });
  const asked: string[] = [];
  let failWeek = 0;
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const week = Number(u.searchParams.get("week"));
    asked.push(`${u.pathname}?groups=${u.searchParams.get("groups")}&limit=${u.searchParams.get("limit")}`);
    if (week === failWeek) return void (res.statusCode = 404, res.end("{}"));
    res.end(JSON.stringify({ events: [ev(week < 6 ? "post" : "pre", "10", "11"), ev("pre", "12", "999")] }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, RAW_DIR: dir, ESPN_BASE: base };
  try {
    let log = (await run("node", ["scripts/fetch-cfb-schedule.mjs"], { env })).stdout;
    expect(asked[0]).toBe("/college-football/scoreboard?groups=80&limit=300");
    expect(log).toContain("College schedule: 27 games left across 16 weeks"); // finished games dropped (weeks 1-5); every opponent kept, FCS ones included
    const finals = JSON.parse(readFileSync(join(dir, "cfb-finals.json"), "utf8")).games;
    expect(finals.filter((g: { postseason: boolean }) => !g.postseason)).toHaveLength(5); // weeks 1-5, one finished game each
    expect(finals.filter((g: { postseason: boolean }) => g.postseason).length).toBeGreaterThan(0); // postseason weeks follow week 16
    expect(Math.min(...finals.filter((g: { postseason: boolean }) => g.postseason).map((g: { week: number }) => g.week))).toBe(17);
    const saved = JSON.parse(readFileSync(join(dir, "cfb-schedule.json"), "utf8"));
    expect(saved.games.some((g: { away: string }) => g.away === "999")).toBe(true);
    const before = readFileSync(join(dir, "cfb-schedule.json"), "utf8");
    failWeek = 9;
    log = (await run("node", ["scripts/fetch-cfb-schedule.mjs"], { env })).stdout;
    expect(log).toContain("week 9 did not come back; keeping the saved file");
    expect(readFileSync(join(dir, "cfb-schedule.json"), "utf8")).toBe(before);
  } finally {
    server.close();
  }
});

test("the college grid reaches the page: a row per contender, twelve seed columns and the bye columns marked", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const rows = Array.from({ length: 20 }, (_, i) => ({
    id: `T${i}`, name: `Team ${i + 1}`, abbr: `T${i}`, logoId: null, conf: i === 3 ? "Ind" : "SEC", record: "5-0", rank: i + 1, expW: 11 - i * 0.2,
    pSeed: Array.from({ length: 12 }, (_, k) => (k === i % 12 ? 40 : 3)), pPlayoffs: 95 - i * 3, pBye: 60 - i * 2, pConfTitle: 30 - i,
  }));
  await page.route("**/assets/outlook-*.js", async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    await route.fulfill({
      response: res,
      body: body.replace(/export\s*\{\s*(\w+)\s+as\s+default\s*\}/, (_m, v) => `export default { ...${v}, cfb: { ...${v}.cfb, sim: { sims: 10000, games: 497 }, grid: ${JSON.stringify(rows)} } }`),
    });
  });
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: /^Outlook/ }).click();
  const grid = page.locator('[aria-label="Playoff seed odds"] table');
  await expect(grid.locator("tbody tr")).toHaveCount(20);
  await expect(grid.locator("thead th")).toHaveText(["Team", "Exp W", ...Array.from({ length: 12 }, (_, i) => `#${i + 1}`), "Playoffs", "Bye", "Conf title"]);
  await expect(grid.locator("thead th.bye")).toHaveCount(4);
  await expect(grid.locator("thead th.edge")).toHaveText("#4");
  await expect(grid.locator("tbody tr").first().locator("td.tot")).toHaveText("95%");
  await expect(page.locator(".ol-note").nth(1)).toContainText("10,000 times");
  await expect(page.locator('ol[aria-label="Projected playoff field"] > li')).toHaveCount(12); // the composite-based field stays below
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);
});

test("a schedule more than a week old is ignored rather than simulated from", async () => {
  const dir = mkdtempSync(join(tmpdir(), "outlook-stale-"));
  const raw = join(dir, "raw");
  mkdirSync(raw);
  const feed = nflFeed();
  writeFileSync(join(raw, "cfb-fpi.json"), JSON.stringify(cfbFeed(make(130))));
  writeFileSync(join(raw, "nfl-fpi.json"), JSON.stringify(feed));
  const ids = (feed.teams as { team: { id: string } }[]).map((t) => t.team.id);
  const games = Array.from({ length: 224 }, (_, i) => ({ week: 5, home: ids[i % 32], away: ids[(i + 1) % 32] }));
  writeFileSync(join(raw, "nfl-schedule.json"), JSON.stringify({ season: 2026, fetchedAt: "2026-09-20T00:00:00Z", games }));
  const out = join(dir, "outlook.json");
  const log = (await run("node", ["scripts/build-outlook.mjs"], { env: { ...process.env, RAW_DIR: raw, OUT_FILE: out, NOW: "2026-10-07T14:00:00Z" } })).stdout;
  expect(log).toContain("no simulation");
  expect(JSON.parse(readFileSync(out, "utf8")).nfl.sim).toBeNull();
});
