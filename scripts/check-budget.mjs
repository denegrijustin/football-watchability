// Size budgets for the built site (gzip), so growth is caught in review instead of on a phone.
// Run after `pnpm build`:  node scripts/check-budget.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const dist = new URL("../dist/", import.meta.url);
if (!existsSync(dist)) throw new Error("Run pnpm build first.");
const KB = 1024;
const gz = (url) => gzipSync(readFileSync(url), { level: 9 }).length;
const list = (dir, ext) => (existsSync(new URL(dir, dist)) ? readdirSync(new URL(dir, dist)).filter((f) => f.endsWith(ext)) : []);

const limits = []; // [label, bytes, max]
let totalJs = 0;
for (const f of list("assets/", ".js")) {
  const size = gz(new URL(`assets/${f}`, dist));
  totalJs += size;
  limits.push([`assets/${f}`, size, 110 * KB]);
}
limits.push(["all JavaScript", totalJs, 480 * KB]); // 460 until the injury figures and rivalry trophies; 420 until the picks, parlays, playoff leverage, fresh-lines refresh and redesigned cards (all lazy chunks, about 40 KB gzipped between them; the first-load chunk is unchanged); 340 until the eight team-performance tabs (lazy chunks, about 60 KB gzipped); 300 until the last-play field, drive stats, halftime band and live streams (about 20 KB gzipped) arrived
for (const f of list("assets/", ".css")) limits.push([`assets/${f}`, gz(new URL(`assets/${f}`, dist)), 36 * KB]); // 32 before the motion layer (watch-now, score ring, transitions, skeletons)
const DATA_MAX = { slate: 220, results: 120, season: 100, imperialism: 150, "matchup-stats": 40, outlook: 40, "broadcast-checks": 20, spplus: 400, "spplus-lite": 40, "perf-nfl": 80, "perf-cfb": 420 }; // perf-*.json load only when a performance tab opens; spplus.json is the whole sheet; it loads only when the CFB SP+ tab opens
for (const f of list("data/", ".json")) limits.push([`data/${f}`, gz(new URL(`data/${f}`, dist)), (DATA_MAX[f.replace(/\.json$/, "")] ?? 60) * KB]);

let bad = 0;
for (const [label, size, max] of limits.sort((a, b) => b[1] - a[1])) {
  const over = size > max;
  if (over) bad++;
  console.log(`${over ? "OVER " : "ok   "} ${label.padEnd(44)} ${(size / KB).toFixed(1).padStart(7)} KB / ${(max / KB).toFixed(0)} KB`);
}
if (bad) {
  console.log(`::error title=Size budget::${bad} file(s) over budget. Raise the limit in scripts/check-budget.mjs only if the growth is intended.`);
  process.exit(1);
}
