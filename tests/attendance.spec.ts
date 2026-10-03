import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attendanceView } from "../src/attendance";

const run = promisify(execFile);

test("attendance is a share of capacity, never guessed", () => {
  expect(attendanceView(65632, 71000)).toMatchObject({ pct: 92.4, fill: 92.4, level: "high" });
  expect(attendanceView(35000, 60000)).toMatchObject({ pct: 58.3, level: "low" });
  expect(attendanceView(50000, 70000)).toMatchObject({ pct: 71.4, level: "mid" });
  // Over capacity (standing room): the number is honest, the bar stops at full.
  expect(attendanceView(68156, 67431)).toMatchObject({ pct: 101.1, fill: 100, level: "high" });
  // No capacity: show the count, no percentage and no bar.
  expect(attendanceView(51012, null)).toEqual({ attendance: 51012, capacity: null, pct: null, fill: null, level: null });
  expect(attendanceView(51012, 0)?.pct).toBeNull();
  // Nothing to show without a real attendance.
  expect(attendanceView(0, 70000)).toBeNull();
  expect(attendanceView(null, 70000)).toBeNull();
  expect(attendanceView(undefined, undefined)).toBeNull();
});

const game = (id: string, league: "NFL" | "CFB", date: string, extra: Record<string, unknown> = {}) => ({ espnId: id, league, date, matchup: `Game ${id}`, ...extra });

const WIKI_HTML = {
  "List of current NFL stadiums": `<table class="wikitable"><tr><th>Stadium</th><th>Capacity</th><th>Location</th><th>Team(s)</th></tr>
    <tr><td>Huntington Bank Field</td><td>67,431</td><td>Cleveland, Ohio</td><td>Browns</td></tr></table>`,
  "List of NCAA Division I FBS football stadiums": `<table class="wikitable"><tr><th>Stadium</th><th>City</th><th>State</th><th>Team</th><th>Capacity</th></tr>
    <tr><td>Huntington Bank Stadium</td><td>Minneapolis</td><td>Minnesota</td><td>Minnesota</td><td>50,805<sup>[1]</sup></td></tr>
    <tr><td>Memorial Stadium</td><td>Lincoln</td><td>Nebraska</td><td>Nebraska</td><td>85,458</td></tr>
    <tr><td>Memorial Stadium</td><td>Clemson</td><td>South Carolina</td><td>Clemson</td><td>81,500</td></tr></table>`,
} as Record<string, string>;

