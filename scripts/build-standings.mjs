// Builds src/data/standings.json: the official NFL standings (by division, with seeds) and college conference standings, from ESPN's standings feed.
// Any failure keeps the saved file and exits 0.
//   node scripts/build-standings.mjs
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { parseCfb, parseNfl } from "./standings-lib.mjs";

const root = new URL("../", import.meta.url);
const OUT = new URL("src/data/standings.json", root);
const BASE = "https://site.api.espn.com/apis/v2/sports/football";
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 fbwatch-standings" }, signal: AbortSignal.timeout(90_000) });
      if (res.ok) return await res.json();
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return null;
}

// The site's own logo id for a team: the ids the board already uses (logo-sources by ESPN id, else the name as a slug), else ESPN's picture.
const logoIds = new Map();
if (existsSync(new URL("src/data/logo-sources.json", root))) for (const l of readJson("src/data/logo-sources.json").logos ?? []) logoIds.set(`${l.espnId}|${l.source.includes("/nfl/") ? "nfl" : "ncaa"}`, l.logoId);
const slug = (n) => n.toLowerCase().replace("donkeys", "broncos").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const known = new Set(Object.keys(existsSync(new URL("src/data/logos.json", root)) ? readJson("src/data/logos.json") : {}));
const logoFor = (kind) => (t) => {
  const id = logoIds.get(`${t.id}|${kind}`) ?? [slug(t.displayName ?? ""), slug(t.location ?? "")].find((x) => known.has(x));
  return id && known.has(id) ? { id } : { url: t.logos?.[0]?.href ?? null };
};

async function main() {
  const saved = existsSync(OUT) ? readJson("src/data/standings.json") : null;
  const out = { version: 1, updatedAt: new Date().toISOString(), nfl: saved?.nfl ?? null, cfb: saved?.cfb ?? null };
  const season = new Date().getUTCMonth() < 2 ? new Date().getUTCFullYear() - 1 : new Date().getUTCFullYear();
  const nfl = await getJson(`${BASE}/nfl/standings?season=${season}&level=3`);
  if (nfl?.children?.length) { out.nfl = parseNfl(nfl, { logoFor: logoFor("nfl") }); console.log(`NFL: ${out.nfl.conferences.reduce((n, c) => n + c.divisions.reduce((m, d) => m + d.teams.length, 0), 0)} teams.`); } else console.warn("NFL standings kept as saved.");
  const cfb = await getJson(`${BASE}/college-football/standings?season=${season}`);
  if (cfb?.children?.length) { out.cfb = parseCfb(cfb, { logoFor: logoFor("ncaa") }); console.log(`College: ${out.cfb.conferences.length} conferences, ${out.cfb.conferences.reduce((n, c) => n + c.teams.length, 0)} teams.`); } else console.warn("College standings kept as saved.");
  if (!out.nfl && !out.cfb) { console.warn("No standings data."); return; }
  const tmp = new URL("src/data/standings.json.tmp", root);
  writeFileSync(tmp, JSON.stringify(out));
  renameSync(tmp, OUT);
}
main().catch((e) => console.warn(`standings: ${e.message}; keeping the saved file`));
