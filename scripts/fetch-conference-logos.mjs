// Downloads the official conference logos from ESPN's CDN and wires them into the field art. Network required; run through the
// "Fetch conference logos" workflow (or by hand), never during a normal build.
//
//   node scripts/fetch-conference-logos.mjs
//
// For every conference in src/data/conference-logos.json it finds ESPN's logo (the college conferences through ESPN's
// conference listing, the AFC and NFC through the league's own logo paths), trims it, fits it into a 128px transparent
// WebP at public/conf-logos/<slug>.webp and sets "src" on the conference's entry, which replaces the lettered badge.
// Conferences it cannot find keep their badge and are listed in the report. A "src" that is already set is left alone
// unless FORCE=1 (so a hand-supplied logo is never replaced).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = new URL("..", import.meta.url);
const jsonUrl = new URL("src/data/conference-logos.json", root);
const registry = JSON.parse(readFileSync(jsonUrl, "utf8"));
mkdirSync(new URL("public/conf-logos/", root), { recursive: true });
const FORCE = process.env.FORCE === "1";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "application/json,image/*" };

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s = "") => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// ESPN's conference listing: names, group ids and (usually) a logo.
const listings = [];
for (const url of [
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard/conferences",
  "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard/conferences",
]) {
  try {
    const r = await fetch(url, { headers: UA });
    if (r.ok) {
      const j = await r.json();
      for (const c of j.conferences ?? []) listings.push(c);
      if (listings.length) break;
    }
  } catch {}
}
const listed = (name) => listings.find((c) => [c.name, c.shortName, c.label].some((n) => norm(n) === norm(name)));

// Conference ids on ESPN's CDN, used when the listing carries no logo link.
const NCAA_IDS = { SEC: 8, "Big Ten": 5, "Big 12": 4, ACC: 1, "Pac-12": 9, "Mountain West": 17, American: 151, "Sun Belt": 37, "Conference USA": 12, "Mid-American": 15 };
const candidates = (name) => {
  const out = [];
  const l = listed(name);
  if (l?.logo) out.push(l.logo);
  if (Array.isArray(l?.logos)) out.push(...l.logos.map((x) => x.href));
  const id = l?.groupId ?? NCAA_IDS[name];
  if (id) out.push(`https://a.espncdn.com/i/teamlogos/ncaa_conf/500/${id}.png`, `https://a.espncdn.com/i/teamlogos/ncaa_conf/500-dark/${id}.png`);
  if (name === "AFC" || name === "NFC") {
    const k = name.toLowerCase();
    out.push(`https://a.espncdn.com/i/teamlogos/nfl/500/${k}.png`, `https://a.espncdn.com/i/teamlogos/leagues/500/${k}.png`, `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${k}.png`);
  }
  return [...new Set(out)];
};

const report = { fetched: [], kept: [], missing: [] };
for (const [name, entry] of Object.entries(registry.conferences)) {
  if (entry.src && !FORCE) {
    report.kept.push(name);
    continue;
  }
  let done = false;
  for (const url of candidates(name)) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) continue;
      const file = `public/conf-logos/${slug(name)}.webp`;
      const info = await sharp(Buffer.from(await res.arrayBuffer()))
        .trim({ threshold: 1 })
        .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90, alphaQuality: 100 })
        .toFile(new URL(file, root).pathname);
      entry.src = `/${file.replace("public/", "")}`;
      entry.source = url;
      report.fetched.push(`${name} (${info.size} bytes) <- ${url}`);
      done = true;
      break;
    } catch {}
  }
  if (!done) report.missing.push(`${name}: tried ${candidates(name).join(" | ") || "no candidates"}`);
}
writeFileSync(jsonUrl, JSON.stringify(registry, null, 2) + "\n");
console.log(`ESPN listed ${listings.length} conferences.`);
console.log(`Fetched ${report.fetched.length}:\n  ${report.fetched.join("\n  ")}`);
console.log(`Kept (already have a logo) ${report.kept.length}: ${report.kept.join(", ")}`);
if (report.missing.length) {
  console.log(`NOT FOUND ${report.missing.length} (these keep their lettered badge):\n  ${report.missing.join("\n  ")}`);
  process.exitCode = 0;
}
