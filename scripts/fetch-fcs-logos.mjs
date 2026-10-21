// Downloads the FCS schools' logos from ESPN's CDN (the same source as the FBS and NFL logos) and wires them into the SP+ tab.
// Network required; run by hand or through the "Fetch FCS logos" workflow, never during a normal build.
//
//   node scripts/fetch-fcs-logos.mjs
//
// For every FCS team in the SP+ sheet it finds the ESPN team by name, downloads the 500px logo, fits it into a 128px transparent
// WebP at public/logos/fcs/<slug>.webp and records it in src/data/fcs-logos.json (sheet team name -> file, with the ESPN id and
// source address). A team it cannot match keeps its lettered badge and is listed in the report. An entry that already has a file
// is left alone unless FORCE=1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = new URL("..", import.meta.url);
const out = new URL("src/data/fcs-logos.json", root);
mkdirSync(new URL("public/logos/fcs/", root), { recursive: true });
const FORCE = process.env.FORCE === "1";
const SIZE = 128;
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" };

const sp = JSON.parse(readFileSync(new URL("src/data/spplus.json", root), "utf8"));
const names = new Set();
for (const sh of sp.sheets) if (/^FCS Week \d+$/.test(sh.name)) for (const r of sh.rows.slice(1)) if (r[0] && typeof r[0] === "string") names.add(r[0]);

const prior = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : { teams: {} };
const teams = prior.teams ?? {};

const API = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams";
async function list(q) {
  const r = await fetch(`${API}?${q}`, { headers: UA });
  if (!r.ok) throw new Error(`${q}: ${r.status}`);
  return (await r.json()).sports[0].leagues[0].teams.map((t) => t.team);
}
const fcs = await list("groups=81&limit=1000");
const all = await list("limit=1000");

const norm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ʻ'’.]/g, "").replace(/&/g, "and").replace(/\bstate\b/g, "st").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
const keys = (t) => [t.location, t.shortDisplayName, t.displayName, t.abbreviation, `${t.location} ${t.name}`].filter(Boolean).map(norm);
// Names the sheet spells differently from ESPN.
const ALIAS = JSON.parse(readFileSync(new URL("scripts/fcs-logo-aliases.json", root), "utf8"));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function find(name) {
  const id = ALIAS[name];
  if (id) return all.find((t) => t.id === String(id)) ?? { id: String(id), displayName: name };
  const k = norm(name);
  for (const pool of [fcs, all]) {
    const hit = pool.filter((t) => keys(t).includes(k));
    if (hit.length === 1) return hit[0];
  }
  return null;
}

const missed = [];
let added = 0;
for (const name of [...names].sort()) {
  const have = teams[name];
  if (have && !FORCE && existsSync(new URL(`public${have.src}`, root))) continue;
  const t = find(name);
  if (!t) { missed.push(name); continue; }
  const source = `https://a.espncdn.com/i/teamlogos/ncaa/500/${t.id}.png`;
  try {
    const r = await fetch(source, { headers: UA });
    if (!r.ok) throw new Error(String(r.status));
    const buf = Buffer.from(await r.arrayBuffer());
    const file = `/logos/fcs/${slug(name)}.webp`;
    await sharp(buf).resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88 }).toFile(new URL(`public${file}`, root).pathname);
    teams[name] = { src: file, espnId: t.id, espnName: t.displayName, source, retrievedAt: new Date().toISOString().slice(0, 10) };
    added++;
  } catch (e) {
    missed.push(`${name} (${e.message})`);
  }
  await new Promise((r) => setTimeout(r, 120));
}
const sorted = Object.fromEntries(Object.entries(teams).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(out, JSON.stringify({ $doc: "FCS school logos: SP+ sheet team name -> WebP in public/logos/fcs/, from ESPN's CDN. Written by scripts/fetch-fcs-logos.mjs.", teams: sorted }, null, 1) + "\n");
console.log(`FCS logos: ${added} added, ${Object.keys(sorted).length} of ${names.size} teams have one.`);
if (missed.length) console.log(`No logo for: ${missed.join(", ")}`);
