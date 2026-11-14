// Writes src/data/team-alt.json: each team's second (alternate) color from ESPN's team lists, keyed by the logo slug the cards use, only for teams that have a logo (hex without the #).
// Run by hand when teams change: node scripts/build-team-alt.mjs
import { readFileSync, writeFileSync } from "node:fs";
const used = new Set(Object.keys(JSON.parse(readFileSync(new URL("../src/data/logos.json", import.meta.url), "utf8"))));
const slug = (n) => String(n).toLowerCase().replace("donkeys", "broncos").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const out = {};
for (const sport of ["nfl", "college-football"]) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams?limit=1000`);
  const teams = (await res.json()).sports[0].leagues[0].teams.map((t) => t.team);
  for (const t of teams) {
    const alt = t.alternateColor;
    if (!alt || !/^[0-9a-f]{6}$/i.test(alt)) continue;
    for (const k of [t.displayName, t.location, t.shortDisplayName]) if (k) { const key = slug(k); if (used.has(key)) out[key] ??= alt.toLowerCase(); }
  }
}
writeFileSync(new URL("../src/data/team-alt.json", import.meta.url), JSON.stringify(out));
console.log(Object.keys(out).length, "keys");
