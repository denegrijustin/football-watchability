// Downloads the FCS or Division II schools' logos from ESPN's CDN (the same source as the FBS and NFL logos) and wires them into the SP+ tab.
// Network required; run by hand, never during a normal build.
//
//   node scripts/fetch-school-logos.mjs            (FCS)
//   DIVISION=D2 node scripts/fetch-school-logos.mjs
//
// For every team of that division in the SP+ sheet it finds the ESPN team by name, downloads the 500px logo, fits it into a 128px
// transparent WebP at public/logos/<division>/<slug>.webp and records it in src/data/<division>-logos.json (sheet team name -> file,
// with the ESPN id and source address). A team it cannot match keeps its lettered badge and is listed in the report. An entry that
// already has a file is left alone unless FORCE=1. scripts/school-logo-aliases.json maps names the sheet spells differently to ESPN ids.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = new URL("..", import.meta.url);
const DIV = (process.env.DIVISION ?? "FCS").toUpperCase();
if (!["FCS", "D2"].includes(DIV)) throw new Error(`DIVISION must be FCS or D2, not ${DIV}`);
const DIR = DIV.toLowerCase();
const out = new URL(`src/data/${DIR}-logos.json`, root);
mkdirSync(new URL(`public/logos/${DIR}/`, root), { recursive: true });
const FORCE = process.env.FORCE === "1";
const SIZE = 128;
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" };

const sp = JSON.parse(readFileSync(new URL("src/data/spplus.json", root), "utf8"));
const names = new Set();
for (const sh of sp.sheets) if (new RegExp(`^${DIV} Week \\d+$`).test(sh.name)) for (const r of sh.rows.slice(1)) if (r[0] && typeof r[0] === "string") names.add(r[0]);

const prior = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : { teams: {} };
const teams = prior.teams ?? {};

const API = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams";
async function list(q) {
  const r = await fetch(`${API}?${q}`, { headers: UA });
  if (!r.ok) throw new Error(`${q}: ${r.status}`);
  return (await r.json()).sports[0].leagues[0].teams.map((t) => t.team);
}
const fcs = await list(`groups=${DIV === "D2" ? 57 : 81}&limit=1000`);
const all = await list("limit=1000");

const norm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ʻ'’.]/g, "").replace(/&/g, "and").replace(/\bstate\b/g, "st").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
const keys = (t) => [t.location, t.shortDisplayName, t.displayName, t.abbreviation, `${t.location} ${t.name}`].filter(Boolean).map(norm);
// Names the sheet spells differently from ESPN.
const ALIAS = JSON.parse(readFileSync(new URL("scripts/school-logo-aliases.json", root), "utf8"))[DIV] ?? {};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// An alias is an ESPN team id, or { source } for a school ESPN has no logo for (its own athletics site, named in the file).
function find(name) {
  const id = ALIAS[name];
  if (id?.source) return { id: null, displayName: name, source: id.source };
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
  const source = t.source ?? `https://a.espncdn.com/i/teamlogos/ncaa/500/${t.id}.png`;
  try {
    const r = await fetch(source, { headers: UA });
    if (!r.ok) throw new Error(String(r.status));
    const buf = Buffer.from(await r.arrayBuffer());
    const file = `/logos/${DIR}/${slug(name)}.webp`;
    await sharp(buf).resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88 }).toFile(new URL(`public${file}`, root).pathname);
    teams[name] = { src: file, espnId: t.id, espnName: t.source ? null : t.displayName, source, retrievedAt: new Date().toISOString().slice(0, 10) };
    added++;
  } catch (e) {
    missed.push(`${name} (${e.message})`);
  }
  await new Promise((r) => setTimeout(r, 120));
}
const sorted = Object.fromEntries(Object.entries(teams).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(out, JSON.stringify({ $doc: `${DIV} school logos: SP+ sheet team name -> WebP in public/logos/${DIR}/, from ESPN's CDN. Written by scripts/fetch-school-logos.mjs.`, teams: sorted }, null, 1) + "\n");
console.log(`${DIV} logos: ${added} added, ${Object.keys(sorted).length} of ${names.size} teams have one.`);
if (missed.length) console.log(`No logo for: ${missed.join(", ")}`);
