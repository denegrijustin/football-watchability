// The games still to play this regular season (ESPN scoreboard, one call per week), for the seed
// simulations in build-outlook.mjs. Writes data-raw/<league>-schedule.json. A fetch where any week fails
// leaves the previous file alone: a schedule with a week missing would quietly skew every team's odds.
//   RAW_DIR (default data-raw), ESPN_BASE (default ESPN's site API)
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const LEAGUES = {
  nfl: { name: "NFL", path: "nfl", weeks: 18, extra: "" },
  cfb: { name: "College", path: "college-football", weeks: 16, extra: "&groups=80&limit=300" }, // FBS games, including ones against FCS teams
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchSchedule(key) {
  const L = LEAGUES[key];
  const RAW = process.env.RAW_DIR ?? "data-raw";
  const dir = RAW.startsWith("/") ? `${RAW}/` : new URL(`../${RAW}/`, import.meta.url).pathname;
  const SITE = process.env.ESPN_BASE ?? "https://site.api.espn.com/apis/site/v2/sports/football";
  const { season } = JSON.parse(readFileSync(`${dir}index.json`, "utf8"));
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
  const failed = [];
  for (let week = 1; week <= L.weeks; week++) {
    const b = await get(`${SITE}/${L.path}/scoreboard?dates=${season}&seasontype=2&week=${week}${L.extra}`);
    if (!b?.events) {
      failed.push(week);
      if (failed.length >= 3 && failed.length === week) break; // ESPN is not answering: stop instead of retrying every week
      continue;
    }
    for (const e of b.events) {
      const c = e.competitions?.[0];
      if (!c || e.status?.type?.state === "post" || e.status?.type?.completed) continue; // already in the standings
      const home = c.competitors?.find((x) => x.homeAway === "home")?.team?.id;
      const away = c.competitors?.find((x) => x.homeAway === "away")?.team?.id;
      if (home && away) games.push({ week, date: e.date, home: String(home), away: String(away) });
    }
    await sleep(80);
  }
  const file = `${dir}${key}-schedule.json`;
  if (failed.length) {
    console.log(`${L.name} schedule: week${failed.length === 1 ? "" : "s"} ${failed.join(", ")} did not come back; ${existsSync(file) ? "keeping the saved file" : "no schedule saved"}.`);
  } else {
    writeFileSync(file, JSON.stringify({ season, fetchedAt: new Date().toISOString(), weeksRead: L.weeks, games }, null, 1) + "\n");
    console.log(`${L.name} schedule: ${games.length} games left across ${L.weeks} weeks.`);
  }
}
