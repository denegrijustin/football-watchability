// Head-to-head history for each game in data-raw/*-scoreboard.json, built
// from one team's ESPN schedules for past seasons (regular + postseason).
// Coverage starts in FIRST_SEASON, so records are "since FIRST_SEASON".
//
//   node scripts/fetch-history.mjs   (network required; run in Actions)
import { readFileSync, writeFileSync } from "node:fs";

const FIRST_SEASON = 2004;
const raw = new URL("../data-raw/", import.meta.url);
const read = (n) => JSON.parse(readFileSync(new URL(n, raw), "utf8"));
const { season } = read("index.json");
const LAST = Number(season);
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
async function get(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 fbwatch-slate-builder" } });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {}
    await sleep(600 * (a + 1));
  }
  errors.push(url);
  return null;
}

const jobs = [];
for (const [key, path] of [["nfl", "nfl"], ["cfb", "college-football"]]) {
  for (const ev of read(`${key}-scoreboard.json`).events ?? []) {
    const cs = ev.competitions[0].competitors;
    // Query the FBS/NFL side with the lower id; FCS schedules are sparse.
    const [a, b] = cs.map((c) => c.team.id);
    jobs.push({ key, path, eventId: ev.id, team: a, opp: b, alt: b, altOpp: a });
  }
}

const cache = new Map();
async function schedule(path, team, yr, type) {
  const k = `${path}/${team}/${yr}/${type}`;
  if (!cache.has(k))
    cache.set(k, get(`${SITE}/${path}/teams/${team}/schedule?season=${yr}&seasontype=${type}`));
  return cache.get(k);
}

const out = {};
let done = 0;
async function run(job) {
  const meetings = [];
  for (let yr = FIRST_SEASON; yr < LAST + 1; yr++) {
    for (const type of [2, 3]) {
      let s = await schedule(job.path, job.team, yr, type);
      let opp = job.opp;
      if (!s?.events?.length) {
        s = await schedule(job.path, job.alt, yr, type);
        opp = job.altOpp;
      }
      for (const e of s?.events ?? []) {
        const c = e.competitions?.[0];
        if (!c || !c.status?.type?.completed) continue;
        const ids = c.competitors.map((x) => x.team?.id ?? x.id);
        if (!ids.includes(opp)) continue;
        if (meetings.some((m) => m.id === e.id)) continue;
        meetings.push({
          id: e.id,
          date: e.date,
          season: yr,
          type,
          teams: c.competitors.map((x) => ({
            id: x.team?.id ?? x.id,
            abbr: x.team?.abbreviation,
            home: x.homeAway === "home",
            score: Number(x.score?.value ?? x.score?.displayValue ?? x.score),
            winner: !!x.winner,
          })),
        });
      }
    }
  }
  meetings.sort((x, y) => y.date.localeCompare(x.date));
  out[job.eventId] = meetings;
  if (++done % 10 === 0) console.log(`${done}/${jobs.length}`);
}

// Small worker pool.
const queue = [...jobs];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) await run(queue.shift());
  }),
);
writeFileSync(new URL("history.json", raw), JSON.stringify(out, null, 1));
writeFileSync(new URL("history-errors.json", raw), JSON.stringify(errors, null, 1));
console.log(`History for ${Object.keys(out).length} games, ${errors.length} failed requests`);
