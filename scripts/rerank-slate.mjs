// Rewrites the conference rank on the teams in src/data/slate.json from the FPI and standings feeds in
// data-raw, without rebuilding the week (the same rule build-slate.mjs applies, scripts/ranks.mjs).
//   node scripts/rerank-slate.mjs      RAW_DIR and SLATE_FILE override the defaults
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fpiConfRanks } from "./ranks.mjs";
import { parseFpi } from "./outlook-lib.mjs";

const root = new URL("../", import.meta.url);
const RAW = process.env.RAW_DIR ?? "data-raw";
const SLATE = process.env.SLATE_FILE ?? new URL("src/data/slate.json", root).pathname;
const rawPath = (n) => (RAW.startsWith("/") ? `${RAW}/${n}` : new URL(`${RAW}/${n}`, root).pathname);
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

const ranks = new Map();
for (const [key, league] of [["nfl", "NFL"], ["cfb", "CFB"]]) {
  if (!existsSync(rawPath(`${key}-fpi.json`)) || !existsSync(rawPath(`${key}-standings.json`))) continue;
  const fpi = new Map(parseFpi(read(rawPath(`${key}-fpi.json`))).map((t) => [t.id, t.fpiRank]));
  for (const [k, v] of fpiConfRanks(league, read(rawPath(`${key}-standings.json`)), fpi)) ranks.set(k, v);
}
const slate = read(SLATE);
let changed = 0;
for (const g of slate.games)
  for (const t of g.teams) {
    const r = t.ranks;
    const c = ranks.get(`${g.league}:${t.espnId ?? t.id}`);
    if (!r || !c || !r.conf || r.confBasis === "fpi") continue;
    t.ranks = { confBasis: "fpi", ...r, conf: c.conf, confSize: c.confSize };
    changed++;
  }
writeFileSync(SLATE, JSON.stringify(slate, null, 2) + "\n");
console.log(`Conference rank now follows FPI for ${changed} teams on the board.`);
