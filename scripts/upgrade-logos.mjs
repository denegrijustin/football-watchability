// Replaces the low-resolution (24×24) embedded logos with sharp, static WebP
// files built from ESPN's 500px team logos. Network required; run manually
// (or via the "Upgrade logos" workflow), never during a normal build.
//
//   node scripts/upgrade-logos.mjs
//
// Writes public/logos/<logoId>.webp, points src/data/logos.json at those
// files, and records sources in src/data/logo-sources.json. Teams that cannot
// be matched keep their existing image and are listed in the report.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  troy: "2653",
  "appalachian-state": "2026",
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

// Exact ESPN ids from the slate builder, when available.
try {
  const ids = JSON.parse(readFileSync(new URL("src/data/team-ids.json", root), "utf8"));
  for (const [logoId, v] of Object.entries(ids)) OVERRIDES[logoId] ??= v.espnId;
} catch {}
// Only fetch teams without a logo file yet, unless ALL=1.
const ALL = process.env.ALL === "1";
const teams = new Map();
for (const g of slate.games)
  for (const t of g.teams) teams.set(t.logoId, { name: t.name, league: g.league });

let previous = { logos: [] };
try {
  previous = JSON.parse(readFileSync(new URL("src/data/logo-sources.json", root), "utf8"));
} catch {}
const sources = ALL ? [] : previous.logos.filter((l) => !teams.has(l.logoId) || String(logos[l.logoId]).startsWith("/logos/"));
const problems = [];
for (const [logoId, { name, league }] of teams) {
  if (!ALL && String(logos[logoId] ?? "").startsWith("/logos/")) continue;
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
    league,
    source: url,
    bytes: out.length,
    retrievedAt: new Date().toISOString().slice(0, 10),
  });
  console.log(`✓ ${logoId} ← ${team.displayName} (${out.length} B)`);
}

// ---------- TV network logos (from ESPN's broadcast data) ----------
// Networks ESPN has no logo for: current public-domain logo files on Commons.
const COMMONS = {
  cbs: ["File:CBS logo (2020).svg"],
  fox: ["File:Fox Broadcasting Company logo (2019).svg"],
  nbc: ["File:NBC logo 2022.svg"],
  "prime-video": ["File:Prime Video logo (2024).svg"],
  cbssn: ["File:CBS Sports Network 2021.svg"],
  tnt: ["File:TNT Logo 2016.svg"],
  btn: ["File:Big Ten Network logo.svg", "File:BTN logo.svg", "search:Big Ten Network logo svg"],
  fs1: ["File:2015 Fox Sports 1 logo.svg"],
  "usa-net": ["File:USA Network 2025 logo.svg", "File:USA Network logo (2016).svg"],
  "mw-plus": ["File:Mountain West Conference logo.svg"],
  peacock: ["File:NBCUniversal Peacock Logo.svg", "search:Peacock streaming logo svg"],
};
mkdirSync(new URL("public/networks/", root), { recursive: true });
let networkIds = {};
try {
  networkIds = JSON.parse(readFileSync(new URL("src/data/network-ids.json", root), "utf8"));
} catch {}
let networks = {};
try {
  networks = JSON.parse(readFileSync(new URL("src/data/networks.json", root), "utf8"));
} catch {}
for (const [slug, n] of Object.entries(networkIds)) {
  try {
  const file = new URL(`public/networks/${slug}.webp`, root);
  if (!ALL && networks[slug] && existsSync(file)) continue;
  // ESPN's light-background logo (shown on a light chip), else Wikimedia Commons.
  let url = n.logo || n.darkLogo;
  if (!url && COMMONS[slug]) {
    for (const title of COMMONS[slug]) {
      const api = title.startsWith("search:")
        ? `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=1&gsrsearch=${encodeURIComponent(title.slice(7))}&prop=imageinfo&iiprop=url&iiurlwidth=320`
        : `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=320`;
      const j = await (await fetch(api, { headers: { "user-agent": "fbwatch/1.0 (github.com/denegrijustin/football-watchability)" } })).json();
      const page = Object.values(j.query?.pages ?? {})[0];
      url = page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url;
      if (url) break;
    }
  }
  const res = url && (await fetch(url, { headers: { "user-agent": "fbwatch/1.0 (github.com/denegrijustin/football-watchability)" } }));
  if (!res?.ok) {
    problems.push({ network: slug, error: `download failed: ${url}` });
    continue;
  }
  const buf = await sharp(Buffer.from(await res.arrayBuffer()))
    .trim({ threshold: 1 })
    .resize({ height: 48, width: 160, fit: "inside" })
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
  writeFileSync(file, buf);
  networks[slug] = { name: n.name, src: `/networks/${slug}.webp`, source: url };
  console.log(`✓ network ${slug} (${buf.length} B)`);
  } catch (e) {
    problems.push({ network: slug, error: String(e?.message ?? e) });
    console.log(`✗ network ${slug}: ${e?.message ?? e}`);
  }
}
writeFileSync(new URL("src/data/networks.json", root), JSON.stringify(networks, null, 2) + "\n");

writeFileSync(
  new URL("src/data/logos.json", root),
  JSON.stringify(logos, null, 2) + "\n",
);
writeFileSync(
  new URL("src/data/logo-sources.json", root),
  JSON.stringify({ size: SIZE, logos: sources, unmatched: problems }, null, 2) +
    "\n",
);
console.log(`\n${sources.length} logos on record, ${problems.length} unmatched`);
for (const p of problems) console.log("✗", JSON.stringify(p));
