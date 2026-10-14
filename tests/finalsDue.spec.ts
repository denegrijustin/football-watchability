import { test, expect } from "@playwright/test";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, execFileSync } from "node:child_process";

test("hourly refresh retries overdue finals after the old nine-hour deadline", () => {
  const dir = mkdtempSync(join(tmpdir(), "finals-due-"));
  try {
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "src/data"), { recursive: true });
    copyFileSync("scripts/finals-due.mjs", join(dir, "scripts/finals-due.mjs"));
    copyFileSync("scripts/finals-lib.mjs", join(dir, "scripts/finals-lib.mjs"));
    const game = { espnId: "overdue", matchup: "Overdue final", date: new Date(Date.now() - 24 * 3600e3).toISOString() };
    const run = (games: unknown[], archived: unknown[]) => {
      writeFileSync(join(dir, "src/data/slate.json"), JSON.stringify({ games }));
      writeFileSync(join(dir, "src/data/results.json"), JSON.stringify({ games: archived }));
      return execFileSync(process.execPath, [join(dir, "scripts/finals-due.mjs")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FINALS_DUE_ESPN: "off" } }).trim();
    };
    expect(run([game], [])).toBe("due=yes");
    expect(run([game], [{ espnId: game.espnId }])).toBe("due=no");
    expect(run([{ ...game, date: new Date(Date.now() + 3600e3).toISOString() }], [])).toBe("due=no");
    expect(run([{ ...game, date: new Date(Date.now() + 3600e3).toISOString(), availability: { conf: "SEC" } }], [])).toBe("due=yes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Every FBS and NFL game feeds the CFB SP+ and NFL+ ATS trackers, so a new final anywhere (not only on the board) triggers a rebuild.
test("hourly refresh runs when ESPN shows a final that finals.json does not have yet", async () => {
  const { createServer } = await import("node:http");
  const event = (id: string, state: string) => ({ id, date: new Date().toISOString(), status: { type: { state, completed: state === "post", shortDetail: "Final" } },
    competitions: [{ competitors: [{ homeAway: "home", score: "27", team: { id: "1", location: "Home", abbreviation: "HOM" } }, { homeAway: "away", score: "20", team: { id: "2", location: "Away", abbreviation: "AWY" } }] }] });
  let events: unknown[] = [];
  const server = createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ events })); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = mkdtempSync(join(tmpdir(), "finals-due-espn-"));
  try {
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "src/data"), { recursive: true });
    copyFileSync("scripts/finals-due.mjs", join(dir, "scripts/finals-due.mjs"));
    copyFileSync("scripts/finals-lib.mjs", join(dir, "scripts/finals-lib.mjs"));
    writeFileSync(join(dir, "src/data/slate.json"), JSON.stringify({ games: [] }));
    writeFileSync(join(dir, "src/data/results.json"), JSON.stringify({ games: [] }));
    const run = () => new Promise<string>((resolve, reject) => {
      const p = execFile(process.execPath, [join(dir, "scripts/finals-due.mjs")], { encoding: "utf8", env: { ...process.env, ESPN_BASE: base } }, (e, out) => (e ? reject(e) : resolve(out.trim())));
      void p;
    });
    events = [event("900", "in")];
    expect(await run()).toBe("due=no");
    events = [event("900", "post")];
    expect(await run()).toBe("due=yes");
    writeFileSync(join(dir, "src/data/finals.json"), JSON.stringify({ games: [{ l: "cfb", id: "900" }, { l: "nfl", id: "900" }] }));
    expect(await run()).toBe("due=no");
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
