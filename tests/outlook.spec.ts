import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cfbBowls, cfbComposite, cfbPlayoff, cycleKey, nflPlayoff, parseFpi } from "../scripts/outlook-lib.mjs";
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
  expect(first.cfb.composite.length).toBeLessThanOrEqual(120);
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
  // Top 120: starts at 25 and opens up to all of them.
  await page.getByRole("button", { name: "Top 120" }).click();
  await expect(page.locator(".ol-table tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: /^Show all/ }).click();
  expect(await page.locator(".ol-table tbody tr").count()).toBeGreaterThan(100);
  // Bowls.
  await page.getByRole("button", { name: "Bowls" }).click();
  await expect(page.locator(".ol-bowls > li").first()).toBeVisible();
  // NFL: seven seeds per conference.
  await page.getByRole("button", { name: "NFL" }).click();
  await expect(page.locator('ol[aria-label="AFC playoff seeds"] > li')).toHaveCount(7);
  await expect(page.locator('ol[aria-label="NFC playoff seeds"] > li')).toHaveCount(7);
  await expect(page.locator(".ol-note").first()).toContainText("Tuesday");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(errors).toEqual([]);

  // On a Sunday the same page opens on the NFL.
  await page.clock.setFixedTime(new Date("2026-10-11T18:00:00Z"));
  await page.reload();
  await expect(page.getByLabel("League", { exact: true }).first()).toHaveValue("NFL");
});
