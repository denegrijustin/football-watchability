// Writes src/data/finals.json: every finished regular-season FBS and NFL game this season (ESPN scoreboards, one call per
// week, plus the last few days by date so a game that ended minutes ago is in). A week that fails to load is skipped and the
// finals already saved stay; the file is only replaced when at least one league answered.
//   node scripts/fetch-finals.mjs          ESPN_BASE overrides ESPN's site API (used by the tests)
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { LEAGUES, SITE, etYmd, getJson, mergeFinals, parseFinal, seasonOf } from "./finals-lib.mjs";

const OUT = new URL("../src/data/finals.json", import.meta.url);
const season = Number(process.env.SEASON) || seasonOf();
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { games: [] };
const prior = previous.season === season ? previous.games : [];
const fresh = [];
let answered = 0, failed = 0;
for (const [league, L] of Object.entries(LEAGUES)) {
  for (let week = 1; week <= L.weeks; week++) {
    const body = await getJson(`${SITE}/${L.path}/scoreboard?dates=${season}&seasontype=2&week=${week}${L.extra}`);
    if (!body?.events) { failed++; if (failed >= 3 && !answered) break; continue; }
    answered++;
    for (const e of body.events) { const g = parseFinal(league, e); if (g) fresh.push(g); }
  }
  // The last three days by date, in case ESPN's week listing has not caught up with a game that just ended.
  for (let back = 0; back < 3; back++) {
    const ymd = etYmd(new Date(Date.now() - back * 864e5));
    const body = await getJson(`${SITE}/${L.path}/scoreboard?dates=${ymd}${L.extra}`);
    if (!body?.events) continue;
    answered++;
    for (const e of body.events) { const g = parseFinal(league, e); if (g) fresh.push(g); }
  }
}
if (!answered) { console.error("ESPN did not answer; keeping the saved finals."); process.exit(0); }
const games = mergeFinals(prior, fresh);
const tmp = new URL("../src/data/finals.json.tmp", import.meta.url);
writeFileSync(tmp, JSON.stringify({ updated: new Date().toISOString(), season, games }));
renameSync(tmp, OUT);
console.log(`finals: ${games.length} games (${games.filter((g) => g.l === "cfb").length} college, ${games.filter((g) => g.l === "nfl").length} NFL), ${fresh.length} read this run${failed ? `, ${failed} week(s) failed` : ""}`);