test("the attendance script fills attendance and stadium capacity, keeps what it has, and is safe to re-run", async () => {
  const old = new Date(Date.now() - 10 * 864e5).toISOString();
  const recent = new Date(Date.now() - 1 * 864e5).toISOString();
  const summaries: Record<string, unknown> = {
    "1": { gameInfo: { attendance: 68156, venue: { id: "3679" } } },
    "2": { gameInfo: { attendance: 51012, venue: { id: "3953" } } },
    "3": { gameInfo: { attendance: 0, venue: { id: "3799" } } }, // ESPN never published one, game is old
    "4": { gameInfo: { attendance: 0, venue: { id: "3800" } } }, // not published yet, game is recent: retry later
    "6": { gameInfo: { attendance: 80000, venue: { id: "5001" } } }, // "Memorial Stadium" with no state we can use
    "7": { gameInfo: { attendance: 85000, venue: { id: "5002" } } }, // "Memorial Stadium" in Nebraska
    "8": { gameInfo: { attendance: 30000, venue: { id: "5003" } } }, // a stadium on no list
  };
  const venueCalls: string[] = [];
  const wikiCalls: string[] = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "", "http://x");
    res.setHeader("content-type", "application/json");
    const sum = u.pathname.endsWith("/summary") && summaries[u.searchParams.get("event") ?? ""];
    if (sum) return void res.end(JSON.stringify(sum));
    const v = u.pathname.match(/\/venues\/(\d+)$/);
    if (v) {
      venueCalls.push(v[1]);
      // ESPN names the stadium and says where it is, but publishes no capacity.
      const known: Record<string, unknown> = {
        "3679": { fullName: "Huntington Bank Field", address: { city: "Cleveland", state: "OH" } },
        "3953": { fullName: "Huntington Bank Stadium", address: { city: "Minneapolis", state: "MN" } },
        "5001": { fullName: "Memorial Stadium", address: { state: "KS" } },
        "5002": { fullName: "Memorial Stadium", address: { city: "Lincoln", state: "NE" } },
        "5003": { fullName: "Some Other Field", address: { city: "Anywhere", state: "TX" } },
      };
      if (known[v[1]]) return void res.end(JSON.stringify(known[v[1]]));
    }
    if (u.pathname === "/w/api.php") {
      const page = u.searchParams.get("page") ?? "";
      wikiCalls.push(page);
      if (WIKI_HTML[page]) return void res.end(JSON.stringify({ parse: { title: page, text: WIKI_HTML[page] } }));
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = mkdtempSync(join(tmpdir(), "att-"));
  const results = join(dir, "results.json");
  const venues = join(dir, "venues.json");
  writeFileSync(
    results,
    JSON.stringify({
      updated: "2026-10-01",
      games: [
        game("1", "NFL", old),
        game("2", "CFB", old),
        game("3", "CFB", old),
        game("4", "CFB", recent),
        game("5", "NFL", old, { attendance: 70000, venueId: "9" }), // already has it: untouched, not refetched
        game("6", "CFB", old),
        game("7", "CFB", old),
        game("8", "CFB", old),
      ],
    }),
  );
  const seedFile = join(dir, "seed.json");
  writeFileSync(seedFile, JSON.stringify({ "5001": { capacity: 51500 }, "3679": { capacity: 1 } }));
  const exec = async () =>
    (await run("node", ["scripts/attendance.mjs"], { env: { ...process.env, ESPN_BASE: base, ESPN_CORE_BASE: base, WIKI_BASE: base, RESULTS_FILE: results, VENUES_FILE: venues, RAW_DIR: join(dir, "none"), SEED_FILE: seedFile } })).stdout;
  try {
    const log = await exec();
    expect(log).toContain("Attendance: 5 added, 1 unavailable");
    const games = Object.fromEntries(JSON.parse(readFileSync(results, "utf8")).games.map((g: any) => [g.espnId, g]));
    expect(games["1"]).toMatchObject({ attendance: 68156, venueId: "3679" });
    expect(games["2"]).toMatchObject({ attendance: 51012, venueId: "3953" });
    expect(games["3"].attendance).toBeNull(); // asked once, nothing to show, stop asking
    expect(games["4"].attendance).toBeUndefined(); // recent: try again next run
    expect(games["5"]).toMatchObject({ attendance: 70000, venueId: "9" });
    // ESPN gave names and places, no capacities; Wikipedia's lists supply them where the match is clear.
    const v = JSON.parse(readFileSync(venues, "utf8"));
    expect(v["3679"]).toMatchObject({ name: "Huntington Bank Field", city: "Cleveland", state: "OH" });
    expect(v["3953"]).toMatchObject({ capacity: 50805, source: "wikipedia" }); // footnote marker ignored
    expect(v["5002"]).toMatchObject({ capacity: 85458, source: "wikipedia" }); // two Memorial Stadiums: Nebraska picked by state
    // The checked-in seed list (by venue id) wins over Wikipedia; it is what covers Kansas's Memorial Stadium.
    expect(v["5001"]).toMatchObject({ capacity: 51500, source: "seed" });
    expect(v["3679"]).toMatchObject({ source: "seed", capacity: 1 });
    // Never guessed: an unlisted stadium has no capacity.
    expect(v["5003"].capacity).toBeNull();
    expect(log).toContain("capacities from the seed list, 2 from Wikipedia");
    expect(log).toMatch(/No capacity found for 1 stadiums: .*Some Other Field \(TX\)/);
    expect(wikiCalls).toEqual(["List of current NFL stadiums", "List of NCAA Division I FBS football stadiums", "List of NCAA Division I FCS football stadiums"]);
    expect(log).toContain("Wikipedia page unavailable: List of NCAA Division I FCS football stadiums"); // a missing page does not stop the run
    // Re-run: ESPN is not asked about stadiums we already know (only the unreachable one), Wikipedia is read again
    // for the two still missing a capacity, and nothing changes.
    venueCalls.length = 0;
    const before = readFileSync(venues, "utf8");
    await exec();
    expect(venueCalls).toEqual(["9"]);
    expect(readFileSync(venues, "utf8")).toBe(before);
    expect(JSON.parse(readFileSync(results, "utf8")).games).toHaveLength(8);
  } finally {
    server.close();
  }
});
