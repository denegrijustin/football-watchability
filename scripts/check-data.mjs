// Publish gate for the board's data: every file the app fetches must exist, parse and have its basic shape,
// and (after `pnpm build`) be present in dist/data. Hard problems exit 1; staleness is reported as a warning.
//   node scripts/check-data.mjs
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const NAMES = ["slate", "results", "matchup-stats", "broadcast-checks", "season", "imperialism", "outlook"];
const problems = [];
const warn = (m) => console.log(`::warning title=Data check::${m}`);
const data = {};

for (const name of NAMES) {
  const file = new URL(`src/data/${name}.json`, root);
  if (!existsSync(file)) {
    problems.push(`src/data/${name}.json is missing (the app fetches it as /data/${name}.json)`);
    continue;
  }
  try {
    data[name] = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    problems.push(`src/data/${name}.json is not valid JSON: ${e.message}`);
    continue;
  }
  const dist = new URL(`dist/data/${name}.json`, root);
  if (existsSync(new URL("dist/", root)) && !existsSync(dist)) problems.push(`dist/data/${name}.json was not built`);
}

const days = (iso) => (Date.now() - Date.parse(iso)) / 864e5;
if (data.slate) {
  if (!Array.isArray(data.slate.games) || data.slate.games.length < 1) problems.push("slate has no games");
  else if (data.slate.games.length < 5) warn(`slate has only ${data.slate.games.length} games`);
  const snap = Date.parse(data.slate.snapshotDate);
  if (Number.isFinite(snap) && days(data.slate.snapshotDate) > 10) warn(`slate snapshot is ${Math.round(days(data.slate.snapshotDate))} days old (${data.slate.snapshotDate})`);
}
if (data.results && !Array.isArray(data.results.games)) problems.push("results has no games array");
if (data.results?.games?.length === 0) warn("results is empty");
if (data["matchup-stats"] && !data["matchup-stats"].leagues) problems.push("matchup-stats has no leagues");
if (data.season && !Array.isArray(data.season.games)) problems.push("season has no games array");
if (data.imperialism && !data.imperialism.leagues && !data.imperialism.counties) problems.push("imperialism snapshot has no leagues or counties");
for (const league of ["cfb", "nfl"]) {
  const built = data.outlook?.[league]?.built;
  if (data.outlook && !built) warn(`outlook has no ${league.toUpperCase()} snapshot`);
  else if (built && days(built) > 16) warn(`${league.toUpperCase()} outlook was built ${Math.round(days(built))} days ago`);
}

if (problems.length) {
  for (const p of problems) console.log(`::error title=Data check::${p}`);
  process.exit(1);
}
console.log(`Data check passed: ${NAMES.length} files present.`);
