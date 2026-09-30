import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeLedger } from "../scripts/season-ledger.mjs";
import { mostInsaneWeek, rankGames, weekSummaries, type LedgerGame } from "../src/seasonRank";

const run = promisify(execFile);
const game = (id: string, week: string, date: string, insanity: number, swing = 10, league: "NFL" | "CFB" = "NFL"): LedgerGame => ({
  id,
  league,
  week,
  date,
  matchup: `Team ${id} @ Team ${id}b`,
  away: { abbr: "AAA", logoId: "a", score: 20 },
  home: { abbr: "BBB", logoId: "b", score: 21 },
  insanity,
  tier: insanity >= 78 ? "witching" : insanity >= 58 ? "unhinged" : insanity >= 38 ? "wild" : insanity >= 20 ? "restless" : "calm",
  flips: 1,
  swing,
  comebackFrom: null,
  overtime: false,
  witchingPeriod: 4,
});

test("season ranking orders games, ties break on swing, and the most insane week wins on average", () => {
  const games = [
    game("1", "Wk1", "2026-09-10T20:00Z", 90),
    game("2", "Wk1", "2026-09-11T20:00Z", 10),
    game("3", "Wk2", "2026-09-17T20:00Z", 60, 20),
    game("4", "Wk2", "2026-09-18T20:00Z", 60, 40),
    game("5", "Wk2", "2026-09-19T20:00Z", 58),
  ];
  expect(rankGames(games).map((g) => g.id)).toEqual(["1", "4", "3", "5", "2"]);
  const weeks = weekSummaries(games);
  expect(weeks.map((w) => w.week)).toEqual(["Wk2", "Wk1"]); // newest first
  expect(weeks[0]).toMatchObject({ games: 3, wild: 3 });
  expect(weeks[0].avg).toBeCloseTo(59.3, 1);
  expect(weeks[0].top.id).toBe("4");
  // Wk2 averages ~59 vs Wk1's 50: Wk2 is the most insane week even though Wk1 has the single wildest game.
  expect(mostInsaneWeek(weeks)?.week).toBe("Wk2");
  expect(mostInsaneWeek([])).toBeNull();
});

test("ledger merges by game id and stays newest first", () => {
  const old = { updated: "2026-09-01", games: [game("1", "Wk1", "2026-09-10T20:00Z", 30), game("2", "Wk1", "2026-09-11T20:00Z", 40)] };
  const out = mergeLedger(old, [game("2", "Wk1", "2026-09-11T20:00Z", 55), game("3", "Wk2", "2026-09-17T20:00Z", 70), null], "2026-09-20");
  expect(out.games.map((g: LedgerGame) => [g.id, g.insanity])).toEqual([
    ["3", 70],
    ["2", 55],
    ["1", 30],
  ]);
  expect(out.updated).toBe("2026-09-20");
});

test("backfill script scores finished games from ESPN and is safe to re-run", async () => {
  const wild = Array.from({ length: 160 }, (_, i) => ({ homeWinPercentage: 0.5 + 0.4 * Math.sin(i / 6), playId: `p${i}` }));
  const calm = Array.from({ length: 120 }, (_, i) => ({ homeWinPercentage: 0.5 + i / 300, playId: `c${i}` }));
  const drives = (n: number) => ({ previous: [{ plays: Array.from({ length: n }, (_, i) => ({ id: `${n === 160 ? "p" : "c"}${i}`, period: { number: 1 + Math.floor(i / (n / 4)) } })) }] });
  const ev = (id: string, date: string, state: string, period = 4) => ({
    id,
    date,
    competitions: [
      {
        status: { period, type: { state } },
        competitors: [
          { homeAway: "away", score: "24", team: { id: "1", abbreviation: "AAA", displayName: `Away ${id}` } },
          { homeAway: "home", score: "27", team: { id: "2", abbreviation: "BBB", displayName: `Home ${id}` } },
        ],
      },
    ],
  });
  const summaries: Record<string, unknown> = {
    "100": { winprobability: wild, drives: drives(160) },
    "101": { winprobability: calm, drives: drives(120) },
    "102": { winprobability: wild, drives: drives(160) },
    "103": { winprobability: [], drives: { previous: [] } }, // no win-probability line: dropped
  };
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "", "http://x");
    res.setHeader("content-type", "application/json");
    if (u.pathname.endsWith("/scoreboard")) {
      const nfl = u.pathname.includes("/nfl/");
      // One day per request, like ESPN (which rejects ranges).
      const day = u.searchParams.get("dates") ?? "";
      const all = nfl
        ? [ev("100", "2026-09-10T00:20Z", "post"), ev("104", "2026-09-13T17:00Z", "in"), ev("102", "2026-09-17T00:20Z", "post", 5)]
        : [ev("101", "2026-09-12T19:00Z", "post"), ev("103", "2026-09-12T23:00Z", "post")];
      const events = all.filter((e) => e.date.slice(0, 10).replace(/-/g, "") === day);
      return void res.end(JSON.stringify({ events }));
    }
    const id = u.searchParams.get("event") ?? "";
    if (summaries[id]) return void res.end(JSON.stringify(summaries[id]));
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const dir = mkdtempSync(join(tmpdir(), "season-"));
  const file = join(dir, "season.json");
  writeFileSync(file, JSON.stringify({ updated: "2026-09-01", games: [game("999", "Old week", "2026-09-01T20:00Z", 33)] }));
  // Async on purpose: the fake ESPN server lives in this process and must keep answering.
  const backfill = async () =>
    (
      await run("node", ["scripts/backfill-insanity.mjs"], {
        env: { ...process.env, ESPN_BASE: `http://127.0.0.1:${port}`, SEASON_FILE: file, START: "20260908", END: "20260921" },
      })
    ).stdout;
  try {
    const log = await backfill();
    expect(log).toContain("Scored 3 games (1 had no win-probability line)");
    const ledger = JSON.parse(readFileSync(file, "utf8")).games as LedgerGame[];
    expect(ledger.map((g) => g.id).sort()).toEqual(["100", "101", "102", "999"]); // 'in' game and the empty one skipped, old row kept
    const byId = Object.fromEntries(ledger.map((g) => [g.id, g]));
    expect(byId["100"].insanity).toBeGreaterThan(byId["101"].insanity + 30); // wild vs one-sided
    expect(byId["101"].tier).toBe("calm");
    expect(byId["102"].overtime).toBe(true);
    expect(byId["100"]).toMatchObject({ league: "NFL", away: { abbr: "AAA", score: 24 }, home: { abbr: "BBB", score: 27 } });
    expect(byId["101"].league).toBe("CFB");
    expect(byId["100"].week).toMatch(/^Sept\. /);
    expect(byId["100"].week).not.toBe(byId["102"].week); // two Tuesday-to-Monday weeks
    // Re-running the same range changes nothing.
    await backfill();
    expect(JSON.parse(readFileSync(file, "utf8")).games).toHaveLength(4);
  } finally {
    server.close();
  }
});
