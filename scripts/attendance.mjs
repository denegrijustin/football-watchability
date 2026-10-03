// Attendance and stadium capacity for finished games.
//
//   node scripts/attendance.mjs
//
// 1. src/data/results.json: archived games that don't have `attendance` yet get it (and `venueId`)
//    from ESPN's game summary (`gameInfo.attendance`, `gameInfo.venue.id`). Raw summaries in
//    RAW_DIR/<id>.json are read first, so nothing is fetched twice. Attendance is a number or null
//    (null once a game is 3+ days old and ESPN still has none); a missing key means "try again".
// 2. public/venues.json: { [venueId]: { name, capacity, checked } } from ESPN's venue endpoint, for
//    stadiums used by archived games that we haven't looked up. The page reads it at runtime to
//    turn attendance into a share of capacity. A capacity ESPN doesn't give is left null, never guessed.
//
// Safe to re-run, and a failed fetch never fails the run. RESULTS_FILE, VENUES_FILE, RAW_DIR,
// ESPN_BASE (site API) and ESPN_CORE_BASE (core API) override the defaults (the tests use them).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const RESULTS = process.env.RESULTS_FILE ?? new URL("src/data/results.json", root).pathname;
const VENUES = process.env.VENUES_FILE ?? new URL("public/venues.json", root).pathname;
const RAW = process.env.RAW_DIR ?? new URL("data-raw/summaries", root).pathname;
const SITE = process.env.ESPN_BASE ?? "https://site.api.espn.com";
const CORE = process.env.ESPN_CORE_BASE ?? "https://sports.core.api.espn.com";
const UA = "Mozilla/5.0 fbwatch-attendance";
const PATHS = { NFL: "nfl", CFB: "college-football" };
const DAY = 864e5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

async function getJson(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {
      /* try again, then give up quietly */
    }
    await sleep(400 * (attempt + 1));
  }
  return null;
}

const results = JSON.parse(readFileSync(RESULTS, "utf8"));
const venues = existsSync(VENUES) ? JSON.parse(readFileSync(VENUES, "utf8")) : {};

// ---------- 1. attendance ----------
let filled = 0;
let gaveUp = 0;
for (const g of results.games) {
  if (g.attendance !== undefined) continue;
  const rawFile = `${RAW}/${g.espnId}.json`;
  const summary = existsSync(rawFile)
    ? JSON.parse(readFileSync(rawFile, "utf8"))
    : await getJson(`${SITE}/apis/site/v2/sports/football/${PATHS[g.league]}/summary?event=${g.espnId}`);
  if (!existsSync(rawFile)) await sleep(120);
  const info = summary?.gameInfo;
  const count = Number(info?.attendance);
  if (info?.venue?.id) g.venueId = String(info.venue.id);
  if (Number.isFinite(count) && count > 0) {
    g.attendance = Math.round(count);
    filled++;
  } else if (summary && Date.now() - Date.parse(g.date) > 3 * DAY) {
    g.attendance = null; // ESPN never published one for this game; stop asking
    gaveUp++;
  }
}

// ---------- 2. stadium capacity ----------
let looked = 0;
const wanted = new Map();
for (const g of results.games) if (g.venueId && g.attendance) wanted.set(g.venueId, g.league);
for (const [id, league] of wanted) {
  const known = venues[id];
  const stale = known && known.capacity == null && Date.now() - Date.parse(known.checked ?? 0) > 14 * DAY;
  if (known && !stale) continue;
  const v = await getJson(`${CORE}/v2/sports/football/leagues/${PATHS[league]}/venues/${id}`);
  await sleep(120);
  if (!v) continue; // unreachable: look again next run
  const capacity = Number(v.capacity);
  venues[id] = { name: v.fullName ?? known?.name ?? "", capacity: Number.isFinite(capacity) && capacity > 0 ? Math.round(capacity) : null, checked: today };
  looked++;
}

writeFileSync(RESULTS, JSON.stringify(results, null, 1) + "\n");
const sorted = Object.fromEntries(Object.entries(venues).sort(([a], [b]) => Number(a) - Number(b)));
writeFileSync(VENUES, JSON.stringify(sorted, null, 1) + "\n");
const withAtt = results.games.filter((g) => g.attendance).length;
const withCap = results.games.filter((g) => g.attendance && venues[g.venueId]?.capacity).length;
console.log(
  `Attendance: ${filled} added${gaveUp ? `, ${gaveUp} unavailable` : ""}; ${withAtt} of ${results.games.length} games have it. ` +
    `Capacity: ${looked} venues looked up; ${withCap} of ${withAtt} games can show a share of capacity.`,
);
