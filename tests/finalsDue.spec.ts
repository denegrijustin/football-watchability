import { test, expect } from "@playwright/test";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("hourly refresh retries overdue finals after the old nine-hour deadline", () => {
  const dir = mkdtempSync(join(tmpdir(), "finals-due-"));
  try {
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "src/data"), { recursive: true });
    copyFileSync("scripts/finals-due.mjs", join(dir, "scripts/finals-due.mjs"));
    const game = { espnId: "overdue", matchup: "Overdue final", date: new Date(Date.now() - 24 * 3600e3).toISOString() };
    const run = (games: unknown[], archived: unknown[]) => {
      writeFileSync(join(dir, "src/data/slate.json"), JSON.stringify({ games }));
      writeFileSync(join(dir, "src/data/results.json"), JSON.stringify({ games: archived }));
      return execFileSync(process.execPath, [join(dir, "scripts/finals-due.mjs")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    };
    expect(run([game], [])).toBe("due=yes");
    expect(run([game], [{ espnId: game.espnId }])).toBe("due=no");
    expect(run([{ ...game, date: new Date(Date.now() + 3600e3).toISOString() }], [])).toBe("due=no");
    expect(run([{ ...game, date: new Date(Date.now() + 3600e3).toISOString(), availability: { conf: "SEC" } }], [])).toBe("due=yes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
