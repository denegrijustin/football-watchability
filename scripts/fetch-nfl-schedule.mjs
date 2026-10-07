// The NFL games still to play this regular season (ESPN scoreboard, one call per week), for the
// seed simulation in build-outlook.mjs. Writes data-raw/nfl-schedule.json; if ESPN gives nothing it
// leaves the previous file alone. Run in GitHub Actions.
//   RAW_DIR (default data-raw), ESPN_BASE (default ESPN's site API)
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const RAW = process.env.RAW_DIR ?? "data-raw";
const dir = RAW.startsWith("/") ? `${RAW}/` : new URL(`../${RAW}/`, import.meta.url).pathname;
const SITE = process.env.ESPN_BASE ?? "https://site.api.espn.com/apis/site/v2/sports/football";
const { season } = JSON.parse(readFileSync(`${dir}index.json`, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 fbwatch-slate-builder" }, signal: AbortSignal.timeout(15000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {}
    await sleep(400 * (a + 1));
  }
  return null;
}

const games = [];
let weeksRead = 0;
let misses = 0;
for (let week = 1; week <= 18; week++) {
  const b = await get(`${SITE}/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`);
  if (!b?.events) {
    if (++misses >= 3 && !weeksRead) break; // ESPN is not answering: stop instead of retrying all 18 weeks
    continue;
  }
  weeksRead++;
  for (const e of b.events) {
    const c = e.competitions?.[0];
    if (!c || e.status?.type?.state === "post" || e.status?.type?.completed) continue; // already in the standings
    const home = c.competitors?.find((x) => x.homeAway === "home")?.team?.id;
    const away = c.competitors?.find((x) => x.homeAway === "away")?.team?.id;
    if (home && away) games.push({ week, date: e.date, home: String(home), away: String(away) });
  }
  await sleep(80);
}
const file = `${dir}nfl-schedule.json`;
if (weeksRead < 10) {
  console.log(`NFL schedule: only ${weeksRead} of 18 weeks came back; ${existsSync(file) ? "keeping the saved file" : "no schedule saved"}.`);
} else {
  writeFileSync(file, JSON.stringify({ season, fetchedAt: new Date().toISOString(), weeksRead, games }, null, 1) + "\n");
  console.log(`NFL schedule: ${games.length} games left across ${weeksRead} weeks.`);
}
