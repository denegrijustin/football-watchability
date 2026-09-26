// Replaces the low-resolution (24×24) embedded logos with sharp, static WebP
// files built from ESPN's 500px team logos. Network required; run manually
// (or via the "Upgrade logos" workflow), never during a normal build.
//
//   node scripts/upgrade-logos.mjs
//
// Writes public/logos/<logoId>.webp, points src/data/logos.json at those
// files, and records sources in src/data/logo-sources.json. Teams that cannot
// be matched keep their existing image and are listed in the report.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SIZE = 128; // covers the largest on-screen size (34px) at 3× density
const root = new URL("..", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const slate = read("src/data/slate.json");
const logos = read("src/data/logos.json");
mkdirSync(new URL("public/logos/", root), { recursive: true });

// ESPN team IDs for names that are ambiguous or spelled differently.
const OVERRIDES = {
  "miami-fl-": "2390",
  "miami-oh-": "193",
  hawaii: "62",
  "louisiana-monroe": "2433",
  "sam-houston": "2534",
  charlotte: "2429",
};

const API = "https://site.api.espn.com/apis/site/v2/sports/football";
async function list(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const json = await res.json();
  return json.sports[0].leagues[0].teams.map((t) => t.team);
}
const nfl = await list("nfl/teams");
const fbs = await list("college-football/teams?groups=80&limit=1000");
const fcs = await list("college-football/teams?groups=81&limit=1000");
const allCfb = await list("college-football/teams?limit=1000");

const norm = (s = "") =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ʻ'’.]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
const keys = (t) =>
  [t.location, t.shortDisplayName, t.displayName, t.abbreviation].map(norm);

function find(logoId, name, league) {
  const pools = league === "NFL" ? [nfl] : [fbs, fcs, allCfb];
  if (OVERRIDES[logoId]) {
    for (const pool of pools) {
      const t = pool.find((t) => t.id === OVERRIDES[logoId]);
      if (t) return t;
    }
  }
  const n = norm(name);
  for (const pool of pools) {
    const hits = pool.filter((t) => keys(t).includes(n));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      // Prefer the team whose location is an exact match.
      const exact = hits.filter((t) => norm(t.location) === n);
      if (exact.length === 1) return exact[0];
      return { ambiguous: hits.map((t) => `${t.id} ${t.displayName}`) };
    }
  }
  return null;
}

// Dark-background variant first, since the site is dark.
const pickLogo = (team) =>
  (
    team.logos.find((l) => l.rel?.includes("dark")) ??
    team.logos.find((l) => l.rel?.includes("default")) ??
    team.logos[0]
  )?.href;

const teams = new Map();
for (const g of slate.games)
  for (const t of g.teams) teams.set(t.logoId, { name: t.name, league: g.league });

const sources = [];
const problems = [];
for (const [logoId, { name, league }] of teams) {
  const team = find(logoId, name, league);
  if (!team || team.ambiguous) {
    problems.push({ logoId, name, league, candidates: team?.ambiguous ?? [] });
    continue;
  }
  const url = pickLogo(team);
  const res = url && (await fetch(url));
  if (!res?.ok) {
    problems.push({ logoId, name, league, error: `download failed: ${url}` });
    continue;
  }
  const input = Buffer.from(await res.arrayBuffer());
  const out = await sharp(input)
    .trim({ threshold: 1 })
    .resize(SIZE, SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
  writeFileSync(new URL(`public/logos/${logoId}.webp`, root), out);
  logos[logoId] = `/logos/${logoId}.webp`;
  sources.push({
    logoId,
    team: team.displayName,
    espnId: team.id,
    source: url,
    bytes: out.length,
    retrievedAt: new Date().toISOString().slice(0, 10),
  });
  console.log(`✓ ${logoId} ← ${team.displayName} (${out.length} B)`);
}

writeFileSync(
  new URL("src/data/logos.json", root),
  JSON.stringify(logos, null, 2) + "\n",
);
writeFileSync(
  new URL("src/data/logo-sources.json", root),
  JSON.stringify({ size: SIZE, logos: sources, unmatched: problems }, null, 2) +
    "\n",
);
console.log(`\n${sources.length} upgraded, ${problems.length} unmatched`);
for (const p of problems) console.log("✗", JSON.stringify(p));
