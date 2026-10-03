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

test("the attendance script fills attendance and capacity, keeps what it has, and is safe to re-run", async () => {
  const old = new Date(Date.now() - 10 * 864e5).toISOString();
  const recent = new Date(Date.now() - 1 * 864e5).toISOString();
  const summaries: Record<string, unknown> = {
    "1": { gameInfo: { attendance: 68156, venue: { id: "3679" } } },
    "2": { gameInfo: { attendance: 51012, venue: { id: "3953" } } },
    "3": { gameInfo: { attendance: 0, venue: { id: "3799" } } }, // ESPN never published one, game is old
    "4": { gameInfo: { attendance: 0, venue: { id: "3800" } } }, // not published yet, game is recent: retry later
  };
  const venueCalls: string[] = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "", "http://x");
    res.setHeader("content-type", "application/json");
    const sum = u.pathname.endsWith("/summary") && summaries[u.searchParams.get("event") ?? ""];
    if (sum) return void res.end(JSON.stringify(sum));
    const v = u.pathname.match(/\/venues\/(\d+)$/);
    if (v) {
      venueCalls.push(v[1]);
      if (v[1] === "3679") return void res.end(JSON.stringify({ id: "3679", fullName: "Huntington Bank Field", capacity: 67431 }));
      if (v[1] === "3953") return void res.end(JSON.stringify({ id: "3953", fullName: "Huntington Bank Stadium" })); // no capacity published
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
      ],
    }),
  );
  const exec = async () =>
    (await run("node", ["scripts/attendance.mjs"], { env: { ...process.env, ESPN_BASE: base, ESPN_CORE_BASE: base, RESULTS_FILE: results, VENUES_FILE: venues, RAW_DIR: join(dir, "none") } })).stdout;
  try {
    const log = await exec();
    expect(log).toContain("Attendance: 2 added, 1 unavailable");
    const games = Object.fromEntries(JSON.parse(readFileSync(results, "utf8")).games.map((g: any) => [g.espnId, g]));
    expect(games["1"]).toMatchObject({ attendance: 68156, venueId: "3679" });
    expect(games["2"]).toMatchObject({ attendance: 51012, venueId: "3953" });
    expect(games["3"].attendance).toBeNull(); // asked once, nothing to show, stop asking
    expect(games["4"].attendance).toBeUndefined(); // recent: try again next run
    expect(games["5"]).toMatchObject({ attendance: 70000, venueId: "9" });
    // Capacities for stadiums of games that have attendance; a missing capacity stays null (never guessed).
    const v = JSON.parse(readFileSync(venues, "utf8"));
    expect(v["3679"]).toMatchObject({ name: "Huntington Bank Field", capacity: 67431 });
    expect(v["3953"].capacity).toBeNull();
    // A game that already had attendance still gets its stadium looked up; ESPN has no venue 9, so
    // nothing is stored for it (no made-up entry) and it is asked about again next run.
    expect(Object.keys(v)).not.toContain("9");
    expect(venueCalls.sort()).toEqual(["3679", "3953", "9"]);
    // Re-run: known stadiums (even one with no published capacity) are not fetched again.
    venueCalls.length = 0;
    await exec();
    expect(venueCalls).toEqual(["9"]);
    expect(JSON.parse(readFileSync(results, "utf8")).games).toHaveLength(5);
  } finally {
    server.close();
  }
});
