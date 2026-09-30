// Prints "due=yes" when a game on the live board has probably just ended
// (kicked off 3–9 hours ago) and isn't archived yet, so the hourly check in
// refresh.yml only rebuilds when there's a final to pick up.
import { readFileSync } from "node:fs";
const src = (n) => JSON.parse(readFileSync(new URL(`../src/data/${n}`, import.meta.url), "utf8"));
const archived = new Set(src("results.json").games.map((r) => r.espnId));
const now = Date.now();
const due = src("slate.json").games.filter((g) => {
  const t = Date.parse(g.date);
  return !archived.has(g.espnId) && now - t >= 3 * 3600e3 && now - t <= 9 * 3600e3;
});
console.log(`due=${due.length ? "yes" : "no"}`);
console.error(due.map((g) => g.matchup).join("\n") || "No games waiting on a final.");
