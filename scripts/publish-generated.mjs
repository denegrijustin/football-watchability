// Run by the scheduled refresh on a checkout of main, to publish what the refresh generated from the data branch (the commit given as argument).
// It used to copy every src/data/*.json and all of public/ from the data branch, which replaced files kept up by hand on main (the conference logos,
// the custom Denver and Chargers logos) with the data branch's older copies. Now it takes only:
//   - the files the refresh writes (GENERATED), whole;
//   - the exports and venues in public/, whole;
//   - anything the data branch has that main does not (a new team logo, a new network): new files in public/, and new entries in the
//     registries (ADDITIONS), so an entry kept up by hand on main is never replaced.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

export const GENERATED = [
  "slate", "results", "season", "forecasts", "finals", "matchup-stats", "imperialism", "broadcast-checks", "nfl", "team-ids", "team-players", "network-ids",
  "perf-cfb", "perf-nfl", "perf-status", "injuries", "outlook", "standings", "spplus",
].map((n) => `src/data/${n}.json`);
/** Registries kept by hand on main; the refresh may add entries to them. `list`: the array under `key`, matched by `id`; otherwise the object under `key` (or the root). */
export const ADDITIONS = [
  { file: "src/data/logos.json" },
  { file: "src/data/networks.json" },
  { file: "src/data/logo-sources.json", key: "logos", list: "logoId" },
  { file: "src/data/conference-logos.json", key: "conferences" },
];
const ALWAYS_PUBLIC = (p) => p.startsWith("public/exports/") || p === "public/venues.json";

/** `mine` with every entry of `theirs` that it lacks added; entries it has are left exactly as they are. */
export function addMissing(mine, theirs, { key, list } = {}) {
  const out = JSON.parse(JSON.stringify(mine));
  const into = key ? out[key] : out, from = key ? theirs[key] : theirs;
  if (!from || !into) return out;
  if (list) {
    const have = new Set(into.map((e) => e[list]));
    for (const e of from) if (!have.has(e[list])) into.push(e);
  } else {
    for (const [k, v] of Object.entries(from)) if (!(k in into)) into[k] = v;
  }
  return out;
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
if (process.argv[1]?.endsWith("publish-generated.mjs") && process.argv[2]) {
  const src = process.argv[2];
  const there = new Set(git("ls-tree", "-r", "--name-only", src).split("\n").filter(Boolean));
  for (const f of GENERATED) if (there.has(f)) git("checkout", src, "--", f);
  for (const p of there) {
    if (!p.startsWith("public/") || p === "public/_headers") continue;
    if (ALWAYS_PUBLIC(p) || !existsSync(p)) git("checkout", src, "--", p);
  }
  for (const { file, key, list } of ADDITIONS) {
    if (!there.has(file) || !existsSync(file)) continue;
    const mine = JSON.parse(git("show", `HEAD:${file}`)), theirs = JSON.parse(git("show", `${src}:${file}`));
    const next = addMissing(mine, theirs, { key, list });
    if (JSON.stringify(next) !== JSON.stringify(mine)) writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  }
  git("add", "-A", "src/data", "public");
}
