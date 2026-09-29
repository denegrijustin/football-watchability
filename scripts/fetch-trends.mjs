// This season's results for every team on the slate (ESPN team schedules),
// used for the per-game trend charts. Reads data-raw/*-scoreboard.json,
// writes data-raw/trends.json. Run in GitHub Actions.
//
//   node scripts/fetch-trends.mjs
import { readFileSync, writeFileSync } from "node:fs";

const raw = new URL(`../${process.env.RAW_DIR ?? "data-raw"}/`, import.meta.url);
const read = (n) => JSON.parse(readFileSync(new URL(n, raw), "utf8"));
const { season } = read("index.json");
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
async function get(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 fbwatch-slate-builder" } });
      if (res.ok) return await res.json();
      if (res.status === 404) break;
    } catch {}
    await sleep(600 * (a + 1));
  }
  errors.push(url);
  return null;
}

const out = { season, fetchedAt: new Date().toISOString(), teams: {} };
for (const [key, path] of [["nfl", "nfl"], ["cfb", "college-football"]]) {
  const ids = new Set();
  for (const ev of read(`${key}-scoreboard.json`).events ?? [])
    for (const c of ev.competitions[0].competitors) ids.add(c.team.id);
  for (const id of ids) {
    const games = [];
    for (const type of [2, 3]) {
      const s = await get(`${SITE}/${path}/teams/${id}/schedule?season=${season}&seasontype=${type}`);
      for (const e of s?.events ?? []) {
        const c = e.competitions?.[0];
        if (!c?.status?.type?.completed) continue;
        const me = c.competitors.find((x) => (x.team?.id ?? x.id) === id);
        const opp = c.competitors.find((x) => (x.team?.id ?? x.id) !== id);
        if (!me || !opp) continue;
        const score = (x) => Number(x.score?.value ?? x.score?.displayValue ?? x.score);
        games.push({
          date: e.date,
          week: e.week?.number ?? null,
          type,
          home: me.homeAway === "home",
          neutral: !!c.neutralSite,
          opp: {
            id: opp.team?.id ?? opp.id,
            name: opp.team?.location ?? opp.team?.displayName,
            abbr: opp.team?.abbreviation,
            rank: opp.curatedRank?.current && opp.curatedRank.current <= 25 ? opp.curatedRank.current : null,
          },
          pf: score(me),
          pa: score(opp),
        });
      }
      await sleep(80);
    }
    games.sort((a, b) => a.date.localeCompare(b.date));
    out.teams[`${key}:${id}`] = games;
  }
}
writeFileSync(new URL("trends.json", raw), JSON.stringify(out, null, 1));
writeFileSync(new URL("trends-errors.json", raw), JSON.stringify(errors, null, 1));
console.log(`Trends for ${Object.keys(out.teams).length} teams; ${errors.length} errors`);
